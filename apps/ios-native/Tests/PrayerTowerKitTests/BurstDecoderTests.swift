import Foundation
import Testing
@testable import PrayerTowerKit

// The native decoder against recordings made by the station's encoder (apps/station,
// scripts/build-native-fixtures.ts): a burst on every preset, and noisy, fading, drifting and
// clipped ones from the robustness suite. The station's own decoder is held to the same
// manifest (apps/station/test/native-fixtures.test.ts).

struct BurstFixture: Decodable, Sendable, CustomTestStringConvertible {
    let file: String
    let preset: String
    let condition: String
    let searchHz: Int
    let callSign: String
    let via: String?
    let codec: Int
    let prayers: [String]
    var testDescription: String { file }

    static let all: [BurstFixture] = {
        guard let url = Bundle.module.url(forResource: "manifest", withExtension: "json", subdirectory: "Fixtures/bursts"),
              let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([BurstFixture].self, from: data)) ?? []
    }()

    func samples() throws -> (samples: [Float], rate: Int) {
        let url = try #require(Bundle.module.url(forResource: file, withExtension: nil, subdirectory: "Fixtures/bursts"))
        return try #require(WAV.read(try Data(contentsOf: url)))
    }
}

@Suite struct BurstDecoderTests {
    @Test func theFixturesAreThere() {
        #expect(BurstFixture.all.count >= 20)
        #expect(Set(BurstFixture.all.map(\.condition)) == ["clean", "noise", "fading", "drift", "clipping"])
    }

    @Test(arguments: BurstFixture.all)
    func decodesWhatTheStationSent(_ f: BurstFixture) throws {
        let (samples, rate) = try f.samples()
        let heard = BurstDecoder.decode(samples, rate: rate, searchHz: f.searchHz)
        #expect(heard.count == 1)
        let frame = try #require(heard.first)
        #expect(frame.callSign == f.callSign)
        #expect(frame.preset == f.preset)
        #expect(frame.via == f.via)
        #expect(frame.codec == f.codec)
        #expect(frame.prayers == f.prayers)
        #expect(frame.snrDb > 3)
    }

    @Test func aRecordingAtAnotherRateDecodesToo() throws {
        let f = try #require(BurstFixture.all.first { $0.file == "clean-fm-standard.wav" })
        let (samples, rate) = try f.samples()
        let heard = BurstDecoder.decode(BurstDecoder.resample(samples, from: rate, to: 44_100), rate: 44_100)
        #expect(heard.first?.prayers == f.prayers)
    }

    @Test func silenceAndNoiseDecodeToNothing() {
        #expect(BurstDecoder.decode([Float](repeating: 0, count: 48_000), rate: 48_000).isEmpty)
        var x: UInt32 = 1
        let noise = (0..<96_000).map { _ -> Float in
            x ^= x << 13; x ^= x >> 17; x ^= x << 5
            return Float(Int32(bitPattern: x)) / Float(Int32.max) * 0.3
        }
        #expect(BurstDecoder.decode(noise, rate: 48_000).isEmpty)
    }

    @Test func theListenerShowsEachFrameOnceAsAudioArrives() throws {
        let a = try #require(BurstFixture.all.first { $0.file == "clean-fm-robust.wav" })
        let b = try #require(BurstFixture.all.first { $0.file == "codec4-fm-standard.wav" })
        var listener = BurstListener(rate: 48_000)
        var shown: [HeardFrame] = []
        for audio in [try a.samples().samples, try b.samples().samples] {
            for chunk in stride(from: 0, to: audio.count, by: 9_600) {
                listener.push(Array(audio[chunk..<min(audio.count, chunk + 9_600)]))
                shown += listener.decode()
            }
        }
        shown += listener.decode()
        #expect(shown.map(\.callSign) == ["N0CALL", "K0GIN"])
        #expect(listener.meter >= 0)
    }

    @Test func aSignalReportCarriesFingerprintsNeverWords() throws {
        let f = try #require(BurstFixture.all.first { $0.file == "clean-fm-qam16.wav" })
        let frame = try #require(BurstDecoder.decode(try f.samples().samples, rate: 48_000).first)
        let report = try #require(BurstDecoder.report(frame))
        #expect(report.callSign == "N0CALL" && report.preset == "fm-qam16")
        #expect(report.hashes.count == 3)
        #expect(report.hashes.allSatisfy { $0.count == 32 && $0.allSatisfy(\.isHexDigit) })
        let body = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)
        #expect(!body.contains("surgery"))
    }

    @Test func fingerprintsMatchTheStations() {
        // SHA-256 of "abc" (FIPS 180-4 example), first 16 bytes.
        #expect(BurstDecoder.fingerprint("abc") == "ba7816bf8f01cfea414140de5dae2223")
        #expect(BurstDecoder.fingerprint("") == "e3b0c44298fc1c149afbf4c8996fb924")
    }
}

@Suite struct ListenModeTests {
    @Test func theSampleBurstDecodesWithNoServer() throws {
        let burst = try #require(BurstDecoder.sampleBurst())
        let frame = try #require(BurstDecoder.decode(burst.samples, rate: burst.rate).first)
        #expect(frame.prayers?.count == 3)
        // The sample plays in Open Circle too, so it has no religious words.
        for word in ["pray", "God", "bless", "Lord"] { #expect(!(frame.prayers ?? []).joined().localizedCaseInsensitiveContains(word)) }
        #expect(ListenConfig.sample.enabled && ListenConfig.sample.receipts)
    }

    @Test func listenWordsExist() {
        for key in ["listen.title", "listen.input", "listen.inputDefault", "listen.inputHint", "listen.sample", "listen.sampleNote", "listen.report", "listen.tell"] {
            #expect(Words(.faith)(key) != key, "\(key)")
            #expect(Words(.neutral)(key) != key, "\(key)")
        }
    }
}

extension APIClientTests {
    @Test func readsTheListenSwitchSignedInOrOut() async throws {
        StubProtocol.answer = (200, #"{"enabled":true,"receipts":false}"#)
        #expect(try await client().listenConfig() == ListenConfig(enabled: true, receipts: false))
        #expect(StubProtocol.seen.last?.url?.path == "/radio/listen")
        _ = try await client().listenConfig(signedIn: false)
        #expect(StubProtocol.seen.last?.url?.path == "/listen/config")
    }

    @Test func sendsASignalReport() async throws {
        StubProtocol.answer = (200, #"{"matched":2}"#)
        let report = ListenHeardReport(callSign: "N0CALL", preset: "fm-standard", snrDb: 14.5, hashes: [BurstDecoder.fingerprint("abc")])
        #expect(try await client().listenHeard(report) == 2)
        let req = try #require(StubProtocol.seen.last)
        #expect(req.httpMethod == "POST" && req.url?.path == "/listen/heard")
        let sent = try JSONDecoder().decode(ListenHeardReport.self, from: try #require(req.httpBody))
        #expect(sent == report)
    }
}

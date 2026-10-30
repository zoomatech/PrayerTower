import Foundation
import Testing
@testable import PrayerTowerKit

// The prayer panel natively: the station's own panel (context-mixing codec) and its noisy SSTV
// recording (Fixtures/panel, from apps/station/scripts/build-panel-fixtures.ts) read back to the
// same prayers, and a panel drawn here reads back from a picture of it, any way up.

private struct PanelFixture: Decodable {
    let callSign: String
    let prayers: [String]
    let cells: String
    let sstv: String

    static func load() throws -> PanelFixture {
        let url = try #require(Bundle.module.url(forResource: "panel", withExtension: "json", subdirectory: "Fixtures/panel"))
        return try JSONDecoder().decode(PanelFixture.self, from: Data(contentsOf: url))
    }
}

/// The cells as a picture: `scale` pixels a cell, a white margin, optionally upside down.
private func picture(_ cells: [UInt8], scale: Int = 5, margin: Int = 30, upsideDown: Bool = false) -> (gray: [UInt8], width: Int, height: Int) {
    let w = PrayerPanel.width * scale + 2 * margin, h = PrayerPanel.height * scale + 2 * margin
    var gray = [UInt8](repeating: 230, count: w * h)
    for y in 0..<(PrayerPanel.height * scale) {
        for x in 0..<(PrayerPanel.width * scale) where cells[(y / scale) * PrayerPanel.width + x / scale] != 0 {
            let (px, py) = upsideDown ? (w - 1 - (x + margin), h - 1 - (y + margin)) : (x + margin, y + margin)
            gray[py * w + px] = 25
        }
    }
    return (gray, w, h)
}

@Suite struct PanelTests {
    @Test func readsTheStationsPanel() throws {
        let f = try PanelFixture.load()
        let r = try #require(PrayerPanel.read(cells: f.cells.map { $0 == "1" ? 1 : 0 }))
        #expect(r.callSign == f.callSign)
        #expect(r.prayers == f.prayers)
        #expect(!r.corrected)
    }

    @Test func readsTheStationsSstvRecording() throws {
        let f = try PanelFixture.load()
        let url = try #require(Bundle.module.url(forResource: f.sstv, withExtension: nil, subdirectory: "Fixtures/panel"))
        let wav = try #require(WAV.read(try Data(contentsOf: url)))
        let heard = try #require(Robot36.readPanel(wav.samples, rate: wav.rate))
        #expect(heard.panel?.callSign == f.callSign)
        #expect(heard.panel?.prayers == f.prayers)
        // The picture ends about a second before the recording does.
        #expect(abs(heard.end - (wav.samples.count - wav.rate)) < wav.rate / 10)
    }

    @Test func theListenerReadsEachPictureOnce() throws {
        let f = try PanelFixture.load()
        let url = try #require(Bundle.module.url(forResource: f.sstv, withExtension: nil, subdirectory: "Fixtures/panel"))
        let wav = try #require(WAV.read(try Data(contentsOf: url)))
        var l = SstvListener(rate: wav.rate)
        l.push(Array(wav.samples.prefix(10 * wav.rate)))
        let early = l.read()
        #expect(early == nil)
        var at = 10 * wav.rate
        while at < wav.samples.count {
            l.push(Array(wav.samples[at..<min(at + 4096, wav.samples.count)]))
            at += 4096
        }
        let first = l.read()
        let heard = try #require(first)
        #expect(heard.panel?.prayers == f.prayers)
        let again = l.read()
        #expect(again == nil)
        let frame = HeardFrame.sstv(try #require(heard.panel), end: heard.end)
        #expect(frame.preset == "sstv-robot36" && frame.callSign == "N0CALL")
    }

    @Test func drawsAPanelThatReadsBack() throws {
        let (cells, count) = PrayerPanel.draw(PanelDemo.prayers, callSign: "kd9xyz")
        #expect(count == PanelDemo.prayers.count)
        #expect(cells.count == 80 * 60)
        // The quiet zone is white and the frame black.
        #expect(cells[0] == 0 && cells[80 + 1] == 1 && cells[2 * 80 + 2] == 1)
        let r = try #require(PrayerPanel.read(cells: cells))
        #expect(r.callSign == "KD9XYZ" && r.prayers == PanelDemo.prayers)
        for upsideDown in [false, true] {
            let p = picture(cells, upsideDown: upsideDown)
            #expect(PrayerPanel.read(gray: p.gray, width: p.width, height: p.height)?.prayers == PanelDemo.prayers)
        }
    }

    @Test func fitsWhatItCanAndCorrectsDamage() throws {
        let many = (1...40).map { "Prayer number \($0) for a neighbour who needs a hand this week." }
        let (cells, count) = PrayerPanel.draw(many, callSign: "N0CALL")
        #expect(count > 3 && count < 40)
        var damaged = cells
        // Twenty cells in the payload.
        for i in (20 * 80 + 10)..<(20 * 80 + 30) { damaged[i] ^= 1 }
        let r = try #require(PrayerPanel.read(cells: damaged))
        #expect(r.corrected && r.prayers == Array(many.prefix(count)))
        // A blank picture or noise has no panel.
        #expect(PrayerPanel.read(gray: [UInt8](repeating: 200, count: 320 * 240), width: 320, height: 240) == nil)
        var seed: UInt32 = 1
        let noise = (0..<(320 * 240)).map { _ in seed = seed &* 1_664_525 &+ 1_013_904_223; return UInt8(seed >> 24) }
        #expect(PrayerPanel.read(gray: noise, width: 320, height: 240) == nil)
        #expect(Robot36.decode([Float](repeating: 0, count: 48_000), rate: 48_000) == nil)
    }

    /// Fuzzing, as apps/station/test/fuzz.test.ts: a crash here would close the app, so odd input must
    /// come back as nil (or the prayers that were sent), never trap.
    @Test func oddPicturesAndAudioNeverCrashOrReadAnotherPrayer() throws {
        var seed: UInt32 = 7
        func next() -> UInt32 { seed = seed &* 1_664_525 &+ 1_013_904_223; return seed }
        for _ in 0..<100 {
            let cells = (0..<(80 * 60)).map { _ in UInt8(next() >> 31) }
            #expect(PrayerPanel.read(cells: cells) == nil)
        }
        #expect(PrayerPanel.read(cells: []) == nil)
        #expect(PrayerPanel.read(cells: [UInt8](repeating: 1, count: 80 * 60 + 1)) == nil)
        let (cells, _) = PrayerPanel.draw(PanelDemo.prayers, callSign: "N0FUZ")
        var read = 0
        for _ in 0..<150 {
            var bad = cells
            for _ in 0..<Int(next() % 150) { bad[Int(next() % UInt32(bad.count))] ^= 1 }
            if let r = PrayerPanel.read(cells: bad) {
                #expect(r.callSign == "N0FUZ" && r.prayers == PanelDemo.prayers)
                read += 1
            }
        }
        #expect(read > 10 && read < 150)
        for (w, h) in [(0, 0), (1, 1), (3, 2), (80, 60), (1000, 3), (3, 1000), (-5, 4)] {
            let n = max(0, w * h)
            #expect(PrayerPanel.read(gray: (0..<n).map { _ in UInt8(next() >> 24) }, width: w, height: h) == nil)
            #expect(PrayerPanel.read(gray: [UInt8](repeating: 0, count: n / 2), width: w, height: h) == nil)
        }
        for audio in [[Float](), [Float](repeating: 0, count: 10), [Float](repeating: .nan, count: 60_000), [Float](repeating: .infinity, count: 60_000),
                      (0..<(12_000 * 40)).map { _ in Float(Int32(bitPattern: next())) / Float(Int32.max) }] {
            #expect(Robot36.decode(audio, rate: 12_000) == nil)
        }
        #expect(Robot36.decode([Float](repeating: 0, count: 100), rate: 0) == nil)
    }

    @Test func foldsAsTheStationDoes() {
        #expect(PrayerPanel.fold("Pray for José’s “recovery” — today") == "Pray for Jose's \"recovery\" - today")
    }

    @Test func readsTheServersAnswers() throws {
        let l = try JSONDecoder().decode(PanelLatest.self, from: Data(#"{"callSign":"KD9XYZ","prayers":["Pray for rain."],"at":"2026-10-30T01:00:00Z"}"#.utf8))
        #expect(l.prayers == ["Pray for rain."])
        let c = try JSONDecoder().decode(ListenConfig.self, from: Data(#"{"enabled":true,"receipts":false,"panel":true}"#.utf8))
        #expect(c.panel == true)
        #expect(try JSONDecoder().decode(ListenConfig.self, from: Data(#"{"enabled":true,"receipts":false}"#.utf8)).panel == nil)
    }
}

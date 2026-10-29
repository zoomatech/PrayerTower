import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Native listener mode (docs/RADIO_BURST.md, "Receiving"; the Expo Listen screen): off until Admin →
// Radio turns the listening page on. The server says whether it's open, and whether a listener may
// send a signal report (fingerprints of what it heard, never the words) while receipts are on.

/// `GET /radio/listen` (signed in) or `GET /listen/config` (signed out).
public struct ListenConfig: Codable, Sendable, Equatable {
    public let enabled: Bool
    public let receipts: Bool
    public let prayingToo: Bool?
    /// The listener may have decoded prayers read aloud with the device's own speech (Admin → Radio).
    public let readAloud: Bool?

    public init(enabled: Bool, receipts: Bool, prayingToo: Bool? = nil, readAloud: Bool? = nil) {
        self.enabled = enabled
        self.receipts = receipts
        self.prayingToo = prayingToo
        self.readAloud = readAloud
    }

    /// Sample data: open, with reports shown but never sent, and reading aloud offered.
    public static let sample = ListenConfig(enabled: true, receipts: true, readAloud: true)
}

/// What the Listen screen reads aloud from new frames: each prayer once, in order (an amplified
/// prayer comes several times in one burst).
public enum ReadAloud {
    public static func lines(_ frames: [HeardFrame]) -> [String] {
        var seen = Set<String>()
        return frames.flatMap { $0.prayers ?? [] }.filter { seen.insert($0).inserted }
    }
}

private struct Matched: Decodable { let matched: Int }

extension APIClient {
    public func listenConfig(signedIn: Bool = true) async throws -> ListenConfig { try await get(signedIn ? "/radio/listen" : "/listen/config") }
    /// A signal report: the frame's call sign, preset, SNR and prayer fingerprints. Returns how many matched a sent prayer.
    public func listenHeard(_ report: ListenHeardReport) async throws -> Int { try await (post("/listen/heard", body: report) as Matched).matched }
}

extension BurstDecoder {
    /// A short recorded burst (fm-standard, three prayers) for trying the Listen screen with no radio.
    public static func sampleBurst() -> (samples: [Float], rate: Int)? {
        guard let url = Bundle.module.url(forResource: "sample-burst", withExtension: "wav", subdirectory: "Resources"),
              let data = try? Data(contentsOf: url) else { return nil }
        return WAV.read(data)
    }
}

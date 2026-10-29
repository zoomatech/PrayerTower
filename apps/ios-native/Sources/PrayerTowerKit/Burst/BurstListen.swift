import Foundation

// Native listener mode's decoder (docs/RADIO_BURST.md, "Receiving"): the same steps as the /listen
// page and the Expo Listen screen (apps/station/src/burst/web.ts, apps/mobile/src/lib/burst-listen.ts),
// in Swift. The audio never leaves the device; with receipts on, only fingerprints go back.

/// One frame heard: who sent it, how strong it was, and its prayers.
public struct HeardFrame: Sendable, Identifiable {
    public var id: String { "\(callSign)-\(start)-\(end)" }
    public let callSign: String
    public let preset: String
    public let snrDb: Double
    public let corrected: Bool
    /// The prayers, or nil when the frame used a codec this decoder can't unpack (DEFLATE or Brotli).
    public let prayers: [String]?
    public let codec: Int
    /// A relay re-sent it: `callSign` is the station it came from, `via` the relay, after `hops` hops.
    public let via: String?
    public let hops: Int?
    /// Where the frame started and ended, in 48 kHz samples from the start of the audio given.
    public let start: Int
    public let end: Int
}

public enum BurstDecoder {
    public static let sampleRate = 48_000

    /// Decode every frame in mono audio recorded at `rate` samples a second. searchHz: allow an HF (SSB)
    /// receiver tuned up to this far off (slower).
    public static func decode(_ samples: [Float], rate: Int, searchHz: Int = 0) -> [HeardFrame] {
        OFDM.demodulate(resample(samples, from: rate, to: sampleRate), searchHz: searchHz).map { f in
            let relayed = Relay.unwrap(f.batch)
            let inner = relayed?.inner ?? f.batch
            return HeardFrame(callSign: relayed?.origin ?? f.callSign, preset: f.preset, snrDb: f.snrDb, corrected: f.corrected, prayers: unpack(inner),
                              codec: inner.first.map(Int.init) ?? -1, via: relayed == nil ? nil : f.callSign, hops: relayed?.hops, start: f.start, end: f.end)
        }
    }

    static func unpack(_ batch: [UInt8]) -> [String]? {
        guard let codec = batch.first else { return nil }
        let body = batch[1...]
        let bytes: [UInt8]
        switch codec {
        case 0: bytes = Array(body)
        case 3: guard let b = CM.decompress(body, v: 1) else { return nil }; bytes = b
        case 4: guard let b = CM.decompress(body, v: 2) else { return nil }; bytes = b
        default: return nil
        }
        let text = String(latin1: bytes)
        return text.isEmpty ? [] : text.components(separatedBy: "\n")
    }

    /// Linear interpolation, as the station's wav.ts resample.
    public static func resample(_ x: [Float], from: Int, to: Int) -> [Float] {
        if from == to { return x }
        let count = x.count * to / from
        return (0..<count).map { i in
            let t = Double(i) * Double(from) / Double(to)
            let a = Int(t.rounded(.down))
            let f = t - Double(a)
            let xa = a < x.count ? Double(x[a]) : 0
            let xb = a + 1 < x.count ? Double(x[a + 1]) : 0
            return Float(xa * (1 - f) + xb * f)
        }
    }

    /// A prayer's receipt fingerprint: the first 32 hex digits of SHA-256 of its UTF-8 text.
    public static func fingerprint(_ text: String) -> String {
        SHA256.hash(Array(text.utf8)).prefix(16).map { String(format: "%02x", $0) }.joined()
    }

    /// The report a signal report sends (`POST /listen/heard`): fingerprints only, never the words.
    public static func report(_ f: HeardFrame) -> ListenHeardReport? {
        guard let prayers = f.prayers, !prayers.isEmpty else { return nil }
        var seen = Set<String>()
        let unique = prayers.filter { seen.insert($0).inserted }.prefix(500)
        return ListenHeardReport(callSign: f.callSign, preset: f.preset, snrDb: (f.snrDb * 10).rounded() / 10, hashes: unique.map(fingerprint))
    }
}

/// `POST /listen/heard`: a listener heard these prayers.
public struct ListenHeardReport: Codable, Sendable, Equatable {
    public let callSign: String
    public let preset: String
    public let snrDb: Double
    public let hashes: [String]
}

/// The Listen screen's decoding loop: keep the last 24 seconds of audio, decode it every couple of
/// seconds, and hand back only frames that end after the last one shown (burst-listen.ts).
public struct BurstListener: Sendable {
    public static let keepSeconds = 24
    public let rate: Int
    private var chunks: [[Float]] = []
    private var total = 0
    private var dropped = 0
    private var decodedUpTo = 0
    /// Loudness of the latest audio, 0 to 1, for the meter.
    public private(set) var meter: Float = 0

    public init(rate: Int) { self.rate = rate }

    public mutating func push(_ samples: [Float]) {
        guard !samples.isEmpty else { return }
        chunks.append(samples)
        total += samples.count
        var sum: Float = 0
        for s in samples { sum += s * s }
        meter = min(1, (sum / Float(samples.count)).squareRoot() * 4)
    }

    public mutating func decode(searchHz: Int = 0) -> [HeardFrame] {
        guard total > 0 else { return [] }
        let buf = chunks.flatMap { $0 }
        let from = max(0, decodedUpTo - dropped)
        var fresh: [HeardFrame] = []
        for f in BurstDecoder.decode(Array(buf[min(from, buf.count)...]), rate: rate, searchHz: searchHz) {
            let end = dropped + from + jsRound(Double(f.end) * Double(rate) / Double(BurstDecoder.sampleRate))
            if end <= decodedUpTo { continue }
            decodedUpTo = end
            fresh.append(f)
        }
        while chunks.count > 1 && total - chunks[0].count > Self.keepSeconds * rate {
            let first = chunks.removeFirst()
            total -= first.count
            dropped += first.count
        }
        return fresh
    }
}

/// 8/16/24/32-bit PCM or 32/64-bit float WAV files, mixed to mono (the station's wav.ts fromWav).
public enum WAV {
    public static func read(_ data: Data) -> (samples: [Float], rate: Int)? {
        let b = [UInt8](data)
        func u16(_ i: Int) -> Int { Int(b[i]) | Int(b[i + 1]) << 8 }
        func u32(_ i: Int) -> Int { u16(i) | u16(i + 2) << 16 }
        guard b.count >= 12, b[0..<4] == [0x52, 0x49, 0x46, 0x46], b[8..<12] == [0x57, 0x41, 0x56, 0x45] else { return nil }
        var at = 12
        var format = 0, channels = 0, rate = 0, bits = 0
        while at + 8 <= b.count {
            let id = String(latin1: b[at..<(at + 4)])
            let size = u32(at + 4)
            let body = at + 8
            if id == "fmt ", body + 16 <= b.count {
                format = u16(body)
                channels = u16(body + 2)
                rate = u32(body + 4)
                bits = u16(body + 14)
                if format == 0xfffe, body + 26 <= b.count { format = u16(body + 24) }
            } else if id == "data" {
                guard channels > 0, rate > 0 else { return nil }
                guard format == 1 || format == 3, (format == 1 ? [8, 16, 24, 32] : [32, 64]).contains(bits) else { return nil }
                let width = bits / 8
                let frames = min(size, b.count - body) / (width * channels)
                var out = [Float](repeating: 0, count: frames)
                for i in 0..<frames {
                    var sum = 0.0
                    for ch in 0..<channels {
                        let p = body + (i * channels + ch) * width
                        switch (format, bits) {
                        case (3, 32): sum += Double(Float(bitPattern: UInt32(u32(p))))
                        case (3, _):
                            var v: UInt64 = 0
                            for k in 0..<8 { v |= UInt64(b[p + k]) << (8 * k) }
                            sum += Double(bitPattern: v)
                        case (_, 16): sum += Double(Int16(bitPattern: UInt16(u16(p)))) / 32768
                        case (_, 24): sum += Double(Int32(bitPattern: UInt32(u16(p) << 8 | Int(b[p + 2]) << 24)) >> 8) / 8_388_608
                        case (_, 32): sum += Double(Int32(bitPattern: UInt32(u32(p)))) / 2_147_483_648
                        default: sum += (Double(b[p]) - 128) / 128
                        }
                    }
                    out[i] = Float(sum / Double(channels))
                }
                return (out, rate)
            }
            at = body + size + (size & 1)
        }
        return nil
    }
}

/// SHA-256 (FIPS 180-4) in plain Swift, as the station's sha256.ts, so it runs everywhere the decoder does.
enum SHA256 {
    private static let k: [UInt32] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]

    static func hash(_ data: [UInt8]) -> [UInt8] {
        var msg = data
        let bitLen = UInt64(data.count) * 8
        msg.append(0x80)
        while msg.count % 64 != 56 { msg.append(0) }
        for i in stride(from: 56, through: 0, by: -8) { msg.append(UInt8(truncatingIfNeeded: bitLen >> UInt64(i))) }
        var h: [UInt32] = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
        func rotr(_ x: UInt32, _ n: UInt32) -> UInt32 { (x >> n) | (x << (32 - n)) }
        var w = [UInt32](repeating: 0, count: 64)
        for off in stride(from: 0, to: msg.count, by: 64) {
            for i in 0..<16 { w[i] = (0..<4).reduce(UInt32(0)) { $0 << 8 | UInt32(msg[off + i * 4 + $1]) } }
            for i in 16..<64 {
                let a = w[i - 15], b = w[i - 2]
                w[i] = w[i - 16] &+ (rotr(a, 7) ^ rotr(a, 18) ^ (a >> 3)) &+ w[i - 7] &+ (rotr(b, 17) ^ rotr(b, 19) ^ (b >> 10))
            }
            var (a, b, c, d, e, f, g, hh) = (h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7])
            for i in 0..<64 {
                let t1 = hh &+ (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) &+ ((e & f) ^ (~e & g)) &+ k[i] &+ w[i]
                let t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) &+ ((a & b) ^ (a & c) ^ (b & c))
                (hh, g, f, e, d, c, b, a) = (g, f, e, d &+ t1, c, b, a, t1 &+ t2)
            }
            for (i, v) in [a, b, c, d, e, f, g, hh].enumerated() { h[i] = h[i] &+ v }
        }
        return h.flatMap { v in (0..<4).map { UInt8(truncatingIfNeeded: v >> UInt32(24 - 8 * $0)) } }
    }
}

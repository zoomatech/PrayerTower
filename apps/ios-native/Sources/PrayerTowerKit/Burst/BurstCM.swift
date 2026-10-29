import Foundation

// Codecs 3 and 4: the context-mixing decompressor (apps/station/src/burst/cm.ts), decode side.
// The format is the algorithm, so every step copies the TypeScript's integer arithmetic exactly,
// including where JavaScript wraps a product to 32 bits (`>>`) or a typed array truncates a store.

/// JavaScript's ToInt32: the low 32 bits as a signed number.
@inline(__always) private func i32(_ x: Int) -> Int { Int(Int32(truncatingIfNeeded: x)) }

enum CM {
    private static let sqT = [1, 2, 3, 6, 10, 16, 27, 45, 73, 120, 194, 310, 488, 747, 1101, 1546, 2047, 2549, 2994, 3348, 3607, 3785, 3901, 3975, 4022, 4050, 4068, 4079, 4085, 4089, 4092, 4093, 4094]
    static func squash(_ d: Int) -> Int {
        if d > 2047 { return 4095 }
        if d < -2047 { return 1 }
        let w = d & 127
        let i = (d >> 7) + 16
        return (sqT[i] * (128 - w) + sqT[i + 1] * w + 64) >> 7
    }
    static let stretch: [Int] = {
        var t = [Int](repeating: 0, count: 4096)
        var pi = 0
        for x in -2047...2047 {
            let v = squash(x)
            if pi <= v { for i in pi...v { t[i] = x } }
            pi = v + 1
        }
        if pi < 4096 { for i in pi..<4096 { t[i] = 2047 } }
        return t
    }()

    static let bits = 18
    static let mask = (1 << bits) - 1
    static let limit = 60
    static let dt: [Int] = (0...limit).map { 131072 / (2 * $0 + 3) }
    static func inputs(_ v: Int) -> Int { v == 2 ? 10 : 8 }

    @inline(__always) static func mix32(_ a: UInt32, _ b: UInt32) -> UInt32 {
        (a ^ (a >> 15)) &* 0x2c1b_3c6d &+ b &* 0x297a_2d39 &+ (b >> 16)
    }

    struct State {
        let v: Int
        var p: [[UInt16]]
        var n: [[UInt8]]
        var w: [Int32]
        var apm: [UInt16]

        init(v: Int) {
            self.v = v
            let inputs = CM.inputs(v)
            p = Array(repeating: [UInt16](repeating: 32768, count: 1 << CM.bits), count: inputs - 1)
            n = Array(repeating: [UInt8](repeating: 0, count: 1 << CM.bits), count: inputs - 1)
            w = [Int32](repeating: 16384, count: 256 * (v == 2 ? 3 : 1) * inputs)
            apm = [UInt16](repeating: 0, count: v == 2 ? 256 * 256 * 33 : 0)
            var r = 0
            while r < apm.count {
                for j in 0..<33 { apm[r + j] = UInt16(truncatingIfNeeded: CM.squash((j - 16) * 128) * 16) }
                r += 33
            }
        }
    }

    struct Model {
        var s: State
        let inputs: Int
        var c0 = 1
        var hist = [Int](repeating: 0, count: 6)
        var word: UInt32 = 0
        var prevWord: UInt32 = 0
        var ctx: [UInt32]
        var idx: [Int]
        var st: [Int]
        var pr = 2048
        var out = 2048
        var apmIdx = 0
        var apmW = 0

        init(_ s: State) {
            self.s = s
            inputs = CM.inputs(s.v)
            ctx = [UInt32](repeating: 0, count: inputs - 1)
            idx = [Int](repeating: 0, count: inputs - 1)
            st = [Int](repeating: 0, count: inputs)
            byteContexts()
        }

        mutating func byteContexts() {
            let h = hist.map { UInt32($0) }
            ctx[0] = 0
            ctx[1] = mix32(1, h[0])
            ctx[2] = mix32(2, h[0] | h[1] << 8)
            ctx[3] = mix32(3, h[0] | h[1] << 8 | h[2] << 16)
            ctx[4] = mix32(4, h[0] | h[1] << 8 | h[2] << 16 | h[3] << 24)
            ctx[5] = mix32(mix32(6, h[0] | h[1] << 8 | h[2] << 16 | h[3] << 24), h[4] | h[5] << 8)
            ctx[6] = mix32(mix32(7, word), prevWord)
            if s.v == 2 {
                ctx[7] = mix32(8, word)
                ctx[8] = mix32(9, h[1] | h[2] << 8)
            }
        }

        func mixerSet() -> Int {
            if s.v == 1 { return c0 }
            let h = hist[0] | 32
            return c0 + 256 * (h >= 97 && h <= 122 ? 0 : hist[0] == 32 ? 1 : 2)
        }

        mutating func p() -> Int {
            for i in 0..<(inputs - 1) {
                let j = Int(mix32(ctx[i], UInt32(c0)) & UInt32(mask))
                idx[i] = j
                st[i] = stretch[Int(s.p[i][j] >> 4)]
            }
            st[inputs - 1] = 256
            let base = mixerSet() * inputs
            var dot = 0
            for i in 0..<inputs { dot += i32(st[i] * Int(s.w[base + i])) >> 8 }
            pr = squash(i32(dot) >> 8)
            if s.v == 1 { return pr }
            let x = stretch[pr] + 2048
            let lo = x >> 7
            apmW = x & 127
            apmIdx = (hist[0] * 256 + c0) * 33 + lo
            let refined = (Int(s.apm[apmIdx]) * (128 - apmW) + Int(s.apm[apmIdx + 1]) * apmW) >> 11
            out = max(1, min(4095, (pr + 3 * refined + 2) >> 2))
            return out
        }

        mutating func update(_ bit: Int) {
            let err = ((bit << 12) - pr) * 6
            let base = mixerSet() * inputs
            for i in 0..<inputs { s.w[base + i] = Int32(truncatingIfNeeded: Int(s.w[base + i]) + (i32(st[i] * err) >> 10)) }
            if s.v == 2 {
                let g = bit == 1 ? 65535 : 0
                let i0 = apmIdx
                s.apm[i0] = UInt16(truncatingIfNeeded: Int(s.apm[i0]) + (i32((g - Int(s.apm[i0])) * (128 - apmW)) >> 13))
                s.apm[i0 + 1] = UInt16(truncatingIfNeeded: Int(s.apm[i0 + 1]) + (i32((g - Int(s.apm[i0 + 1])) * apmW) >> 13))
            }
            let target = bit == 1 ? 65535 : 0
            for i in 0..<(inputs - 1) {
                let j = idx[i]
                let pj = Int(s.p[i][j])
                let c = Int(s.n[i][j])
                s.p[i][j] = UInt16(truncatingIfNeeded: pj + (i32((target - pj) * dt[c]) >> 16))
                if c < limit { s.n[i][j] = UInt8(c + 1) }
            }
            c0 = (c0 << 1) | bit
            if c0 >= 256 {
                let byte = c0 & 255
                c0 = 1
                hist.removeLast()
                hist.insert(byte, at: 0)
                let lower = byte >= 65 && byte <= 90 ? byte + 32 : byte
                if lower >= 97 && lower <= 122 {
                    word = mix32(word &+ 1, UInt32(lower))
                } else if word != 0 {
                    prevWord = word
                    word = 0
                }
                byteContexts()
            }
        }
    }

    struct Decoder {
        let data: [UInt8]
        var at: Int
        var x1: Int = 0
        var x2: Int = 0xffff_ffff
        var x: Int = 0

        init(_ data: [UInt8], from: Int) {
            self.data = data
            at = from
            for _ in 0..<4 { x = ((x << 8) | next()) & 0xffff_ffff }
        }
        mutating func next() -> Int {
            guard at < data.count else { return 255 }
            defer { at += 1 }
            return Int(data[at])
        }
        mutating func bit(_ p: Int) -> Int {
            let range = x2 - x1
            let xmid = x1 + (range / 4096) * p + ((range % 4096) * p) / 4096
            let bit = x <= xmid ? 1 : 0
            if bit == 1 { x2 = xmid } else { x1 = xmid + 1 }
            while (x1 ^ x2) & 0xff00_0000 == 0 {
                x1 = (x1 << 8) & 0xffff_ffff
                x2 = ((x2 << 8) | 255) & 0xffff_ffff
                x = ((x << 8) | next()) & 0xffff_ffff
            }
            return bit
        }
    }

    static let maxText = 4 * 1024 * 1024

    private static let lock = NSLock()
    nonisolated(unsafe) private static var primed: [Int: State] = [:]

    /// The model after reading the primer, made once per version and copied for each batch.
    static func primedState(_ v: Int) -> State {
        lock.lock()
        defer { lock.unlock() }
        if let s = primed[v] { return s }
        var m = Model(State(v: v))
        for byte in BurstPrimers.bytes(v) {
            for i in stride(from: 7, through: 0, by: -1) {
                _ = m.p()
                m.update(Int(byte >> UInt8(i)) & 1)
            }
        }
        primed[v] = m.s
        return m.s
    }

    static func decompress(_ data: ArraySlice<UInt8>, v: Int) -> [UInt8]? {
        let data = Array(data)
        var length = 0
        var at = 0
        var shift = 0
        while true {
            guard at < data.count, shift <= 28 else { return nil }
            let b = Int(data[at])
            at += 1
            length |= (b & 127) << shift
            if b & 128 == 0 { break }
            shift += 7
        }
        guard length <= maxText else { return nil }
        var m = Model(primedState(v))
        var dec = Decoder(data, from: at)
        var out = [UInt8](repeating: 0, count: length)
        for k in 0..<length {
            var byte = 0
            for _ in 0..<8 {
                let bit = dec.bit(m.p())
                m.update(bit)
                byte = (byte << 1) | bit
            }
            out[k] = UInt8(byte)
        }
        return out
    }
}

/// The primer texts (generated from apps/station by `npm run build:listen -w @prayer-tower/station`).
enum BurstPrimers {
    private struct File: Decodable {
        let v1: String
        let v2: String
    }
    private static let file: File? = {
        guard let url = Bundle.module.url(forResource: "burst-primers", withExtension: "json", subdirectory: "Resources"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(File.self, from: data)
    }()
    static func bytes(_ v: Int) -> [UInt8] { Array(((v == 2 ? file?.v2 : file?.v1) ?? "").utf8) }
}

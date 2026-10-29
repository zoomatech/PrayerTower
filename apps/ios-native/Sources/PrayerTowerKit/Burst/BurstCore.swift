import Foundation

// The radio burst decoder's building blocks, ported line for line from the station's TypeScript
// (apps/station/src/burst: fft.ts, presets.ts, qam.ts, conv.ts, rs.ts, frame.ts, relay-frame.ts).
// The TypeScript is the reference; docs/RADIO_BURST.md describes the format. Receive side only.

/// JavaScript's Math.round: halves go up, toward +infinity (Swift's rounded() goes away from zero).
@inline(__always) func jsRound(_ x: Double) -> Int { Int((x + 0.5).rounded(.down)) }

extension String {
    /// Bytes as Latin-1 characters, as JavaScript's String.fromCharCode reads them.
    init<S: Sequence>(latin1 bytes: S) where S.Element == UInt8 {
        self.init(String.UnicodeScalarView(bytes.map { Unicode.Scalar($0) }))
    }
}

// MARK: - FFT (fft.ts)

/// In-place radix-2 complex FFT; inverse = true is the unscaled inverse.
func fft(_ re: inout [Double], _ im: inout [Double], inverse: Bool = false) {
    let n = re.count
    var j = 0
    for i in 1..<n {
        var bit = n >> 1
        while j & bit != 0 {
            j ^= bit
            bit >>= 1
        }
        j ^= bit
        if i < j {
            re.swapAt(i, j)
            im.swapAt(i, j)
        }
    }
    var len = 2
    while len <= n {
        let ang = (inverse ? 2 : -2) * Double.pi / Double(len)
        let wr = cos(ang)
        let wi = sin(ang)
        var i = 0
        while i < n {
            var cr = 1.0
            var ci = 0.0
            for k in 0..<(len / 2) {
                let a = i + k
                let b = a + len / 2
                let tr = re[b] * cr - im[b] * ci
                let ti = re[b] * ci + im[b] * cr
                re[b] = re[a] - tr
                im[b] = im[a] - ti
                re[a] = re[a] + tr
                im[a] = im[a] + ti
                let nr = cr * wr - ci * wi
                ci = cr * wi + ci * wr
                cr = nr
            }
            i += len
        }
        len <<= 1
    }
}

// MARK: - Presets (presets.ts)

public enum InnerCode: Sendable { case r12, r23, r34 }

public struct BurstPreset: Sendable {
    public let id: Int
    public let name: String
    let firstBin: Int
    let lastBin: Int
    let bitsPerSymbol: Int
    let parity: Int
    let inner: InnerCode?
    let qam: Bool
    let codedHeader: Bool

    var carriers: Int { lastBin - firstBin + 1 }
    var payloadCarriers: Int { qam ? QAM.dataCarriers(carriers) : carriers }

    public static let all: [BurstPreset] = [
        .init(id: 1, name: "fm-robust", firstBin: 16, lastBin: 63, bitsPerSymbol: 1, parity: 48, inner: nil, qam: false, codedHeader: false),
        .init(id: 2, name: "fm-standard", firstBin: 16, lastBin: 63, bitsPerSymbol: 2, parity: 32, inner: nil, qam: false, codedHeader: false),
        .init(id: 3, name: "fm-fast", firstBin: 16, lastBin: 63, bitsPerSymbol: 3, parity: 32, inner: nil, qam: false, codedHeader: false),
        .init(id: 4, name: "dataport-fast", firstBin: 8, lastBin: 111, bitsPerSymbol: 3, parity: 32, inner: nil, qam: false, codedHeader: false),
        .init(id: 5, name: "fm-turbo", firstBin: 12, lastBin: 66, bitsPerSymbol: 4, parity: 32, inner: nil, qam: false, codedHeader: false),
        .init(id: 6, name: "dataport-turbo", firstBin: 8, lastBin: 111, bitsPerSymbol: 4, parity: 32, inner: nil, qam: false, codedHeader: false),
        .init(id: 7, name: "fm-robust-fec", firstBin: 16, lastBin: 63, bitsPerSymbol: 2, parity: 16, inner: .r12, qam: false, codedHeader: false),
        .init(id: 8, name: "fm-turbo-fec", firstBin: 12, lastBin: 66, bitsPerSymbol: 4, parity: 16, inner: .r23, qam: false, codedHeader: false),
        .init(id: 9, name: "fm-qam16", firstBin: 16, lastBin: 63, bitsPerSymbol: 4, parity: 16, inner: .r34, qam: true, codedHeader: false),
        .init(id: 10, name: "fm-qam64", firstBin: 12, lastBin: 66, bitsPerSymbol: 6, parity: 16, inner: .r34, qam: true, codedHeader: false),
        .init(id: 11, name: "dataport-qam64", firstBin: 8, lastBin: 111, bitsPerSymbol: 6, parity: 16, inner: .r34, qam: true, codedHeader: false),
        .init(id: 12, name: "hf-robust", firstBin: 10, lastBin: 55, bitsPerSymbol: 1, parity: 16, inner: .r12, qam: false, codedHeader: true),
        .init(id: 13, name: "hf-standard", firstBin: 10, lastBin: 55, bitsPerSymbol: 2, parity: 16, inner: .r12, qam: false, codedHeader: true),
        .init(id: 14, name: "hf-fast", firstBin: 10, lastBin: 55, bitsPerSymbol: 2, parity: 16, inner: .r23, qam: false, codedHeader: true),
    ]
}

// MARK: - QAM (qam.ts)

enum QAM {
    static let pilotEvery = 6
    static func isPilot(_ k: Int, _ c: Int) -> Bool { k % pilotEvery == 0 || k == c - 1 }
    static func dataCarriers(_ c: Int) -> Int { (0..<c).filter { !isPilot($0, c) }.count }
    static func pilotPhase(_ ref: [Double], _ s: Int, _ k: Int) -> Double { ref[k] + Double((s * (k + 1)) % 4) * Double.pi / 2 }

    static func axis(_ bits: Int) -> (levels: Int, scale: Double) {
        let levels = 1 << (bits / 2)
        return (levels, 1 / (2 * Double(levels * levels - 1) / 3).squareRoot())
    }

    static func soft(_ zr: Double, _ zi: Double, bits: Int, weight: Double, into out: inout [Double]) {
        let (levels, scale) = axis(bits)
        let half = bits / 2
        for z in [zr, zi] {
            for j in stride(from: half - 1, through: 0, by: -1) {
                var d0 = Double.infinity
                var d1 = Double.infinity
                for i in 0..<levels {
                    let t = z - Double(2 * i - (levels - 1)) * scale
                    let d = t * t
                    if ((i ^ (i >> 1)) >> j) & 1 == 1 { d1 = min(d1, d) } else { d0 = min(d0, d) }
                }
                out.append((d1 - d0) * weight)
            }
        }
    }

    static func slice(_ zr: Double, _ zi: Double, bits: Int) -> (Double, Double) {
        let (levels, scale) = axis(bits)
        func cut(_ z: Double) -> Double {
            let i = max(0, min(levels - 1, jsRound((z / scale + Double(levels - 1)) / 2)))
            return Double(2 * i - (levels - 1)) * scale
        }
        return (cut(zr), cut(zi))
    }
}

// MARK: - Convolutional code, soft Viterbi (conv.ts)

enum Conv {
    static let K = 7
    static let states = 1 << (K - 1)
    static let out: [UInt8] = {
        func parity(_ x: Int) -> UInt8 { UInt8(x.nonzeroBitCount & 1) }
        var o = [UInt8](repeating: 0, count: states * 4)
        for s in 0..<states {
            for b in 0..<2 {
                let reg = (b << 6) | s
                o[(s * 2 + b) * 2] = parity(reg & 0o171)
                o[(s * 2 + b) * 2 + 1] = parity(reg & 0o133)
            }
        }
        return o
    }()
    static func next(_ s: Int, _ b: Int) -> Int { ((b << 6) | s) >> 1 }
    static func puncture(_ code: InnerCode) -> [Bool] {
        switch code {
        case .r12: [true, true]
        case .r23: [true, true, true, false]
        case .r34: [true, true, false, true, true, false]
        }
    }

    static func codedBits(_ bytes: Int, _ code: InnerCode) -> Int {
        let pattern = puncture(code)
        let all = (bytes * 8 + K - 1) * 2
        var n = 0
        for i in 0..<all where pattern[i % pattern.count] { n += 1 }
        return n
    }

    static func decode(_ llr: [Float], bytes: Int, _ code: InnerCode) -> [UInt8] {
        let pattern = puncture(code)
        let steps = bytes * 8 + K - 1
        var full = [Float](repeating: 0, count: steps * 2)
        var j = 0
        for i in 0..<full.count where pattern[i % pattern.count] {
            full[i] = j < llr.count ? llr[j] : 0
            j += 1
        }
        var metric = [Double](repeating: -.infinity, count: states)
        metric[0] = 0
        var nextMetric = [Double](repeating: 0, count: states)
        var from = [UInt8](repeating: 0, count: steps * states)
        for t in 0..<steps {
            for s in 0..<states { nextMetric[s] = -.infinity }
            let l0 = Double(full[2 * t])
            let l1 = Double(full[2 * t + 1])
            for s in 0..<states {
                let m = metric[s]
                if m == -.infinity { continue }
                for b in 0..<2 {
                    let base = (s * 2 + b) * 2
                    let branch = (out[base] == 1 ? -l0 : l0) + (out[base + 1] == 1 ? -l1 : l1)
                    let ns = next(s, b)
                    let cand = m + branch
                    if cand > nextMetric[ns] {
                        nextMetric[ns] = cand
                        from[t * states + ns] = UInt8(s & 1)
                    }
                }
            }
            swap(&metric, &nextMetric)
        }
        var bits = [UInt8](repeating: 0, count: steps)
        var s = 0
        for t in stride(from: steps - 1, through: 0, by: -1) {
            bits[t] = UInt8(s >> 5)
            s = ((s << 1) & (states - 1)) | Int(from[t * states + s])
        }
        var result = [UInt8](repeating: 0, count: bytes)
        for i in 0..<(bytes * 8) where bits[i] == 1 { result[i >> 3] |= 0x80 >> UInt8(i & 7) }
        return result
    }

    static func interleaver(_ n: Int) -> [Int] {
        var step = max(1, jsRound(Double(n) * 0.618034))
        func gcd(_ a: Int, _ b: Int) -> Int { b == 0 ? a : gcd(b, a % b) }
        while gcd(step, n) != 1 { step += 1 }
        return (0..<n).map { ($0 * step) % n }
    }
}

// MARK: - Reed-Solomon over GF(2^8) (rs.ts)

enum RS {
    static let tables: (exp: [Int], log: [Int]) = {
        var exp = [Int](repeating: 0, count: 512)
        var log = [Int](repeating: 0, count: 256)
        var x = 1
        for i in 0..<255 {
            exp[i] = x
            log[x] = i
            x <<= 1
            if x & 0x100 != 0 { x ^= 0x11d }
        }
        for i in 255..<512 { exp[i] = exp[i - 255] }
        return (exp, log)
    }()
    static func mul(_ a: Int, _ b: Int) -> Int { a == 0 || b == 0 ? 0 : tables.exp[tables.log[a] + tables.log[b]] }
    static func div(_ a: Int, _ b: Int) -> Int { a == 0 ? 0 : tables.exp[(tables.log[a] + 255 - tables.log[b]) % 255] }
    static func pow(_ a: Int, _ p: Int) -> Int { tables.exp[(((tables.log[a] * p) % 255) + 255) % 255] }
    static func inv(_ a: Int) -> Int { tables.exp[255 - tables.log[a]] }

    static func polyMul(_ p: [Int], _ q: [Int]) -> [Int] {
        var r = [Int](repeating: 0, count: p.count + q.count - 1)
        for j in q.indices { for i in p.indices { r[i + j] ^= mul(p[i], q[j]) } }
        return r
    }
    static func polyEval(_ p: [Int], _ x: Int) -> Int {
        var y = p[0]
        for i in 1..<max(1, p.count) { y = mul(y, x) ^ p[i] }
        return y
    }
    static func polyScale(_ p: [Int], _ s: Int) -> [Int] { p.map { mul($0, s) } }
    static func polyAdd(_ p: [Int], _ q: [Int]) -> [Int] {
        var r = [Int](repeating: 0, count: max(p.count, q.count))
        for i in p.indices { r[i + r.count - p.count] = p[i] }
        for i in q.indices { r[i + r.count - q.count] ^= q[i] }
        return r
    }

    static func generator(_ nsym: Int) -> [Int] {
        var g = [1]
        for i in 0..<nsym { g = polyMul(g, [1, pow(2, i)]) }
        return g
    }

    static func encode(_ data: [UInt8], _ nsym: Int) -> [UInt8] {
        let gen = generator(nsym)
        var out = [Int](repeating: 0, count: data.count + nsym)
        for i in data.indices { out[i] = Int(data[i]) }
        for i in data.indices {
            let coef = out[i]
            if coef != 0 { for j in 1..<gen.count { out[i + j] ^= mul(gen[j], coef) } }
        }
        for i in data.indices { out[i] = Int(data[i]) }
        return out.map { UInt8($0) }
    }

    static func locator(_ synd: [Int], _ count: Int) -> [Int] {
        var errLoc = [1]
        var oldLoc = [1]
        for i in 0..<count {
            var delta = synd[i]
            for j in 1..<max(1, errLoc.count) { delta ^= mul(errLoc[errLoc.count - 1 - j], synd[i - j]) }
            oldLoc.append(0)
            if delta != 0 {
                if oldLoc.count > errLoc.count {
                    let newLoc = polyScale(oldLoc, delta)
                    oldLoc = polyScale(errLoc, inv(delta))
                    errLoc = newLoc
                }
                errLoc = polyAdd(errLoc, polyScale(oldLoc, delta))
            }
        }
        while let f = errLoc.first, f == 0 { errLoc.removeFirst() }
        return errLoc
    }

    /// The data bytes with errors corrected, or nil when the block is beyond repair.
    static func decode(_ block: [UInt8], _ nsym: Int, erasures: [Int] = []) -> [UInt8]? {
        var msg = block.map(Int.init)
        let n = msg.count
        let synd = (0..<nsym).map { polyEval(msg, pow(2, $0)) }
        if synd.allSatisfy({ $0 == 0 }) { return Array(block[0..<(n - nsym)]) }
        if erasures.count > nsym { return nil }
        var fsynd = synd
        for p in erasures {
            let x = pow(2, n - 1 - p)
            for j in 0..<(fsynd.count - 1) { fsynd[j] = mul(fsynd[j], x) ^ fsynd[j + 1] }
        }
        let errLoc = locator(fsynd, nsym - erasures.count)
        let errs = errLoc.count - 1
        if errs * 2 + erasures.count > nsym { return nil }
        var found: [Int] = []
        for i in 0..<n where polyEval(errLoc, pow(2, 255 - i)) == 0 { found.append(n - 1 - i) }
        if found.count != errs { return nil }
        var pos: [Int] = []
        for p in erasures + found where !pos.contains(p) { pos.append(p) }
        let coefPos = pos.map { n - 1 - $0 }
        var eLoc = [1]
        for c in coefPos { eLoc = polyMul(eLoc, polyAdd([1], [pow(2, c), 0])) }
        let syndRev = synd.reversed() + [0]
        var omega = polyMul(Array(syndRev), eLoc)
        omega = Array(omega[(omega.count - eLoc.count)...])
        let X = coefPos.map { pow(2, $0) }
        for i in X.indices {
            let xiInv = inv(X[i])
            var denom = 1
            for j in X.indices where j != i { denom = mul(denom, 1 ^ mul(xiInv, X[j])) }
            let y = mul(polyEval(omega, xiInv), X[i])
            if denom == 0 { return nil }
            msg[pos[i]] ^= div(y, denom)
        }
        if (0..<nsym).contains(where: { polyEval(msg, pow(2, $0)) != 0 }) { return nil }
        return msg[0..<(n - nsym)].map { UInt8($0) }
    }
}

// MARK: - Frame bytes (frame.ts)

enum FrameBytes {
    static let headerBytes = 16
    static let headerParity = 16
    static let version: UInt8 = 1

    static let crcTable: [UInt32] = (0..<256).map { n in
        var c = UInt32(n)
        for _ in 0..<8 { c = c & 1 == 1 ? 0xedb8_8320 ^ (c >> 1) : c >> 1 }
        return c
    }
    static func crc32(_ bytes: ArraySlice<UInt8>) -> UInt32 {
        var c: UInt32 = 0xffff_ffff
        for b in bytes { c = crcTable[Int((c ^ UInt32(b)) & 0xff)] ^ (c >> 8) }
        return c ^ 0xffff_ffff
    }

    struct Header {
        let presetId: Int
        let messageLength: Int
        let callSign: String
    }

    static func decodeHeader(_ coded: [UInt8]) -> Header? {
        guard let b = RS.decode(coded, headerParity), b[0] == 0x50, b[1] == 0x54, b[2] == version else { return nil }
        let call = String(latin1: b[7..<15]).trimmingCharacters(in: .whitespacesAndNewlines)
        return Header(presetId: Int(b[3]), messageLength: Int(b[4]) << 16 | Int(b[5]) << 8 | Int(b[6]), callSign: call)
    }

    static func blockSizes(_ messageLength: Int, _ parity: Int) -> [Int] {
        let perBlock = 255 - parity
        let count = max(1, (messageLength + perBlock - 1) / perBlock)
        let small = messageLength / count
        return (0..<count).map { small + ($0 < messageLength % count ? 1 : 0) }
    }

    static func payloadLength(_ messageLength: Int, _ parity: Int) -> Int {
        blockSizes(messageLength, parity).reduce(0) { $0 + $1 + parity }
    }

    static func deinterleave<T: Numeric>(_ data: [T], _ sizes: [Int]) -> [[T]] {
        var blocks = sizes.map { [T](repeating: 0, count: $0) }
        let longest = sizes.max() ?? 0
        var o = 0
        for i in 0..<longest {
            for b in blocks.indices where i < blocks[b].count {
                blocks[b][i] = o < data.count ? data[o] : 0
                o += 1
            }
        }
        return blocks
    }

    /// The batch, or nil when a block is beyond repair or the CRC fails. `margins` (0 weak .. 1 solid
    /// per payload byte) lets a block with too many errors retry with its weakest bytes erased.
    static func decodePayload(_ payload: [UInt8], messageLength: Int, parity: Int, margins: [Float]? = nil) -> (batch: [UInt8], corrected: Bool)? {
        guard messageLength >= 4 else { return nil }
        let sizes = blockSizes(messageLength, parity).map { $0 + parity }
        let blocks = deinterleave(payload, sizes)
        let weak = margins.map { deinterleave($0, sizes) }
        var message: [UInt8] = []
        message.reserveCapacity(messageLength)
        var corrected = false
        for b in blocks.indices {
            let block = blocks[b]
            var data = RS.decode(block, parity)
            if data == nil, let weak {
                let w = weak[b]
                let order = block.indices.sorted { w[$0] != w[$1] ? w[$0] < w[$1] : $0 < $1 }
                for e in [parity / 2, parity * 3 / 4, parity] {
                    data = RS.decode(block, parity, erasures: Array(order.prefix(e)))
                    if data != nil { break }
                }
            }
            guard let data else { return nil }
            if !corrected && RS.encode(data, parity) != block { corrected = true }
            message += data
        }
        let batch = message[0..<(messageLength - 4)]
        let crc = message[(messageLength - 4)..<messageLength].reduce(UInt32(0)) { $0 << 8 | UInt32($1) }
        guard crc32(batch) == crc else { return nil }
        return (Array(batch), corrected)
    }
}

// MARK: - Relay envelope (relay-frame.ts)

enum Relay {
    static let relayed: UInt8 = 5
    static let maxHops = 3

    static func isCallSign(_ s: String) -> Bool {
        (3...10).contains(s.count) && s.unicodeScalars.allSatisfy { ("A"..."Z").contains($0) || ("0"..."9").contains($0) || $0 == "/" || $0 == "-" }
    }

    static func unwrap(_ batch: [UInt8]) -> (origin: String, hops: Int, inner: [UInt8])? {
        guard batch.first == relayed, batch.count >= 4 else { return nil }
        let hops = Int(batch[1])
        let n = Int(batch[2])
        guard (1...maxHops).contains(hops), (3...10).contains(n), batch.count >= 3 + n + 1 else { return nil }
        let origin = String(latin1: batch[3..<(3 + n)])
        let inner = Array(batch[(3 + n)...])
        guard isCallSign(origin), inner.first != relayed else { return nil }
        return (origin, hops, inner)
    }
}

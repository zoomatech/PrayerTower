import Foundation

// The prayer panel and its SSTV picture (docs/RADIO_BURST.md, "Prayer panel"), natively: the same
// format as apps/station/src/panel/panel.ts and sstv.ts. A batch of prayers packed into one
// black-and-white picture of 80 x 60 cells, read back from a photo or a screenshot, or from a
// Robot 36 SSTV recording. Drawing here uses the plain codec (the station's context-mixing
// compressor isn't ported); reading takes both.

/// A panel read from a picture or an SSTV recording.
public struct PanelRead: Sendable, Equatable {
    public let callSign: String
    /// The prayers, or nil when the panel used a codec this decoder can't unpack.
    public let prayers: [String]?
    public let corrected: Bool
}

public enum PrayerPanel {
    public static let width = 80
    public static let height = 60
    static let frameAt = 1
    static let dataAt = 3
    static let dataW = width - 2 * dataAt
    static let dataH = height - 2 * dataAt
    static let bytes = dataW * dataH / 8
    static let presetId = 240
    static let parity = 32
    static let codedHeader = FrameBytes.headerBytes + FrameBytes.headerParity
    /// The preset name a panel heard as SSTV goes by, as the station reports it.
    public static let sstvPreset = "sstv-robot36"

    /// A fixed pseudo-random byte sequence (xorshift32, seed "PANL") that whitens the panel.
    static let whitening: [UInt8] = {
        var s: UInt32 = 0x5041_4e4c
        return (0..<bytes).map { _ in
            s ^= s &<< 13
            s ^= s >> 17
            s ^= s &<< 5
            return UInt8(s & 0xff)
        }
    }()

    /// The largest batch that fits: header, then message (batch + CRC-32) in Reed-Solomon blocks.
    static var maxBatchBytes: Int {
        var m = bytes - codedHeader
        while m > 4 && FrameBytes.payloadLength(m, parity) > bytes - codedHeader { m -= 1 }
        return m - 4
    }

    // MARK: Drawing

    /// As many of the prayers (folded to ASCII) as fit into one panel, plain codec: cells (1 black)
    /// row by row, and how many of the prayers are on it (the first ones).
    public static func draw(_ prayers: [String], callSign: String) -> (cells: [UInt8], count: Int) {
        let folded = prayers.map(fold)
        var count = folded.count
        func batch(_ n: Int) -> [UInt8] { [0] + Array(folded.prefix(n).joined(separator: "\n").utf8) }
        while count > 0 && batch(count).count > maxBatchBytes { count -= 1 }
        // A prayer too long for a panel of its own still shows, cut to what fits.
        let body = count > 0 ? batch(count) : Array(batch(1).prefix(maxBatchBytes))
        var message = body
        let crc = FrameBytes.crc32(body[...])
        message += [UInt8(crc >> 24 & 0xff), UInt8(crc >> 16 & 0xff), UInt8(crc >> 8 & 0xff), UInt8(crc & 0xff)]
        var blocks: [[UInt8]] = []
        var at = 0
        for k in FrameBytes.blockSizes(message.count, parity) {
            blocks.append(RS.encode(Array(message[at..<(at + k)]), parity))
            at += k
        }
        var out = [UInt8](repeating: 0, count: bytes)
        var header = [UInt8](repeating: 0, count: FrameBytes.headerBytes)
        header[0] = 0x50
        header[1] = 0x54
        header[2] = FrameBytes.version
        header[3] = UInt8(presetId)
        header[4] = UInt8(message.count >> 16 & 0xff)
        header[5] = UInt8(message.count >> 8 & 0xff)
        header[6] = UInt8(message.count & 0xff)
        let call = Array(callSign.uppercased().unicodeScalars.prefix(8).map { UInt8($0.value & 0x7f) })
        for i in 0..<8 { header[7 + i] = i < call.count ? call[i] : 0x20 }
        out.replaceSubrange(0..<codedHeader, with: RS.encode(header, FrameBytes.headerParity))
        var o = codedHeader
        for i in 0..<(blocks.map(\.count).max() ?? 0) {
            for b in blocks where i < b.count {
                out[o] = b[i]
                o += 1
            }
        }
        for i in 0..<bytes { out[i] ^= whitening[i] }
        var cells = [UInt8](repeating: 0, count: width * height)
        for y in frameAt..<(height - frameAt) {
            for x in frameAt..<(width - frameAt) {
                let inside = x >= dataAt && x < width - dataAt && y >= dataAt && y < height - dataAt
                if !inside { cells[y * width + x] = 1 }
            }
        }
        for i in 0..<(bytes * 8) {
            cells[(dataAt + i / dataW) * width + dataAt + i % dataW] = out[i >> 3] >> (7 - UInt8(i & 7)) & 1
        }
        return (cells, count > 0 ? count : 1)
    }

    /// As the station folds a prayer before it goes out (apps/station/src/text.ts foldAscii).
    public static func fold(_ text: String) -> String {
        var out = ""
        for u in text.decomposedStringWithCompatibilityMapping.unicodeScalars where !(0x300...0x36f).contains(u.value) {
            switch u {
            case "\u{2018}", "\u{2019}": out += "'"
            case "\u{201C}", "\u{201D}": out += "\""
            case "\u{2013}", "\u{2014}": out += "-"
            default: out += (0x20...0x7e).contains(u.value) ? String(u) : " "
            }
        }
        return out.split(whereSeparator: { $0 == " " }).joined(separator: " ")
    }

    // MARK: Reading

    /// Data cells (1 black) back to the prayers; nil when they can't be read.
    public static func read(cells: [UInt8]) -> PanelRead? {
        guard cells.count == width * height else { return nil }
        var b = [UInt8](repeating: 0, count: bytes)
        for i in 0..<(bytes * 8) where cells[(dataAt + i / dataW) * width + dataAt + i % dataW] != 0 {
            b[i >> 3] |= 1 << (7 - UInt8(i & 7))
        }
        for i in 0..<bytes { b[i] ^= whitening[i] }
        guard let header = FrameBytes.decodeHeader(Array(b[0..<codedHeader])), header.presetId == presetId else { return nil }
        let length = FrameBytes.payloadLength(header.messageLength, parity)
        guard codedHeader + length <= bytes,
              let out = FrameBytes.decodePayload(Array(b[codedHeader..<(codedHeader + length)]), messageLength: header.messageLength, parity: parity)
        else { return nil }
        return PanelRead(callSign: header.callSign, prayers: BurstDecoder.unpack(out.batch), corrected: out.corrected)
    }

    /// Find and read a panel in a grayscale picture (0 black .. 255 white): an SSTV picture, a
    /// screenshot, or a camera photo with the whole panel in view, square on, any of four ways up.
    public static func read(gray: [UInt8], width w: Int, height h: Int) -> PanelRead? {
        guard gray.count == w * h, w > 0, h > 0 else { return nil }
        let threshold = otsu(gray)
        guard let corners = frameCorners(gray, w, h, threshold) else { return nil }
        for turn in 0..<4 {
            let order = (0..<4).map { corners[($0 + turn) % 4] }
            let values = sampleCells(gray, w, h, order)
            // The cells' own threshold: data is whitened, so about half are black.
            let t = otsu(values.map { UInt8(max(0, min(255, jsRound($0)))) })
            if let r = read(cells: values.map { $0 <= Double(t) ? 1 : 0 }) { return r }
        }
        return nil
    }

    /// Otsu's threshold.
    static func otsu(_ gray: [UInt8]) -> Int {
        var hist = [Double](repeating: 0, count: 256)
        for g in gray { hist[Int(g)] += 1 }
        var sum = 0.0
        for t in 0..<256 { sum += Double(t) * hist[t] }
        var sumB = 0.0, wB = 0.0, best = 0.0
        var threshold = 128
        let total = Double(gray.count)
        for t in 0..<256 {
            wB += hist[t]
            if wB == 0 { continue }
            let wF = total - wB
            if wF == 0 { break }
            sumB += Double(t) * hist[t]
            let d = sumB / wB - (sum - sumB) / wF
            let between = wB * wF * d * d
            if between > best {
                best = between
                threshold = t
            }
        }
        return threshold
    }

    typealias Point = (x: Double, y: Double)

    /// The outer corners of the largest dark shape (the frame): top-left, top-right, bottom-right, bottom-left.
    static func frameCorners(_ gray: [UInt8], _ w: Int, _ h: Int, _ threshold: Int) -> [Point]? {
        var seen = [Bool](repeating: false, count: w * h)
        var stack: [Int] = []
        var best: (area: Int, corners: [Point])?
        let limit = UInt8(threshold)
        for start in 0..<(w * h) where !seen[start] && gray[start] <= limit {
            stack.append(start)
            seen[start] = true
            var minX = w, maxX = 0, minY = h, maxY = 0
            var tl: Point = (0, 0), tr: Point = (0, 0), br: Point = (0, 0), bl: Point = (0, 0)
            var sTl = Int.max, sTr = Int.min, sBr = Int.min, sBl = Int.min
            while let p = stack.popLast() {
                let x = p % w, y = p / w
                minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
                if x + y < sTl { sTl = x + y; tl = (Double(x), Double(y)) }
                if x - y > sTr { sTr = x - y; tr = (Double(x + 1), Double(y)) }
                if x + y > sBr { sBr = x + y; br = (Double(x + 1), Double(y + 1)) }
                if y - x > sBl { sBl = y - x; bl = (Double(x), Double(y + 1)) }
                for (q, ok) in [(p - 1, x > 0), (p + 1, x < w - 1), (p - w, y > 0), (p + w, y < h - 1)] where ok && !seen[q] && gray[q] <= limit {
                    seen[q] = true
                    stack.append(q)
                }
            }
            let area = (maxX - minX + 1) * (maxY - minY + 1)
            if best == nil || area > best!.area { best = (area, [tl, tr, br, bl]) }
        }
        guard let best, best.area >= w * h / 50 else { return nil }
        return best.corners
    }

    /// The homography taking the unit square's corners to these four points (Heckbert).
    static func squareTo(_ q: [Point]) -> [Double] {
        let (x0, y0, x1, y1, x2, y2, x3, y3) = (q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y)
        let dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2
        let sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3
        let den = dx1 * dy2 - dx2 * dy1
        let g = den != 0 ? (sx * dy2 - dx2 * sy) / den : 0
        let h = den != 0 ? (dx1 * sy - sx * dy1) / den : 0
        return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h]
    }

    /// Each cell of the grid, read through the frame's corners (five points around its centre).
    static func sampleCells(_ gray: [UInt8], _ w: Int, _ h: Int, _ corners: [Point]) -> [Double] {
        let m = squareTo(corners)
        let spanX = Double(width - 2 * frameAt), spanY = Double(height - 2 * frameAt)
        let offsets: [(Double, Double)] = [(0, 0), (-0.22, -0.22), (0.22, -0.22), (-0.22, 0.22), (0.22, 0.22)]
        var values = [Double](repeating: 255, count: width * height)
        for cy in 0..<height {
            for cx in 0..<width {
                var sum = 0.0
                var n = 0
                for (ox, oy) in offsets {
                    let u = (Double(cx) + 0.5 + ox - Double(frameAt)) / spanX
                    let v = (Double(cy) + 0.5 + oy - Double(frameAt)) / spanY
                    let d = m[6] * u + m[7] * v + 1
                    let px = ((m[0] * u + m[1] * v + m[2]) / d).rounded(.down)
                    let py = ((m[3] * u + m[4] * v + m[5]) / d).rounded(.down)
                    guard px.isFinite, py.isFinite, px >= 0, py >= 0, px < Double(w), py < Double(h) else { continue }
                    sum += Double(gray[Int(py) * w + Int(px)])
                    n += 1
                }
                if n > 0 { values[cy * width + cx] = sum / Double(n) }
            }
        }
        return values
    }
}

// MARK: - SSTV, Robot 36 (sstv.ts)

public enum Robot36 {
    public static let width = 320
    public static let height = 240
    static let lineMs = 150.0
    static let syncMs = 9.0
    static let yStartMs = 12.0
    static let yMs = 88.0
    static let black = 1500.0
    static let white = 2300.0
    static let sync = 1200.0

    /// Average of `n` samples at a time, run twice: a gentle low-pass, delay undone.
    static func smooth(_ x: [Double], _ n: Int) -> [Double] {
        if n <= 1 { return x }
        var out = x
        for _ in 0..<2 {
            var dst = [Double](repeating: 0, count: out.count)
            var acc = 0.0
            for i in out.indices {
                acc += out[i]
                if i >= n { acc -= out[i - n] }
                dst[i] = acc / Double(min(i + 1, n))
            }
            let shift = (n - 1) / 2
            var next = [Double](repeating: 0, count: out.count)
            if shift < dst.count { next.replaceSubrange(0..<(dst.count - shift), with: dst[shift...]) }
            out = next
        }
        return out
    }

    /// The audio's instantaneous frequency in Hz, sample by sample (an FM discriminator around 1700 Hz).
    static func instantFrequency(_ x: [Double], rate: Double) -> [Double] {
        let fc = 1700.0
        let n = x.count
        var re = [Double](repeating: 0, count: n), im = [Double](repeating: 0, count: n)
        for i in 0..<n {
            let a = 2 * Double.pi * fc * Double(i) / rate
            re[i] = x[i] * cos(a)
            im[i] = -x[i] * sin(a)
        }
        let w = max(1, jsRound(rate / 3400))
        let r = smooth(re, w), q = smooth(im, w)
        var f = [Double](repeating: fc, count: n)
        if n > 1 {
            for i in 1..<n {
                let d = atan2(q[i] * r[i - 1] - r[i] * q[i - 1], r[i] * r[i - 1] + q[i] * q[i - 1])
                f[i] = fc + d * rate / (2 * Double.pi)
            }
            f[0] = f[1]
        }
        return smooth(f, max(1, jsRound(rate / 4000)))
    }

    /// Find a Robot 36 picture in mono audio and read its brightness (320 x 240, 0 black .. 255
    /// white), with where it starts and ends in samples of the audio given. Needs at least 200 of
    /// its 240 line syncs; allows a radio tuned up to about 100 Hz off.
    public static func decode(_ samples: [Float], rate inputRate: Int) -> (gray: [UInt8], start: Int, end: Int, lines: Int)? {
        // Down to about 12 kHz, an average of each group.
        let k = max(1, inputRate / 12_000)
        var x = [Double](repeating: 0, count: samples.count / k)
        for i in x.indices {
            var s = 0.0
            for j in 0..<k { let v = Double(samples[i * k + j]); s += v.isFinite ? v : 0 }
            x[i] = s / Double(k)
        }
        let rate = Double(inputRate) / Double(k)
        let freq = instantFrequency(x, rate: rate)
        let ms = rate / 1000
        // Sync pulses: the last 9 ms of each run of at least 5 ms below 1350 Hz, in the frequency
        // averaged over 2 ms (the VIS header runs straight into line 0's sync).
        let slow = smooth(freq, max(1, jsRound(2 * ms)))
        var syncs: [Double] = []
        var runStart = -1
        for i in slow.indices {
            let low = slow[i] < 1350
            if low && runStart < 0 { runStart = i }
            if !low && runStart >= 0 {
                if Double(i - runStart) >= 5 * ms { syncs.append(max(Double(runStart), Double(i) - syncMs * ms)) }
                runStart = -1
            }
        }
        guard syncs.count >= 200 else { return nil }
        let period = lineMs * ms
        let tol = 2.5 * ms
        // The chain of syncs a line apart with the most members, each looked for a period after the last found.
        func chain(_ first: Double, _ step: Double) -> [(k: Int, at: Double)] {
            var hits: [(k: Int, at: Double)] = []
            var j = 0
            var lastK = 0
            var lastAt = first
            for k in 0..<height {
                let want = lastAt + Double(k - lastK) * step
                while j < syncs.count && syncs[j] < want - tol { j += 1 }
                if j < syncs.count && abs(syncs[j] - want) <= tol {
                    hits.append((k, syncs[j]))
                    lastK = k
                    lastAt = syncs[j]
                }
            }
            return hits
        }
        var best: [(k: Int, at: Double)] = []
        for s in syncs {
            let hits = chain(s, period)
            if hits.count > best.count { best = hits }
            if best.count >= height - 2 { break }
        }
        guard best.count >= 200 else { return nil }
        var a = best[0].at
        var b = period
        for _ in 0..<2 {
            let n = Double(best.count)
            let mk = best.reduce(0.0) { $0 + Double($1.k) } / n
            let mt = best.reduce(0.0) { $0 + $1.at } / n
            let cov = best.reduce(0.0) { $0 + (Double($1.k) - mk) * ($1.at - mt) }
            let vk = best.reduce(0.0) { $0 + (Double($1.k) - mk) * (Double($1.k) - mk) }
            b = vk != 0 ? cov / vk : period
            a = mt - b * mk
            best = chain(a, b)
        }
        // A radio tuned off moves every tone: the syncs say by how much.
        var offset = 0.0
        var count = 0
        for (_, t) in best {
            var i = jsRound(t + 2 * ms)
            while Double(i) < t + 7 * ms && i < freq.count {
                if i >= 0 { offset += freq[i] - sync; count += 1 }
                i += 1
            }
        }
        offset = count > 0 ? offset / Double(count) : 0
        guard abs(offset) <= 120 else { return nil }
        var gray = [UInt8](repeating: 0, count: width * height)
        for y in 0..<height {
            let lineStart = a + Double(y) * b
            for px in 0..<width {
                let from = jsRound(lineStart + (yStartMs + Double(px) * yMs / Double(width)) * ms)
                let to = max(from + 1, jsRound(lineStart + (yStartMs + Double(px + 1) * yMs / Double(width)) * ms))
                var s = 0.0
                var n = 0
                var i = max(0, from)
                while i < to && i < freq.count {
                    s += freq[i] - offset
                    n += 1
                    i += 1
                }
                let f = n > 0 ? s / Double(n) : black
                gray[y * width + px] = UInt8(max(0, min(255, jsRound((f - black) / (white - black) * 255))))
            }
        }
        let scale = Double(inputRate) / rate
        return (gray, jsRound(a * scale), jsRound((a + Double(height) * b) * scale), best.count)
    }

    /// The panel in an SSTV recording, with where the picture ended (in samples of the audio given).
    public static func readPanel(_ samples: [Float], rate: Int) -> (panel: PanelRead?, end: Int)? {
        guard let pic = decode(samples, rate: rate) else { return nil }
        return (PrayerPanel.read(gray: pic.gray, width: width, height: height), pic.end)
    }
}

/// The Listen screen's SSTV reader: keeps the last 45 seconds at 12 kHz (a Robot 36 picture is 37)
/// and finds a whole picture in them, each picture once (burst-listen.ts SstvListener).
public struct SstvListener: Sendable {
    public static let rate = 12_000
    static let keepSeconds = 45
    public let inputRate: Int
    private var buf: [Float] = []
    private var taken = 0
    private var readUpTo = 0
    private var acc: Float = 0
    private var accN = 0
    /// Microphone samples averaged into one kept sample: a whole number, as the station's decoder
    /// (a fractional step jitters every sample's timing, which the frequency reading turns into noise).
    private let k: Int
    /// The kept samples' rate: 48 kHz / 4, 44.1 kHz / 3 = 14.7 kHz, 16 kHz and below as they are.
    public let keptRate: Int

    public init(rate: Int) {
        inputRate = rate
        k = max(1, rate / Self.rate)
        keptRate = max(1, rate / k)
    }

    /// Add microphone samples (mono). A sample that isn't a number counts as silence.
    public mutating func push(_ samples: [Float]) {
        for s in samples {
            acc += s.isFinite ? s : 0
            accN += 1
            if accN == k {
                buf.append(acc / Float(k))
                taken += 1
                acc = 0
                accN = 0
            }
        }
        let keep = Self.keepSeconds * keptRate
        if buf.count > keep { buf.removeFirst(((buf.count - keep) / keptRate + 1) * keptRate) }
    }

    /// A panel whose picture ended since the last one read, or nil.
    public mutating func read() -> (panel: PanelRead?, end: Int)? {
        guard buf.count >= 38 * keptRate else { return nil }
        let startAt = taken - buf.count
        guard let found = Robot36.readPanel(buf, rate: keptRate) else { return nil }
        let end = startAt + found.end
        guard end > readUpTo else { return nil }
        readUpTo = end
        return (found.panel, end)
    }
}

/// Sample prayers for the panel with no server or account (the Mac console and previews).
public enum PanelDemo {
    public static let callSign = "N0CALL"
    public static let prayers = [
        "Please keep my mother in mind before her surgery on Tuesday.",
        "Thankful for a safe trip home!",
        "Peace for our town, and rain for the farms.",
        "Strength for a friend starting a new job after a long search.",
        "Comfort for a family saying goodbye to their grandfather.",
    ]
}

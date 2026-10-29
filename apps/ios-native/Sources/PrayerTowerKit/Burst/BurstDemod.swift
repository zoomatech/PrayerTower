import Foundation

// The audio layer of a burst frame, receive side (apps/station/src/burst/ofdm.ts `demodulate`):
// find each frame by its sync symbol, read the header, then the payload with differential PSK
// or coherent QAM, the inner code and Reed-Solomon. A line-for-line port of the TypeScript.

public struct DecodedBurstFrame: Sendable {
    public let presetId: Int
    public let messageLength: Int
    public let callSign: String
    public let preset: String
    public let batch: [UInt8]
    /// Sample (48 kHz) where the frame starts, and just after it ends.
    public let start: Int
    public let end: Int
    /// Reed-Solomon fixed at least one byte.
    public let corrected: Bool
    /// Signal-to-noise ratio in 2.5 kHz, from the payload.
    public let snrDb: Double
}

enum OFDM {
    static let sampleRate = 48_000
    static let N = 1024
    static let guardLen = 128
    static let syncFirst = 16
    static let syncLast = 63
    static let backoff = 32
    static let syncCarriers = syncLast - syncFirst + 1
    static let syncSeed: UInt32 = 0x5054_5331
    static let refSeed: UInt32 = 0x5054_5232
    static let headerSymbols = ((FrameBytes.headerBytes + FrameBytes.headerParity) * 8 + syncCarriers - 1) / syncCarriers
    static let headerCode = InnerCode.r12
    static let codedHeaderSymbols = (Conv.codedBits(FrameBytes.headerBytes + FrameBytes.headerParity, headerCode) + syncCarriers - 1) / syncCarriers
    static func headerSymbols(for p: BurstPreset) -> Int { p.codedHeader ? codedHeaderSymbols : headerSymbols }

    static func knownPhases(_ seed: UInt32, _ count: Int) -> [Double] {
        var x = seed == 0 ? 1 : seed
        return (0..<count).map { _ in
            x ^= x << 13
            x ^= x >> 17
            x ^= x << 5
            return Double((x >> 30) & 3) * (Double.pi / 2) + Double.pi / 4
        }
    }

    static func symbol(_ firstBin: Int, _ phases: [Double]) -> [Double] {
        var re = [Double](repeating: 0, count: N)
        var im = [Double](repeating: 0, count: N)
        for (i, ph) in phases.enumerated() {
            let k = firstBin + i
            re[k] = cos(ph)
            im[k] = sin(ph)
            re[N - k] = cos(ph)
            im[N - k] = -sin(ph)
        }
        fft(&re, &im, inverse: true)
        return Array(re[(N - guardLen)...]) + re
    }

    static func stepToGray(_ s: Int) -> Int { s ^ (s >> 1) }

    static func byteMargins(_ margins: [Double], bits: Int, byteCount: Int) -> [Float] {
        var out = [Float](repeating: 1, count: byteCount)
        for g in margins.indices {
            var b = g * bits
            while b < (g + 1) * bits && b < byteCount * 8 {
                out[b >> 3] = min(out[b >> 3], Float(margins[g]))
                b += 1
            }
        }
        return out
    }

    static func ungroup(_ values: [Int], bits: Int, byteCount: Int) -> [UInt8] {
        var out = [UInt8](repeating: 0, count: byteCount)
        var bit = 0
        outer: for v in values {
            for i in stride(from: bits - 1, through: 0, by: -1) {
                if bit >= byteCount * 8 { break outer }
                if (v >> i) & 1 == 1 { out[bit >> 3] |= 0x80 >> UInt8(bit & 7) }
                bit += 1
            }
        }
        return out
    }

    /// Carrier values of the symbol whose useful part starts at `at`.
    static func bins(_ x: [Float], _ at: Int, _ first: Int, _ count: Int) -> ([Double], [Double]) {
        var re = [Double](repeating: 0, count: N)
        var im = [Double](repeating: 0, count: N)
        let lo = max(0, -at)
        let hi = min(N, x.count - at)
        if lo < hi { for i in lo..<hi { re[i] = Double(x[at + i]) } }
        fft(&re, &im)
        return (Array(re[first..<(first + count)]), Array(im[first..<(first + count)]))
    }

    /// What demodDiff collects beside the decisions: each decision's margin and/or soft bits (nil: not wanted).
    final class Outputs {
        var margins: [Double]?
        var soft: [Double]?
        init(margins: Bool = false, soft: Bool = false) {
            self.margins = margins ? [] : nil
            self.soft = soft ? [] : nil
        }
    }

    struct Track {
        var fresh = true
        var off = 0.0
        var rate = 0.0
        var bias = 0.0
        var signal = 0.0
        var noise = 0.0
    }

    static func demodDiff(_ x: [Float], _ at: Int, _ first: Int, _ c: Int, _ symbols: Int, _ bits: Int, _ track: inout Track,
                          _ out: Outputs? = nil) -> [Int] {
        let m = 1 << bits
        let step = 2 * Double.pi / Double(m)
        let S = N + guardLen
        var shift = jsRound(track.off)
        var (pr, pi) = bins(x, at + shift, first, c)
        var values: [Int] = []
        var err = [Double](repeating: 0, count: c)
        let marginsFrom = out?.margins?.count ?? 0
        var amps: [Double] = []
        let kMean = Double(first) + Double(c - 1) / 2
        var kVar = 0.0
        for k in 0..<c { kVar += (Double(first + k) - kMean) * (Double(first + k) - kMean) }
        if symbols >= 1 {
            for s in 1...symbols {
                let nextShift = jsRound(track.off)
                let (cr, ci) = bins(x, at + s * S + nextShift, first, c)
                if nextShift != shift {
                    let d = nextShift - shift
                    for k in 0..<c {
                        let a = 2 * Double.pi * Double(first + k) * Double(d) / Double(N)
                        let r = pr[k] * cos(a) - pi[k] * sin(a)
                        pi[k] = pr[k] * sin(a) + pi[k] * cos(a)
                        pr[k] = r
                    }
                    shift = nextShift
                }
                if s == 1 && track.fresh {
                    var sr = 0.0
                    var si = 0.0
                    for k in 0..<c {
                        let a = atan2(ci[k] * pr[k] - cr[k] * pi[k], cr[k] * pr[k] + ci[k] * pi[k]) * Double(m)
                        sr += cos(a)
                        si += sin(a)
                    }
                    track.bias = atan2(si, sr) / Double(m)
                    track.fresh = false
                }
                var errMean = 0.0
                for k in 0..<c {
                    let dr = cr[k] * pr[k] + ci[k] * pi[k]
                    let di = ci[k] * pr[k] - cr[k] * pi[k]
                    let ang = atan2(di, dr) - track.bias
                    let d = jsRound(ang / step)
                    values.append(stepToGray(((d % m) + m) % m))
                    err[k] = ang - Double(d) * step
                    errMean += err[k] / Double(c)
                    if out?.margins != nil {
                        out!.margins!.append(1 - min(1, abs(err[k]) / (step / 2)))
                        amps.append((dr * dr + di * di).squareRoot())
                    }
                    if out?.soft != nil {
                        for j in stride(from: bits - 1, through: 0, by: -1) {
                            var d0 = Double.infinity
                            var d1 = Double.infinity
                            for sIdx in 0..<m {
                                let t = Double(sIdx) * step + track.bias
                                let dd = -(dr * cos(t) + di * sin(t))
                                if (stepToGray(sIdx) >> j) & 1 == 1 { d1 = min(d1, dd) } else { d0 = min(d0, dd) }
                            }
                            out!.soft!.append(d1 - d0)
                        }
                    }
                }
                var slope = 0.0
                for k in 0..<c { slope += (Double(first + k) - kMean) * (err[k] - errMean) / kVar }
                for k in 0..<c { track.noise += (err[k] - errMean) * (err[k] - errMean) }
                track.signal += Double(c)
                track.rate += 0.15 * (-(slope * Double(N)) / (2 * Double.pi) - track.rate)
                track.off += track.rate
                track.bias += 0.3 * errMean
                pr = cr
                pi = ci
            }
        }
        if let out, out.margins != nil, !amps.isEmpty {
            let median = amps.sorted()[amps.count >> 1]
            let med = median == 0 ? 1 : median
            for i in amps.indices { out.margins![marginsFrom + i] *= min(1, amps[i] / med) }
        }
        return values
    }

    static func demodQam(_ x: [Float], _ at: Int, _ preset: BurstPreset, _ symbols: Int, _ track: inout Track, _ soft: inout [Double]) {
        let first = preset.firstBin
        let c = preset.carriers
        let bits = preset.bitsPerSymbol
        let ref = knownPhases(refSeed, c)
        let S = N + guardLen
        let shiftRef = jsRound(track.off)
        let (r0, i0) = bins(x, at + shiftRef, first, c)
        var sr = 0.0
        var si = 0.0
        for k in 0..<(c - 1) {
            let d = ref[k + 1] - ref[k]
            let ar = r0[k + 1] * r0[k] + i0[k + 1] * i0[k]
            let ai = i0[k + 1] * r0[k] - r0[k + 1] * i0[k]
            sr += ar * cos(d) + ai * sin(d)
            si += ai * cos(d) - ar * sin(d)
        }
        let alpha = atan2(si, sr)
        let F = 3
        var noise = 0.0
        var lastDelay = 0.0
        var yr = [Double](repeating: 0, count: c), yi = yr, xr = yr, xi = yr, hr = yr, hi = yr
        let pilots = (0..<c).filter { QAM.isPilot($0, c) }
        guard symbols >= 1 else { return }
        for s in 1...symbols {
            let shift = jsRound(track.off)
            let (br, bi) = bins(x, at + s * S + shift, first, c)
            for k in 0..<c {
                let a = -alpha * Double(k)
                yr[k] = br[k] * cos(a) - bi[k] * sin(a)
                yi[k] = br[k] * sin(a) + bi[k] * cos(a)
            }
            for k in pilots {
                let p = QAM.pilotPhase(ref, s, k)
                xr[k] = cos(p)
                xi[k] = sin(p)
            }
            var dr = 0.0
            var di = 0.0
            for j in 0..<(pilots.count - 1) {
                let a = pilots[j], b = pilots[j + 1]
                let pa0 = yr[a] * xr[a] + yi[a] * xi[a], pa1 = yi[a] * xr[a] - yr[a] * xi[a]
                let pb0 = yr[b] * xr[b] + yi[b] * xi[b], pb1 = yi[b] * xr[b] - yr[b] * xi[b]
                let qr = pb0 * pa0 + pb1 * pa1
                let qi = pb1 * pa0 - pb0 * pa1
                let ang = atan2(qi, qr) / Double(b - a)
                let w = (qr * qr + qi * qi).squareRoot()
                dr += w * cos(ang)
                di += w * sin(ang)
            }
            let delay = Double(shift - shiftRef) - atan2(di, dr) * Double(N) / (2 * Double.pi)
            if s > 1 { track.rate += 0.15 * (delay - lastDelay - track.rate) }
            lastDelay = delay
            track.off = Double(shiftRef) + delay + track.rate
            for j in 0..<(pilots.count - 1) {
                let a = pilots[j], b = pilots[j + 1]
                let ar = yr[a] * xr[a] + yi[a] * xi[a]
                let ai = yi[a] * xr[a] - yr[a] * xi[a]
                let cr = yr[b] * xr[b] + yi[b] * xi[b]
                let ci = yi[b] * xr[b] - yr[b] * xi[b]
                for k in a...b {
                    let f = Double(k - a) / Double(b - a)
                    hr[k] = ar * (1 - f) + cr * f
                    hi[k] = ai * (1 - f) + ci * f
                }
            }
            for k in 0..<c where !QAM.isPilot(k, c) {
                var g = hr[k] * hr[k] + hi[k] * hi[k]
                if g == 0 { g = 1e-12 }
                let zr = (yr[k] * hr[k] + yi[k] * hi[k]) / g
                let zi = (yi[k] * hr[k] - yr[k] * hi[k]) / g
                (xr[k], xi[k]) = QAM.slice(zr, zi, bits: bits)
            }
            var resid = 0.0
            for k in 0..<c {
                var nr = 0.0, ni = 0.0, e = 0.0
                for q in max(0, k - F)...min(c - 1, k + F) where q != k {
                    nr += yr[q] * xr[q] + yi[q] * xi[q]
                    ni += yi[q] * xr[q] - yr[q] * xi[q]
                    e += xr[q] * xr[q] + xi[q] * xi[q]
                }
                hr[k] = nr / e
                hi[k] = ni / e
                let er = yr[k] - (hr[k] * xr[k] - hi[k] * xi[k])
                let ei = yi[k] - (hr[k] * xi[k] + hi[k] * xr[k])
                resid += er * er + ei * ei
            }
            noise = s == 1 ? resid / Double(c) : 0.8 * noise + 0.2 * resid / Double(c)
            var power = 0.0
            for k in 0..<c { power += hr[k] * hr[k] + hi[k] * hi[k] }
            track.signal += power / Double(c)
            track.noise += resid / Double(c) / (1 + 1 / Double(2 * F))
            for k in 0..<c where !QAM.isPilot(k, c) {
                var g = hr[k] * hr[k] + hi[k] * hi[k]
                if g == 0 { g = 1e-12 }
                let zr = (yr[k] * hr[k] + yi[k] * hi[k]) / g
                let zi = (yi[k] * hr[k] - yr[k] * hi[k]) / g
                QAM.soft(zr, zi, bits: bits, weight: g / (noise == 0 ? 1e-12 : noise), into: &soft)
            }
        }
    }

    static func frameSnr(_ track: Track, _ c: Int) -> Double {
        let perCarrier = track.signal / max(track.noise, 1e-12)
        return 10 * log10(perCarrier * Double(c) * (Double(sampleRate) / Double(N)) / 2500)
    }

    /// Every frequency in x moved by hz (via the analytic signal), as an SSB receiver's tuning knob would.
    static func shiftFrequency(_ x: ArraySlice<Float>, _ hz: Double) -> [Float] {
        var n = 1
        while n < x.count { n <<= 1 }
        var re = [Double](repeating: 0, count: n)
        var im = [Double](repeating: 0, count: n)
        for (i, v) in x.enumerated() { re[i] = Double(v) }
        fft(&re, &im)
        if n >= 2 {
            for k in 1..<(n / 2) {
                re[k] *= 2
                im[k] *= 2
            }
            for k in (n / 2 + 1)..<n {
                re[k] = 0
                im[k] = 0
            }
        }
        fft(&re, &im, inverse: true)
        return (0..<x.count).map { i in
            let a = 2 * Double.pi * hz * Double(i) / Double(sampleRate)
            return Float((re[i] * cos(a) - im[i] * sin(a)) / Double(n))
        }
    }

    static let template: [Double] = Array(symbol(syncFirst, knownPhases(syncSeed, syncCarriers))[guardLen...])
    static let quadratureTemplate: [Double] = Array(symbol(syncFirst, knownPhases(syncSeed, syncCarriers).map { $0 - Double.pi / 2 })[guardLen...])

    /// Normalized correlation (0-1) of the audio with the sync symbol at every lag, by overlap-save FFT.
    static func syncCorrelation(_ x: [Float]) -> [Float] {
        let t = template
        let q = quadratureTemplate
        let L = 8192
        var tr = [Double](repeating: 0, count: L), ti = tr, qr = tr, qi = tr
        for i in t.indices { tr[i] = t[i] }
        for i in q.indices { qr[i] = q[i] }
        fft(&tr, &ti)
        fft(&qr, &qi)
        var tEnergy = 0.0
        for v in t { tEnergy += v * v }
        var prefix = [Double](repeating: 0, count: x.count + 1)
        for i in x.indices { prefix[i + 1] = prefix[i] + Double(x[i]) * Double(x[i]) }
        var out = [Float](repeating: 0, count: max(0, x.count - N + 1))
        var xr = [Double](repeating: 0, count: L), xi = xr, re = xr, im = xr
        var s = 0
        while s < out.count {
            for i in 0..<L {
                xr[i] = s + i < x.count ? Double(x[s + i]) : 0
                xi[i] = 0
            }
            fft(&xr, &xi)
            for k in 0..<L {
                let ar = xr[k] * tr[k] + xi[k] * ti[k]
                let ai = xi[k] * tr[k] - xr[k] * ti[k]
                let br = xr[k] * qr[k] + xi[k] * qi[k]
                let bi = xi[k] * qr[k] - xr[k] * qi[k]
                re[k] = ar - bi
                im[k] = ai + br
            }
            fft(&re, &im, inverse: true)
            var lag = 0
            while lag <= L - N && s + lag < out.count {
                let e = prefix[s + lag + N] - prefix[s + lag]
                out[s + lag] = e > 1e-12 ? Float((re[lag] * re[lag] + im[lag] * im[lag]).squareRoot() / Double(L) / (e * tEnergy).squareRoot()) : 0
                lag += 1
            }
            s += L - N + 1
        }
        return out
    }

    /// Undo the interleaver's scatter of n soft bits, scaled so their mean size is 1.
    static func deinterleaveSoft(_ soft: [Double], _ n: Int) -> [Float] {
        let perm = Conv.interleaver(n)
        var scale = 0.0
        for i in 0..<n { scale += abs(i < soft.count ? soft[i] : 0) }
        scale = scale != 0 ? Double(n) / scale : 1
        return (0..<n).map { i in Float((perm[i] < soft.count ? soft[perm[i]] : 0) * scale) }
    }

    static func payloadSymbols(_ preset: BurstPreset, _ payloadBytes: Int) -> Int {
        let air = preset.inner.map { Conv.codedBits(payloadBytes, $0) } ?? payloadBytes * 8
        let per = preset.payloadCarriers * preset.bitsPerSymbol
        return (air + per - 1) / per
    }

    /// Find and decode every frame in 48 kHz mono audio. searchHz: also try the audio moved in
    /// 10 Hz steps up to that far either way (an HF receiver tuned off).
    static func demodulate(_ audio: [Float], threshold: Float = 0.4, searchHz: Int = 0) -> [DecodedBurstFrame] {
        let x = audio.map { $0.isFinite ? $0 : 0 }
        var frames = demodulateOnce(x, threshold)
        var hz = 10
        while hz <= searchHz {
            for shift in [hz, -hz] {
                for f in demodulateOnce(shiftFrequency(x[...], Double(shift)), threshold) where !frames.contains(where: { abs($0.start - f.start) < N }) {
                    frames.append(f)
                }
            }
            hz += 10
        }
        return frames.sorted { $0.start < $1.start }
    }

    static func demodulateOnce(_ x: [Float], _ threshold: Float) -> [DecodedBurstFrame] {
        let corr = syncCorrelation(x)
        var frames: [DecodedBurstFrame] = []
        let S = N + guardLen
        var i = 0
        while i < corr.count {
            defer { i += 1 }
            if corr[i] < threshold { continue }
            var best = i
            for j in i..<min(corr.count, i + S) where corr[j] > corr[best] { best = j }
            let at = max(0, best - backoff)
            var track = Track()
            let hv = demodDiff(x, at, syncFirst, syncCarriers, headerSymbols, 1, &track)
            var header = FrameBytes.decodeHeader(ungroup(hv, bits: 1, byteCount: FrameBytes.headerBytes + FrameBytes.headerParity))
            var preset = header.flatMap { h in BurstPreset.all.first { $0.id == h.presetId && !$0.codedHeader } }
            if header == nil || preset == nil {
                track = Track()
                let soft = Outputs(soft: true)
                _ = demodDiff(x, at, syncFirst, syncCarriers, codedHeaderSymbols, 1, &track, soft)
                let n = FrameBytes.headerBytes + FrameBytes.headerParity
                header = FrameBytes.decodeHeader(Conv.decode(deinterleaveSoft(soft.soft!, Conv.codedBits(n, headerCode)), bytes: n, headerCode))
                preset = header.flatMap { h in BurstPreset.all.first { $0.id == h.presetId && $0.codedHeader } }
            }
            guard let header, let preset else {
                i = best
                continue
            }
            let c = preset.carriers
            let plen = FrameBytes.payloadLength(header.messageLength, preset.parity)
            let syms = payloadSymbols(preset, plen)
            let refAt = at + (1 + headerSymbols(for: preset)) * S
            if Double(refAt) + Double(syms * S + N) * 0.999 > Double(x.count + backoff) { break }
            let offsetHz = track.bias * Double(sampleRate) / (2 * Double.pi * Double(S))
            var src = x
            var srcAt = refAt
            if abs(offsetHz) > 0.25 {
                let from = max(0, refAt - S)
                let to = min(x.count, refAt + (syms + 2) * S + Int((Double(syms * S) * 0.001).rounded(.up)))
                src = shiftFrequency(x[from..<to], -offsetHz)
                srcAt = refAt - from
                track.bias = 0
            }
            track.signal = 0
            track.noise = 0
            let outs = Outputs(margins: true, soft: preset.inner != nil)
            var pv: [Int] = []
            if preset.qam {
                demodQam(src, srcAt, preset, syms, &track, &outs.soft!)
            } else {
                pv = demodDiff(src, srcAt, preset.firstBin, c, syms, preset.bitsPerSymbol, &track, outs)
            }
            let result: (batch: [UInt8], corrected: Bool)?
            if let inner = preset.inner {
                let bytes = Conv.decode(deinterleaveSoft(outs.soft!, Conv.codedBits(plen, inner)), bytes: plen, inner)
                result = FrameBytes.decodePayload(bytes, messageLength: header.messageLength, parity: preset.parity)
            } else {
                result = FrameBytes.decodePayload(ungroup(pv, bits: preset.bitsPerSymbol, byteCount: plen), messageLength: header.messageLength, parity: preset.parity,
                                                  margins: byteMargins(outs.margins!, bits: preset.bitsPerSymbol, byteCount: plen))
            }
            let end = refAt + backoff - guardLen + (syms + 1) * S + jsRound(track.off)
            if let result {
                frames.append(DecodedBurstFrame(presetId: header.presetId, messageLength: header.messageLength, callSign: header.callSign, preset: preset.name,
                                                batch: result.batch, start: best - guardLen, end: end, corrected: result.corrected, snrDb: frameSnr(track, c)))
                i = end - 1
            } else {
                i = best
            }
        }
        return frames
    }
}

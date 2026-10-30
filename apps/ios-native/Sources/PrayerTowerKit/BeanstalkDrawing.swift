import Foundation

/// The Beanstalk's drawing, ported from Steve's Claude Design file "Beanstalk feed" (Main.dc.html),
/// the same geometry as apps/mobile/src/layouts/beanstalk.tsx: the vine round each post, the stalk
/// below it with the comments on big tilted leaves, and each post's sway off the centre line.
public enum BeanDraw {
    /// One step of a drawing, in the same coordinates as the view that draws it.
    public enum Seg: Sendable, Equatable {
        case move(Double, Double)
        case line(Double, Double)
        case curve(Double, Double, Double, Double, Double, Double)
        case close
        case circle(Double, Double, Double)
    }
    public typealias Drawing = [Seg]

    /// The frame's vine is drawn this far round the post on every side, so nothing is cut off.
    public static let pad = 26.0

    static func polyline(_ pts: [(Double, Double)]) -> Drawing {
        pts.enumerated().map { i, p in i == 0 ? .move(p.0, p.1) : .line(p.0, p.1) }
    }

    static func length(_ pts: [(Double, Double)]) -> Double {
        var l = 0.0
        for i in 1..<max(1, pts.count) { l += hypot(pts[i].0 - pts[i - 1].0, pts[i].1 - pts[i - 1].1) }
        return l
    }

    public static func smooth(_ t: Double) -> Double {
        let c = min(1, max(0, t))
        return c * c * (3 - 2 * c)
    }

    /// A small vine leaf from (px,py) pointing along (dx,dy), `lf` long, with its midrib.
    static func vineLeaf(_ px: Double, _ py: Double, _ dx0: Double, _ dy0: Double, _ lf: Double, stalk: Bool = false) -> Drawing {
        let dl = hypot(dx0, dy0) == 0 ? 1 : hypot(dx0, dy0)
        let dx = dx0 / dl, dy = dy0 / dl
        let vx = -dy, vy = dx
        let bx = stalk ? px + dx * 3 : px, by = stalk ? py + dy * 3 : py
        func q(_ u: Double, _ v: Double) -> (Double, Double) { (bx + dx * u + vx * v, by + dy * u + vy * v) }
        let o = q(0, 0), a1 = q(lf * 0.3, lf * 0.34), a2 = q(lf * 0.75, lf * 0.3), tip = q(lf, 0)
        let b1 = q(lf * 0.75, -lf * 0.3), b2 = q(lf * 0.3, -lf * 0.34), rib = q(lf * 0.8, 0)
        var d: Drawing = stalk ? [.move(px, py), .line(o.0, o.1)] : [.move(o.0, o.1)]
        d += [.curve(a1.0, a1.1, a2.0, a2.1, tip.0, tip.1), .curve(b1.0, b1.1, b2.0, b2.1, o.0, o.1), .close, .move(o.0, o.1), .line(rib.0, rib.1)]
        return d
    }

    public struct FrameVine: Sendable {
        public let w: Double, h: Double
        /// The left and the right half of each strand, each from the bottom middle to the top middle.
        public let s1: [Drawing], s2: [Drawing]
        public let len1: Double, len2: Double
        /// Leaves in five groups round the frame, light and dark, that show one group after another.
        public let la: [Drawing], lb: [Drawing]
        public let tendrils: Drawing
        public let flower: Drawing
        public let heart: Drawing
        public let flowerAt: (x: Double, y: Double)
    }

    /// The vine round a w×h post (the design's geo()); coordinates are in a box `pad` larger on every side.
    public static func frameVine(w: Double, h: Double) -> FrameVine {
        let P = pad, r = 20.0
        let l0 = P, t0 = P, b0 = P + h, cx = P + w / 2
        let lam = 92.0, step = 4.0, small = w < 420
        var base: [(x: Double, y: Double, nx: Double, ny: Double)] = []
        func seg(_ x0: Double, _ y0: Double, _ x1: Double, _ y1: Double, _ nx: Double, _ ny: Double) {
            let n = max(1, Int((hypot(x1 - x0, y1 - y0) / step).rounded()))
            for i in 0..<n {
                let t = Double(i) / Double(n)
                base.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, nx, ny))
            }
        }
        func arc(_ ax: Double, _ ay: Double, _ a0: Double, _ a1: Double) {
            let n = max(2, Int((r * abs(a1 - a0) / step).rounded()))
            for i in 0..<n {
                let a = a0 + (a1 - a0) * Double(i) / Double(n)
                base.append((ax + r * cos(a), ay + r * sin(a), cos(a), sin(a)))
            }
        }
        seg(cx, b0, l0 + r, b0, 0, 1)
        arc(l0 + r, b0 - r, Double.pi / 2, Double.pi)
        seg(l0, b0 - r, l0, t0 + r, -1, 0)
        arc(l0 + r, t0 + r, Double.pi, 1.5 * Double.pi)
        seg(l0 + r, t0, cx, t0, 0, -1)
        base.append((cx, t0, 0, -1))
        var S: [Double] = [0]
        for i in 1..<base.count { S.append(S[i - 1] + hypot(base[i].x - base[i - 1].x, base[i].y - base[i - 1].y)) }
        let lt = S[S.count - 1]
        func idxAt(_ s: Double) -> Int {
            var lo = 0, hi = S.count - 1
            while lo < hi {
                let mid = (lo + hi) / 2
                if S[mid] < s { lo = mid + 1 } else { hi = mid }
            }
            return lo
        }
        var la = [Drawing](repeating: [], count: 5), lb = [Drawing](repeating: [], count: 5)
        var td: Drawing = []
        func half(_ mir: Bool, _ ph: Double) -> (s1: [(Double, Double)], s2: [(Double, Double)]) {
            func nX(_ i: Int) -> Double { mir ? -base[i].nx : base[i].nx }
            func strand(_ amp: Double, _ phase: Double) -> [(Double, Double)] {
                base.indices.map { i in
                    let b = base[i], s = S[i]
                    let env = max(0, min(1, s / 40, (lt - s) / 40))
                    let o = amp * env * sin(2 * Double.pi * s / lam + phase)
                    let x = b.x + b.nx * o
                    return (mir ? 2 * cx - x : x, b.y + b.ny * o)
                }
            }
            let s1 = strand(5.5, ph), s2 = strand(4.5, ph + Double.pi)
            var k = 0
            var s = 34 + (mir ? lam * 0.25 : 0)
            while s < lt - 22 {
                let i = idxAt(s)
                let p = s1[i], q = s1[min(i + 1, s1.count - 1)]
                var tx = q.0 - p.0, ty = q.1 - p.1
                let tl = hypot(tx, ty) == 0 ? 1 : hypot(tx, ty)
                tx /= tl
                ty /= tl
                let side: Double = k % 2 == 1 ? 1 : -1
                let dx = nX(i) * 0.8 + tx * 0.62 * side, dy = base[i].ny * 0.8 + ty * 0.62 * side
                let lf = (small ? 18.0 : 24.0) * (0.82 + 0.36 * (Double((k * 37 + (mir ? 5 : 0)) % 10) / 10))
                let d = vineLeaf(p.0, p.1, dx, dy, lf, stalk: true)
                let g = min(4, Int((s / lt * 5).rounded(.down)))
                if k % 3 == 0 { lb[g] += d } else { la[g] += d }
                s += lam / 2
                k += 1
            }
            var j = 0
            s = lam * 0.8 + (mir ? lam * 0.45 : 0)
            while s < lt - 40 {
                let i = idxAt(s)
                let p = s2[i]
                let ccx = p.0 + nX(i) * 10, ccy = p.1 + base[i].ny * 10
                let a0 = atan2(p.1 - ccy, p.0 - ccx)
                let spin: Double = (j % 2 == 1 ? 1 : -1) * (mir ? -1 : 1)
                td.append(.move(p.0, p.1))
                var t = 0.3
                while t <= 3 * Double.pi {
                    let rad = 10 * (1 - t / (3.6 * Double.pi))
                    td.append(.line(ccx + rad * cos(a0 + spin * t), ccy + rad * sin(a0 + spin * t)))
                    t += 0.3
                }
                s += lam * 1.9
                j += 1
            }
            return (s1, s2)
        }
        let a = half(false, 0), b = half(true, 1.4)
        let fx = cx, fy = t0 - 2
        let flower: Drawing = (0..<5).map { m in
            let ang = -Double.pi / 2 + Double(m) * 2 * Double.pi / 5
            return .circle(fx + cos(ang) * 6.5, fy + sin(ang) * 6.5, 5)
        }
        return FrameVine(
            w: w + 2 * P, h: h + 2 * P,
            s1: [polyline(a.s1), polyline(b.s1)], s2: [polyline(a.s2), polyline(b.s2)],
            len1: max(length(a.s1), length(b.s1)).rounded(.up) + 4, len2: max(length(a.s2), length(b.s2)).rounded(.up) + 4,
            la: la, lb: lb, tendrils: td, flower: flower, heart: [.circle(fx, fy, 4)], flowerAt: (fx, fy)
        )
    }

    /// The post's width in the lane: room either side for the vine, the locket and the sway.
    public static func frameWidth(_ lane: Double) -> Double { max(200, min(540, lane * 0.9 - 60)) }

    /// How far a post may sit off the centre line: never more than 15% of the lane, and never so far its vine leaves the screen.
    public static func maxShift(_ lane: Double) -> Double { max(0, min(lane * 0.15, (lane - frameWidth(lane)) / 2 - 30)) }

    /// Each post sits a little left or right of the centre line, by turns, by an amount of its own (from its id).
    public static func postShift(id: String, index: Int, lane: Double) -> Double {
        var h: UInt32 = 0
        for c in id.utf16 { h = h &* 31 &+ UInt32(c) }
        let mag = 0.55 + 0.45 * (Double(h % 1000) / 999)
        return (index % 2 == 0 ? -1 : 1) * mag * maxShift(lane)
    }

    /// One leaf hanging below a post.
    public struct Leaf: Sendable, Identifiable {
        public let note: Beanstalk.Note
        /// 1 a comment, 2 a reply, 3 a reply to a reply.
        public let level: Int
        public let path: [Int]
        public let x: Double, y: Double, lw: Double
        /// -1 hangs left of the stalk, 1 right.
        public let side: Int
        public let ang: Double
        /// Which of the three leaf greens.
        public let fill: Int
        public let replies: Int
        public let open: Bool
        /// Which of the first three it is, for the unfurl stagger.
        public let k: Int
        public var id: String { note.id }
    }

    public struct LeafState: Sendable, Equatable {
        public var page = 0
        /// The open comment (by index in all of them) and the open reply under it.
        public var open: Int?
        public var open2: Int?
        /// More than three comments sit in an uncountable cluster until it's tapped; then they
        /// spread out, `shown` at a time (Steve, 2026-10-30).
        public var spread = false
        public var shown = Beanstalk.spreadCount
        public init(page: Int = 0, open: Int? = nil, open2: Int? = nil, spread: Bool = false, shown: Int = Beanstalk.spreadCount) {
            self.page = page
            self.open = open
            self.open2 = open2
            self.spread = spread
            self.shown = shown
        }
    }

    public struct Hanging: Sendable {
        public let H: Double
        public let leaves: [Leaf]
        public let stems: Drawing
        public let s1: Drawing, s2: Drawing
        public let l1: Double, l2: Double
        public let deco: Drawing
        public let pager: Bool
        public let pgY: Double
        public let page: Int, pages: Int
        /// The comments are still in their closed cluster, drawn at `pgY` on the stalk.
        public let cluster: Bool
        /// Spread out, with more comments than shown: a smaller cluster at `pgY` reveals the next ones.
        public let more: Bool
    }

    /// The stalk below a post and the leaves on it (the design's layoutComments and vineDown).
    /// `bend` moves the stalk sideways down its length, to where the next post sits.
    public static func hanging(w: Double, top: [Beanstalk.Note], kids: [String: [Beanstalk.Note]], cv: LeafState, seed: Int, bend: Double = 0) -> Hanging {
        let deg = Double.pi / 180
        let cx = w / 2
        // 10% larger than first drawn (Steve, 2026-10-30).
        let lw = (max(170, w * 0.5) * 1.1).rounded()
        let angles = [22.0, 15, 27]
        let per = Beanstalk.perPage
        let pages = 1, page = 0
        let cluster = top.count > per && !cv.spread
        let shown = cluster ? [] : Array(top.prefix(cv.spread ? cv.shown : per))
        let more = cv.spread && top.count > shown.count
        var leaves: [Leaf] = [], subs: [Leaf] = []
        var stems: Drawing = []
        var maxB = 60.0
        var H0 = 400.0
        func sway(_ y: Double) -> Double { bend * smooth(y / H0) }
        func vx(_ y: Double) -> Double { cx + 7 * sin(y / 30) + sway(y) }
        func place() {
            leaves = []
            subs = []
            stems = []
            maxB = 60
            var prevY = -40.0
            var sideBottom: [Int: Double] = [-1: 0, 1: 0]
            for (k, c) in shown.enumerated() {
                let gi = page * per + k
                let side = k % 2 == 1 ? 1 : -1
                let sd = Double(side)
                let y = max(prevY + 77, 30, (sideBottom[side] ?? 0) + 33)
                prevY = y
                let tipX = cx + sway(y + 26) + sd * 16, tipY = y + 26
                let a = angles[k % angles.count]
                let vX = vx(y)
                stems += [.move(vX, y), .curve(vX + sd * 8, y + 8, tipX - sd * 6, tipY - 10, tipX, tipY)]
                let reps = kids[c.id] ?? []
                let open = cv.open == gi && !reps.isEmpty
                leaves.append(Leaf(note: c, level: 1, path: [gi], x: (side < 0 ? tipX - lw : tipX).rounded(), y: (tipY - 55).rounded(), lw: lw, side: side, ang: sd * a, fill: (k + seed) % 3, replies: reps.count, open: open, k: k))
                let ccX = tipX + sd * (lw / 2) * cos(a * deg), ccY = tipY + (lw / 2) * sin(a * deg)
                var bottom = ccY + 64
                if open {
                    // Replies are small leaves of a true leaf's proportions (half as tall as wide).
                    let rw = (lw * 0.6).rounded(), rh = (rw * 0.52).rounded()
                    var cur = ccY + 54
                    for (m, r) in reps.prefix(per).enumerated() {
                        let baseX = side < 0 ? ccX + rw / 2 : ccX - rw / 2, baseY = cur + 6
                        stems += [.move(ccX, ccY + 28), .curve(ccX, baseY - 18, baseX - sd * 4, baseY - 12, baseX, baseY)]
                        let reps2 = kids[r.id] ?? []
                        let open2 = cv.open2 == m && !reps2.isEmpty
                        let ra = 12.0
                        subs.append(Leaf(note: r, level: 2, path: [gi, m], x: (side < 0 ? baseX - rw : baseX).rounded(), y: (baseY - rh / 2).rounded(), lw: rw, side: side, ang: sd * ra, fill: (k + m + seed + 1) % 3, replies: reps2.count, open: open2, k: m))
                        let rcX = baseX + sd * (rw / 2) * cos(ra * deg), rcY = baseY + (rw / 2) * sin(ra * deg)
                        cur = rcY + rh / 2 + 12
                        if open2 {
                            let qw = (lw * 0.48).rounded(), qh = (qw * 0.52).rounded()
                            for (z, q) in reps2.prefix(per).enumerated() {
                                let bX = side < 0 ? rcX + qw / 2 : rcX - qw / 2, bY = cur + 4
                                stems += [.move(rcX, rcY + 22), .curve(rcX, bY - 14, bX - sd * 3, bY - 10, bX, bY)]
                                subs.append(Leaf(note: q, level: 3, path: [gi, m, z], x: (side < 0 ? bX - qw : bX).rounded(), y: (bY - qh / 2).rounded(), lw: qw, side: side, ang: sd * 9, fill: (k + m + z + seed + 2) % 3, replies: 0, open: false, k: z))
                                cur = bY + (qw / 2) * sin(9 * deg) + qh / 2 + 12
                            }
                        }
                    }
                    bottom = max(bottom, cur)
                }
                sideBottom[side] = bottom
                maxB = max(maxB, bottom)
            }
        }
        place()
        let pager = false
        var H = top.isEmpty ? 96 : (maxB + 20).rounded()
        var pgY = 0.0
        if cluster {
            // Room for the clump and the next post's locket below it.
            pgY = 110
            H = 300
        } else if more {
            pgY = H + 20
            H += 90
        }
        if bend != 0 {
            H0 = H
            place()
        }
        // The two strands, swaying in and out but meeting the posts above and below at the middle.
        func env(_ y: Double) -> Double { max(0, min(1, y / 26, (H - y) / 26)) }
        func strand(_ amp: Double, _ ph: Double) -> [(Double, Double)] {
            var pts: [(Double, Double)] = []
            var y = 0.0
            while y <= H {
                pts.append((cx + sway(y) + amp * env(y) * sin(y / 30 + ph), y))
                y += 4
            }
            pts.append((cx + bend, H))
            return pts
        }
        let s1 = strand(7, 0), s2 = strand(5.5, Double.pi)
        var deco: Drawing = []
        if top.isEmpty || !(cluster || more) {
            let y = H - 30
            deco += vineLeaf(cx + sway(y) + 7 * env(y) * sin(y / 30), y, 0.9, 0.44, 14)
        }
        if !top.isEmpty && H > 120 {
            let y = (H * 0.5).rounded()
            deco += vineLeaf(cx + sway(y) + 7 * env(y) * sin(y / 30), y, shown.count % 2 == 1 ? -1 : 1, 0.5, 15)
        }
        return Hanging(H: H, leaves: leaves + subs, stems: stems, s1: polyline(s1), s2: polyline(s2), l1: length(s1).rounded(.up) + 4, l2: length(s2).rounded(.up) + 4, deco: deco, pager: pager, pgY: pgY, page: page, pages: pages, cluster: cluster, more: more)
    }
}

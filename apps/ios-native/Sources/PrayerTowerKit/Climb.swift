import Foundation

/// The Mountain Climber skin's drawing math (Steve, 2026-10-31), the same as
/// apps/mobile/src/layouts/climb.tsx: the chase, the climber's side-view poses, the rope,
/// the stone facets and the cliff edge down the left of the screen.
public enum Climb {
    /// The cliff edge (the wall's profile) and where the posts start to the right of it.
    public static let edgeX: Double = 54
    public static let gutter: Double = 74
    /// How far down the screen he waits for you, as a share of its height.
    public static let anchor: Double = 0.38
    /// How much of the gap he closes each frame: high enough to look fast.
    public static let catchUp: Double = 0.16
    /// How many comments sit on rocks under a post.
    public static let rocksShown = 3

    public enum Mode: Sendable, Equatable { case up, down, still }

    /// One step of the chase: where he is now on the wall, and whether he is climbing, rappelling or still.
    public static func chase(_ y: Double, to target: Double, k: Double = catchUp) -> (y: Double, step: Double, mode: Mode) {
        let dy = target - y
        let step = abs(dy) < 0.6 ? dy : dy * k
        let mode: Mode = step < -0.7 ? .up : step > 0.7 ? .down : .still
        return (y + step, step, mode)
    }

    /// His pose from the side, facing the wall on his right. Angles are degrees; arms turn with
    /// his lean. `off` is how far his harness hangs out from the cliff edge.
    public struct Pose: Sendable, Equatable {
        public var lean: Double, off: Double, axeInHand: Bool
        public var nearArm: Double, farArm: Double, nearHip: Double, nearKnee: Double, farHip: Double, farKnee: Double
    }

    /// Climbing up (pickaxe swinging, legs stepping), rappelling down (leaning back, kicking off the wall), or hanging still.
    public static func pose(_ mode: Mode, p: Double, t: Double) -> Pose {
        switch mode {
        case .up:
            let s = sin(p)
            return Pose(lean: 6, off: 10, axeInHand: true, nearArm: -150 - 20 * s, farArm: -150 + 20 * s,
                        nearHip: -62 + 24 * s, nearKnee: 82 - 24 * s, farHip: -62 - 24 * s, farKnee: 82 + 24 * s)
        case .down:
            let out = abs(sin(p * 0.55))
            return Pose(lean: -38 + 6 * out, off: 23 + 13 * out, axeInHand: false, nearArm: -125, farArm: 75,
                        nearHip: -88 + 18 * out, nearKnee: 8 + 60 * out, farHip: -80 + 18 * out, farKnee: 14 + 60 * out)
        case .still:
            return Pose(lean: -18 + 2 * sin(t * 1.3), off: 19, axeInHand: false, nearArm: -150, farArm: 55,
                        nearHip: -76, nearKnee: 32, farHip: -68, farKnee: 40)
        }
    }

    /// Where his near hand is, relative to his harness, so the rope above can run through it.
    public static func nearHand(_ pose: Pose) -> (x: Double, y: Double) {
        let lean = pose.lean * .pi / 180
        let a = (pose.lean + pose.nearArm) * .pi / 180
        return (2 * cos(lean) + 27 * sin(lean) - 21 * sin(a), 2 * sin(lean) - 27 * cos(lean) + 21 * cos(a))
    }

    /// A light, seeded random sequence, so the rock looks the same every time.
    struct Seeded {
        var s: Int
        init(_ seed: Int) { s = (seed * 7919 + 13) % 233_280 }
        mutating func next() -> Double {
            s = (s * 9301 + 49297) % 233_280
            return Double(s) / 233_280
        }
    }

    /// Light browns and grays for the stone facets.
    public static let facetColors = ["#C4B8A4", "#BAAD98", "#AFA28D", "#B4AFA5", "#A9A399", "#C9BFAE", "#BCB2A2", "#A89A84"]

    public struct Facet: Sendable, Equatable {
        public let points: [(x: Double, y: Double)]
        public let color: String
        public static func == (a: Facet, b: Facet) -> Bool { a.color == b.color && a.points.map(\.x) == b.points.map(\.x) && a.points.map(\.y) == b.points.map(\.y) }
    }

    /// Stone facets for a band of rock w × h: a jittered grid whose top and bottom edges are straight, so bands meet in a ledge. Plus a crack or two.
    public static func rock(w: Double, h: Double, seed: Int) -> (facets: [Facet], cracks: [[(x: Double, y: Double)]]) {
        var rnd = Seeded(seed)
        let cols = max(2, Int((w / 58).rounded())), rows = max(1, Int((h / 44).rounded()))
        let cw = w / Double(cols), ch = h / Double(rows)
        var pts: [[(x: Double, y: Double)]] = []
        for i in 0...cols {
            var col: [(x: Double, y: Double)] = []
            for j in 0...rows {
                let edgeX = i == 0 || i == cols, edgeY = j == 0 || j == rows
                let x = Double(i) * cw + (edgeX ? 0 : (rnd.next() - 0.5) * cw * 0.5)
                let y = Double(j) * ch + (edgeY ? 0 : (rnd.next() - 0.5) * ch * 0.55)
                col.append((x, y))
            }
            pts.append(col)
        }
        var facets: [Facet] = []
        func color(_ r: inout Seeded) -> String { facetColors[min(facetColors.count - 1, Int(r.next() * Double(facetColors.count)))] }
        for i in 0..<cols {
            for j in 0..<rows {
                let a = pts[i][j], b = pts[i + 1][j], c = pts[i + 1][j + 1], d = pts[i][j + 1]
                if rnd.next() < 0.4 {
                    facets.append(Facet(points: [a, b, c], color: color(&rnd)))
                    facets.append(Facet(points: [a, c, d], color: color(&rnd)))
                } else {
                    facets.append(Facet(points: [a, b, c, d], color: color(&rnd)))
                }
            }
        }
        var cracks: [[(x: Double, y: Double)]] = []
        for _ in 0..<max(1, Int((h / 260).rounded())) {
            var x = 10 + rnd.next() * (w - 20)
            var y = 20 + rnd.next() * max(h - 120, 10)
            var line = [(x: x, y: y)]
            let dir: Double = rnd.next() < 0.5 ? -1 : 1
            for _ in 0..<(4 + Int(rnd.next() * 4)) {
                x += dir * (8 + rnd.next() * 22)
                y += 6 + rnd.next() * 20
                line.append((x, y))
            }
            cracks.append(line)
        }
        return (facets, cracks)
    }

    /// The cliff edge for a band h tall: jagged, but at `edgeX` at its top and bottom so bands join.
    public static func cliffEdge(h: Double, seed: Int) -> [(x: Double, y: Double)] {
        var rnd = Seeded(seed + 101)
        var pts: [(x: Double, y: Double)] = [(edgeX, 0)]
        var y: Double = 22
        while y < h - 11 {
            pts.append((edgeX + (rnd.next() - 0.5) * 10 + (rnd.next() < 0.12 ? 6 : 0), y))
            y += 22
        }
        pts.append((edgeX, h))
        return pts
    }

    /// Rock shapes for the comments, as fractions of their box.
    public static let rockShapes: [[(x: Double, y: Double)]] = [
        [(0.04, 0.18), (0.14, 0.02), (0.46, 0.08), (0.7, 0), (0.96, 0.12), (1, 0.58), (0.9, 0.92), (0.62, 1), (0.3, 0.94), (0.06, 1), (0, 0.6)],
        [(0, 0.3), (0.1, 0.06), (0.38, 0), (0.64, 0.1), (0.88, 0.02), (1, 0.34), (0.97, 0.78), (0.8, 1), (0.44, 0.92), (0.16, 1), (0.02, 0.76)],
        [(0.06, 0.08), (0.3, 0), (0.58, 0.06), (0.84, 0), (1, 0.24), (0.94, 0.54), (1, 0.84), (0.74, 1), (0.4, 0.95), (0.12, 1), (0, 0.7), (0.03, 0.4)],
    ]

    /// Each post's square of rock has its own smoothed, slightly uneven corners (top-leading, top-trailing, bottom-trailing, bottom-leading).
    public static let corners: [(Double, Double, Double, Double)] = [(22, 30, 18, 26), (28, 18, 30, 20), (18, 26, 24, 30), (30, 22, 20, 18)]
}

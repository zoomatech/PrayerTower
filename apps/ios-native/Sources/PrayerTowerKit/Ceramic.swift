import Foundation

/// The Ceramic Figurine skin (Steve, 2026-10-31), matching layouts/ceramic.tsx in the Expo app:
/// which figurine stands where, and the design's SVG outlines read into drawable segments.
public enum Ceramic {
    /// The five figurine looks. Every one has angel wings.
    public enum Look: String, Sendable, CaseIterable, Identifiable {
        case angel, garden, shepherd, choir, dove
        public var id: String { rawValue }
    }

    /// The member's figurine style: one look, or all five mixed through the feed.
    public static let choices: [String] = ["mix"] + Look.allCases.map(\.rawValue)

    /// A little statue points at every third post.
    public static let pointEvery = 3
    /// At most this many comments flop down; the rest open on the post's page.
    public static let opened = 5

    /// The figurine for the n-th statue in the feed.
    public static func look(_ choice: String, _ n: Int) -> Look {
        if let one = Look(rawValue: choice) { return one }
        return Look.allCases[((n % Look.allCases.count) + Look.allCases.count) % Look.allCases.count]
    }

    /// The figurines on post `index`: its hauling angel, and the pointing statue on every third post.
    public static func figures(_ choice: String, index: Int) -> (angel: Look, statue: Look?, left: Bool) {
        let n = index + index / pointEvery
        let pointer = index % pointEvery == 1
        return (look(choice, n), pointer ? look(choice, n + 1) : nil, index.isMultiple(of: 2))
    }

    /// Every reply under a comment, however deep it was posted, in order.
    public static func replies(to id: String, in kids: [String: [Beanstalk.Note]]) -> [Beanstalk.Note] {
        var out: [Beanstalk.Note] = []
        func walk(_ p: String) {
            for r in kids[p] ?? [] {
                out.append(r)
                walk(r.id)
            }
        }
        walk(id)
        return out
    }

    /// The post that sits nearest the middle of the screen, from each post's middle on screen.
    public static func centered(_ mids: [Int: Double], screen: Double) -> Int? {
        mids.min { abs($0.value - screen / 2) < abs($1.value - screen / 2) }?.key
    }
}

/// An SVG path's `d` attribute read into absolute segments (M, L, H, V, C, S, Q, T, A, Z and
/// their relative forms), so the design's drawings are drawn exactly, never redrawn by eye.
public enum SVGPath {
    public enum Seg: Sendable, Equatable {
        case move(Double, Double)
        case line(Double, Double)
        case cubic(Double, Double, Double, Double, Double, Double)
        case quad(Double, Double, Double, Double)
        case close
    }

    static func tokens(_ d: String) -> [Substring] {
        var out: [Substring] = []
        var i = d.startIndex
        while i < d.endIndex {
            let c = d[i]
            if c.isLetter, c != "e", c != "E" {
                out.append(d[i...i])
                i = d.index(after: i)
            } else if c == "-" || c == "+" || c == "." || c.isNumber {
                let start = i
                var dot = c == "."
                i = d.index(after: i)
                while i < d.endIndex {
                    let n = d[i]
                    if n.isNumber {
                        i = d.index(after: i)
                    } else if n == ".", !dot {
                        dot = true
                        i = d.index(after: i)
                    } else if n == "e" || n == "E" {
                        i = d.index(after: i)
                        if i < d.endIndex, d[i] == "-" || d[i] == "+" { i = d.index(after: i) }
                    } else {
                        break
                    }
                }
                out.append(d[start..<i])
            } else {
                i = d.index(after: i)
            }
        }
        return out
    }

    public static func parse(_ d: String) -> [Seg] {
        let t = tokens(d)
        var segs: [Seg] = []
        var k = 0
        var cmd: Character = "M"
        var x = 0.0, y = 0.0, sx = 0.0, sy = 0.0
        // The last control point, for S and T.
        var cx = 0.0, cy = 0.0
        var last: Character = " "
        func num() -> Double? {
            guard k < t.count, let v = Double(t[k]) else { return nil }
            k += 1
            return v
        }
        while k < t.count {
            if let ch = t[k].first, ch.isLetter {
                cmd = ch
                k += 1
                if ch == "Z" || ch == "z" {
                    segs.append(.close)
                    x = sx
                    y = sy
                    last = "Z"
                    continue
                }
            }
            let rel = cmd.isLowercase
            let ox = rel ? x : 0, oy = rel ? y : 0
            switch cmd.uppercased().first! {
            case "M":
                guard let a = num(), let b = num() else { k += 1; continue }
                x = ox + a
                y = oy + b
                sx = x
                sy = y
                segs.append(.move(x, y))
                // Further pairs after a move are lines.
                cmd = rel ? "l" : "L"
            case "L":
                guard let a = num(), let b = num() else { k += 1; continue }
                x = ox + a
                y = oy + b
                segs.append(.line(x, y))
            case "H":
                guard let a = num() else { k += 1; continue }
                x = ox + a
                segs.append(.line(x, y))
            case "V":
                guard let b = num() else { k += 1; continue }
                y = (rel ? y : 0) + b
                segs.append(.line(x, y))
            case "C":
                guard let a = num(), let b = num(), let c = num(), let e = num(), let f = num(), let g = num() else { k += 1; continue }
                cx = ox + c
                cy = oy + e
                x = ox + f
                y = oy + g
                segs.append(.cubic(ox + a, oy + b, cx, cy, x, y))
            case "S":
                guard let c = num(), let e = num(), let f = num(), let g = num() else { k += 1; continue }
                let (ax, ay) = "CS".contains(last) ? (2 * x - cx, 2 * y - cy) : (x, y)
                cx = ox + c
                cy = oy + e
                x = ox + f
                y = oy + g
                segs.append(.cubic(ax, ay, cx, cy, x, y))
            case "Q":
                guard let a = num(), let b = num(), let c = num(), let e = num() else { k += 1; continue }
                cx = ox + a
                cy = oy + b
                x = ox + c
                y = oy + e
                segs.append(.quad(cx, cy, x, y))
            case "T":
                guard let c = num(), let e = num() else { k += 1; continue }
                (cx, cy) = "QT".contains(last) ? (2 * x - cx, 2 * y - cy) : (x, y)
                x = ox + c
                y = oy + e
                segs.append(.quad(cx, cy, x, y))
            case "A":
                guard let rx = num(), let ry = num(), let rot = num(), let large = num(), let sweep = num(), let a = num(), let b = num() else { k += 1; continue }
                let ex = ox + a, ey = oy + b
                segs += arc(from: (x, y), to: (ex, ey), rx: rx, ry: ry, rotation: rot, large: large != 0, sweep: sweep != 0)
                x = ex
                y = ey
            default:
                k += 1
            }
            last = cmd.uppercased().first!
        }
        return segs
    }

    /// An elliptical arc as cubic curves (the SVG spec's endpoint-to-center conversion).
    static func arc(from p0: (Double, Double), to p1: (Double, Double), rx rx0: Double, ry ry0: Double, rotation: Double, large: Bool, sweep: Bool) -> [Seg] {
        if p0 == p1 { return [] }
        var rx = abs(rx0), ry = abs(ry0)
        if rx == 0 || ry == 0 { return [.line(p1.0, p1.1)] }
        let phi = rotation * .pi / 180
        let cosP = cos(phi), sinP = sin(phi)
        let dx = (p0.0 - p1.0) / 2, dy = (p0.1 - p1.1) / 2
        let x1 = cosP * dx + sinP * dy
        let y1 = -sinP * dx + cosP * dy
        let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
        if lambda > 1 {
            rx *= lambda.squareRoot()
            ry *= lambda.squareRoot()
        }
        let num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
        let den = rx * rx * y1 * y1 + ry * ry * x1 * x1
        var co = (max(0, num) / den).squareRoot()
        if large == sweep { co = -co }
        let cxp = co * rx * y1 / ry
        let cyp = -co * ry * x1 / rx
        let cx = cosP * cxp - sinP * cyp + (p0.0 + p1.0) / 2
        let cy = sinP * cxp + cosP * cyp + (p0.1 + p1.1) / 2
        func angle(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
            let a = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
            return a
        }
        let t1 = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry)
        var dt = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry)
        if !sweep, dt > 0 { dt -= 2 * .pi }
        if sweep, dt < 0 { dt += 2 * .pi }
        let n = max(1, Int((abs(dt) / (.pi / 2)).rounded(.up)))
        let step = dt / Double(n)
        let kappa = 4.0 / 3.0 * tan(step / 4)
        var out: [Seg] = []
        var a = t1
        func point(_ t: Double) -> (Double, Double) {
            let ex = rx * cos(t), ey = ry * sin(t)
            return (cx + cosP * ex - sinP * ey, cy + sinP * ex + cosP * ey)
        }
        func deriv(_ t: Double) -> (Double, Double) {
            let ex = -rx * sin(t), ey = ry * cos(t)
            return (cosP * ex - sinP * ey, sinP * ex + cosP * ey)
        }
        for _ in 0..<n {
            let b = a + step
            let pa = point(a), pb = point(b), da = deriv(a), db = deriv(b)
            out.append(.cubic(pa.0 + kappa * da.0, pa.1 + kappa * da.1, pb.0 - kappa * db.0, pb.1 - kappa * db.1, pb.0, pb.1))
            a = b
        }
        return out
    }
}

/// The Ceramic Figurine skin's colors.
public struct CeramicLook: Sendable, Equatable {
    public var backdrop = RGB(hex: "#EAE6F1")!

    public init(_ theme: FeedTheme?) {
        backdrop = theme?.color("backdrop") ?? backdrop
    }
}

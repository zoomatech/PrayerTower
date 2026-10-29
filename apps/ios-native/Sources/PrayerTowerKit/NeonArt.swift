import Foundation

// The neon scenery for Neon Cinderella (`NeonScene` in apps/mobile/src/layouts/motifs.tsx):
// a castle, a pumpkin coach, a clock at midnight and a glass slipper, bent from glowing
// tubes between the requests. The drawings are the app's own SVG path data, kept the same
// here so both apps draw the same lines; the app turns them into SwiftUI paths.

/// One step of a drawing, with SVG arcs already turned into cubic curves.
public enum PathOp: Sendable, Equatable {
    case move(Double, Double)
    case line(Double, Double)
    case quad(Double, Double, cx: Double, cy: Double)
    case cubic(Double, Double, c1x: Double, c1y: Double, c2x: Double, c2y: Double)
    case close
}

/// Reads the absolute commands the scenes use (M L Q C A Z) from SVG path data.
public enum SVGPath {
    public static func parse(_ d: String) -> [PathOp] {
        var tokens: [String] = []
        var number = ""
        func flush() { if !number.isEmpty { tokens.append(number); number = "" } }
        for ch in d {
            if ch.isLetter { flush(); tokens.append(String(ch)) }
            else if ch == "," || ch == " " || ch == "\n" { flush() }
            else if ch == "-", !number.isEmpty, number.last != "e" { flush(); number = "-" }
            else { number.append(ch) }
        }
        flush()

        var ops: [PathOp] = []
        var i = 0, cmd = "M"
        var x = 0.0, y = 0.0, startX = 0.0, startY = 0.0
        func next() -> Double? {
            guard i < tokens.count, let v = Double(tokens[i]) else { return nil }
            i += 1
            return v
        }
        while i < tokens.count {
            if tokens[i].first!.isLetter { cmd = tokens[i]; i += 1 }
            switch cmd {
            case "M", "L":
                guard let px = next(), let py = next() else { return ops }
                if cmd == "M" { ops.append(.move(px, py)); startX = px; startY = py; cmd = "L" }
                else { ops.append(.line(px, py)) }
                x = px; y = py
            case "Q":
                guard let cx = next(), let cy = next(), let px = next(), let py = next() else { return ops }
                ops.append(.quad(px, py, cx: cx, cy: cy)); x = px; y = py
            case "C":
                guard let a = next(), let b = next(), let c = next(), let e = next(), let px = next(), let py = next() else { return ops }
                ops.append(.cubic(px, py, c1x: a, c1y: b, c2x: c, c2y: e)); x = px; y = py
            case "A":
                guard let rx = next(), let ry = next(), let rot = next(), let large = next(), let sweep = next(),
                      let px = next(), let py = next() else { return ops }
                ops += arc(from: (x, y), to: (px, py), rx: rx, ry: ry, rotation: rot, large: large != 0, sweep: sweep != 0)
                x = px; y = py
            case "Z", "z":
                ops.append(.close); x = startX; y = startY
                if i < tokens.count, !tokens[i].first!.isLetter { cmd = "L" }
            default:
                return ops
            }
        }
        return ops
    }

    /// An SVG elliptical arc as cubic curves, one per quarter turn or less
    /// (the endpoint-to-center conversion in the SVG spec, appendix B.2.4).
    static func arc(from p0: (Double, Double), to p1: (Double, Double), rx: Double, ry: Double,
                    rotation: Double, large: Bool, sweep: Bool) -> [PathOp] {
        var rx = abs(rx), ry = abs(ry)
        if rx == 0 || ry == 0 || (p0.0 == p1.0 && p0.1 == p1.1) { return [.line(p1.0, p1.1)] }
        let phi = rotation * .pi / 180, cosP = cos(phi), sinP = sin(phi)
        let dx = (p0.0 - p1.0) / 2, dy = (p0.1 - p1.1) / 2
        let x1 = cosP * dx + sinP * dy, y1 = -sinP * dx + cosP * dy
        let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
        if lambda > 1 { rx *= lambda.squareRoot(); ry *= lambda.squareRoot() }
        let num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
        let den = rx * rx * y1 * y1 + ry * ry * x1 * x1
        var k = (max(0, num) / den).squareRoot()
        if large == sweep { k = -k }
        let cx1 = k * rx * y1 / ry, cy1 = -k * ry * x1 / rx
        let cx = cosP * cx1 - sinP * cy1 + (p0.0 + p1.0) / 2
        let cy = sinP * cx1 + cosP * cy1 + (p0.1 + p1.1) / 2
        func angle(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
            atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        }
        let theta = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
        var delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
        if !sweep, delta > 0 { delta -= 2 * .pi }
        if sweep, delta < 0 { delta += 2 * .pi }

        let parts = max(1, Int((abs(delta) / (.pi / 2)).rounded(.up)))
        let step = delta / Double(parts)
        let t = 4.0 / 3.0 * tan(step / 4)
        func point(_ a: Double) -> (Double, Double) {
            let ex = rx * cos(a), ey = ry * sin(a)
            return (cosP * ex - sinP * ey + cx, sinP * ex + cosP * ey + cy)
        }
        func tangent(_ a: Double) -> (Double, Double) {
            let ex = -rx * sin(a), ey = ry * cos(a)
            return (cosP * ex - sinP * ey, sinP * ex + cosP * ey)
        }
        var ops: [PathOp] = []
        var a = theta
        for n in 0..<parts {
            let b = a + step
            let s = point(a), e = n == parts - 1 ? p1 : point(b)
            let ts = tangent(a), te = tangent(b)
            ops.append(.cubic(e.0, e.1, c1x: s.0 + t * ts.0, c1y: s.1 + t * ts.1, c2x: e.0 - t * te.0, c2y: e.1 - t * te.1))
            a = b
        }
        return ops
    }
}

/// One glowing tube in a scene: its path, whether it takes the line or the accent color, and its width.
public struct NeonTube: Sendable, Equatable {
    public enum Ink: Sendable { case line, accent }
    public let ops: [PathOp]
    public let ink: Ink
    public let width: Double

    init(_ d: String, _ ink: Ink = .line, _ width: Double = 2.2) {
        ops = SVGPath.parse(d)
        self.ink = ink
        self.width = width
    }
}

public enum NeonSceneKind: String, Sendable, CaseIterable {
    case castle, coach, clock, slipper

    /// The scenes in the order the feed shows them, as in the Expo app.
    public static let order: [NeonSceneKind] = [.castle, .coach, .clock, .slipper]

    /// The drawings' coordinate box (the viewBox in motifs.tsx).
    public static let box = (x: -10.0, y: -14.0, width: 180.0, height: 170.0)

    /// After which card a scene comes (the 2nd, 5th, 8th…), and which one: `nil` for no scene.
    public static func after(card index: Int) -> NeonSceneKind? {
        index % 3 == 1 ? order[(index / 3) % order.count] : nil
    }

    /// The faint ring drawn behind the coach's front wheel, so it reads as lit glass.
    public var halo: (cx: Double, cy: Double, r: Double)? { self == .coach ? (40, 128, 18) : nil }

    public var tubes: [NeonTube] {
        switch self {
        case .castle:
            // A keep with battlements, three towers with tall spires and pennants, an arched gate and lit windows.
            return [
                NeonTube("M 30 150 L 30 92 L 38 92 L 38 86 L 46 86 L 46 92 L 54 92 L 54 86 L 62 86 L 62 92 L 70 92 L 70 86 L 78 86 L 78 92 L 86 92 L 86 86 L 94 86 L 94 92 L 102 92 L 102 86 L 110 86 L 110 92 L 118 92 L 118 86 L 126 86 L 126 92 L 130 92 L 130 150"),
                NeonTube("M 14 150 L 14 70 L 34 70 L 34 150 M 126 150 L 126 70 L 146 70 L 146 150"),
                NeonTube("M 62 92 L 62 44 L 98 44 L 98 92"),
                NeonTube("M 10 70 L 24 30 L 38 70 M 122 70 L 136 30 L 150 70 M 58 44 L 80 2 L 102 44", .accent),
                NeonTube("M 80 2 L 80 -10 L 94 -6 L 80 -2 M 24 30 L 24 22 L 34 25 L 24 28 M 136 30 L 136 22 L 146 25 L 136 28", .accent, 1.6),
                NeonTube("M 68 150 L 68 126 Q 80 110 92 126 L 92 150", .accent),
                NeonTube("M 74 58 L 74 72 M 86 58 L 86 72 M 21 92 L 21 102 M 139 92 L 139 102 M 48 110 L 48 120 M 112 110 L 112 120", .line, 1.6),
                NeonTube("M 0 150 L 160 150", .line, 1.6),
            ]
        case .coach:
            // A pumpkin body with ribs, a door and window, a curling stem, scrollwork and two spoked wheels.
            return [
                NeonTube("M 30 98 C 18 60, 44 34, 80 36 C 116 34, 142 60, 130 98 C 118 116, 42 116, 30 98 Z", .accent, 2.4),
                NeonTube("M 56 40 C 44 60, 44 90, 58 110 M 104 40 C 116 60, 116 90, 102 110 M 80 36 L 80 112", .accent, 1.4),
                NeonTube("M 66 98 L 66 64 Q 80 52 94 64 L 94 98 Z M 72 74 Q 80 66 88 74 L 88 84 L 72 84 Z", .line, 1.6),
                NeonTube("M 80 36 C 78 24, 86 18, 92 22 C 98 26, 92 32, 88 28", .line, 1.8),
                NeonTube("M 22 104 C 10 104, 8 118, 18 120 C 26 122, 28 112, 22 112 M 138 104 C 150 104, 152 118, 142 120 C 134 122, 132 112, 138 112", .line, 1.4),
                NeonTube("M 58 128 A 18 18 0 1 1 22 128 A 18 18 0 1 1 58 128 Z M 138 128 A 18 18 0 1 1 102 128 A 18 18 0 1 1 138 128 Z", .line, 2),
                NeonTube(around(40, 128, 3, 16, 8) + " " + around(120, 128, 3, 16, 8), .line, 1),
            ]
        case .clock:
            // A clock face at midnight: twelve ticks, both hands straight up, a bell on top.
            return [
                NeonTube("M 130 78 A 50 50 0 1 1 30 78 A 50 50 0 1 1 130 78 Z", .line, 2.4),
                NeonTube("M 122 78 A 42 42 0 1 1 38 78 A 42 42 0 1 1 122 78 Z", .line, 1),
                NeonTube(around(80, 78, 34, 41, 12, -.pi / 2), .accent, 1.6),
                NeonTube("M 80 78 L 80 44 M 80 78 L 80 52 M 76 74 L 84 82", .accent, 2.4),
                NeonTube("M 64 30 Q 80 8 96 30 M 80 12 L 80 6", .line, 1.8),
                NeonTube("M 58 132 L 50 146 M 102 132 L 110 146", .line, 1.8),
            ]
        case .slipper:
            // A glass slipper: a pointed toe, a sweeping vamp, a slim high heel, and sparkles.
            return [
                NeonTube("M 16 118 C 30 104, 54 98, 74 102 C 92 106, 100 92, 112 72 C 120 60, 136 60, 140 74 L 142 118 C 120 118, 112 114, 104 118 Z", .line, 2.4),
                NeonTube("M 126 118 L 132 148 L 138 148 L 142 118", .line, 2),
                NeonTube("M 40 112 C 60 104, 84 108, 104 100", .line, 1),
                NeonTube([sparkle(48, 70, 8), sparkle(28, 88, 5), sparkle(150, 50, 6)].joined(separator: " "), .accent, 1.2),
            ]
        }
    }
}

/// Spokes or ticks: short lines from radius r1 to r2, n of them round a center.
func around(_ cx: Double, _ cy: Double, _ r1: Double, _ r2: Double, _ n: Int, _ offset: Double = 0) -> String {
    (0..<n).map { i in
        let a = Double(i) / Double(n) * .pi * 2 + offset
        return String(format: "M %.1f %.1f L %.1f %.1f", cx + r1 * cos(a), cy + r1 * sin(a), cx + r2 * cos(a), cy + r2 * sin(a))
    }.joined(separator: " ")
}

/// A four-point sparkle.
func sparkle(_ x: Double, _ y: Double, _ r: Double) -> String {
    let k = r * 0.25
    return "M \(x) \(y - r) L \(x + k) \(y - k) L \(x + r) \(y) L \(x + k) \(y + k) L \(x) \(y + r) L \(x - k) \(y + k) L \(x - r) \(y) L \(x - k) \(y - k) Z"
}

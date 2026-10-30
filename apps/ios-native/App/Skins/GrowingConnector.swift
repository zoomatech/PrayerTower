import SwiftUI

// The growing connectors (Steve, 2026-10-30): every skin's stalk builds downward, a branch shoots
// out to each post, and the post's frame draws itself in as it comes into view. The motion lives
// here once; a skin supplies only its look (a `ConnectorLook`): how a line of it is drawn.

/// How a skin draws one line of its connectors (the stalk, a branch, a frame's outline).
protocol ConnectorLook {
    /// Strokes `path` into `ctx` in this skin's look, `width` points thick.
    func stroke(_ path: Path, width: CGFloat, in ctx: GraphicsContext)
}

/// Real neon glass (Steve, 2026-10-30): close to white in the middle, deeper shades of the color
/// toward the edge of the glass, and a radiant glow around the whole tube.
struct NeonGlassLook: ConnectorLook {
    let color: Color

    func stroke(_ path: Path, width: CGFloat, in ctx: GraphicsContext) {
        func line(_ w: CGFloat) -> StrokeStyle { StrokeStyle(lineWidth: w, lineCap: .round, lineJoin: .round) }
        // The glow the gas throws round the tube.
        var glow = ctx
        glow.addFilter(.blur(radius: width * 2.2))
        glow.stroke(path, with: .color(color.opacity(0.8)), style: line(width * 3))
        var halo = ctx
        halo.addFilter(.blur(radius: width * 0.9))
        halo.stroke(path, with: .color(color), style: line(width * 1.6))
        // The glass: a deeper shade at its edges, the full color, a paler band, then the white-hot core.
        ctx.stroke(path, with: .color(color), style: line(width))
        ctx.stroke(path, with: .color(.black.opacity(0.4)), style: line(width))
        ctx.stroke(path, with: .color(color), style: line(width * 0.72))
        ctx.stroke(path, with: .color(.white.opacity(0.55)), style: line(width * 0.45))
        ctx.stroke(path, with: .color(.white.opacity(0.95)), style: line(max(1, width * 0.2)))
    }
}

/// A shape outlined in a connector look, lit from its start round to `progress` (0 to 1), so it can draw itself in.
struct ConnectorOutline<S: Shape, L: ConnectorLook>: View {
    let shape: S
    let look: L
    var width: CGFloat = 5
    var progress: CGFloat = 1

    var body: some View {
        Canvas { ctx, size in
            let path = shape.trim(from: 0, to: progress).path(in: CGRect(origin: .zero, size: size).insetBy(dx: width * 3, dy: width * 3))
            look.stroke(path, width: width, in: ctx)
        }
        // Room round the outline for the look's glow, so it never stops at a hard edge.
        .padding(-width * 3)
    }
}

/// One half of a box with small curved corners, drawn from the middle of its top edge round to the
/// middle of its bottom edge, so a frame drawing itself in starts on screen and works downward.
struct BoxHalf: Shape {
    /// -1 for the left half, 1 for the right.
    let side: CGFloat
    var radius: CGFloat = 12

    func path(in r: CGRect) -> Path {
        let c = min(radius, min(r.width, r.height) / 4)
        let edge = side < 0 ? r.minX : r.maxX
        let inward: CGFloat = side < 0 ? 1 : -1
        var p = Path()
        p.move(to: CGPoint(x: r.midX, y: r.minY))
        p.addLine(to: CGPoint(x: edge + inward * c, y: r.minY))
        p.addQuadCurve(to: CGPoint(x: edge, y: r.minY + c), control: CGPoint(x: edge, y: r.minY))
        p.addLine(to: CGPoint(x: edge, y: r.maxY - c))
        p.addQuadCurve(to: CGPoint(x: edge + inward * c, y: r.maxY), control: CGPoint(x: edge, y: r.maxY))
        p.addLine(to: CGPoint(x: r.midX, y: r.maxY))
        return p
    }
}

/// A box frame that draws itself in from the top, down both sides at once (Steve, 2026-10-30: as the
/// feed scrolls down, a new box's top shows before its bottom, which is still off screen).
struct TopDownFrame<L: ConnectorLook>: View {
    let look: L
    var radius: CGFloat = 12
    var width: CGFloat = 8
    var progress: CGFloat = 1

    var body: some View {
        ZStack {
            ConnectorOutline(shape: BoxHalf(side: -1, radius: radius), look: look, width: width, progress: progress)
            ConnectorOutline(shape: BoxHalf(side: 1, radius: radius), look: look, width: width, progress: progress)
        }
    }
}

/// Grows its content in when it comes into view (`progress` 0 to 1) and resets when it leaves, so it
/// grows again. Still under Reduce Motion and in the snapshot tests.
struct GrowingIn<Content: View>: View {
    var duration: Double = 1.4
    @ViewBuilder let content: (CGFloat) -> Content
    @Environment(\.accessibilityReduceMotion) private var still
    @State private var progress: CGFloat = 0

    /// Held still inside the snapshot tests (XCTest is loaded in the app there), so each picture matches its reference.
    static var frozen: Bool { NSClassFromString("XCTestCase") != nil }

    var body: some View {
        content(progress)
            .onAppear {
                if still || Self.frozen { progress = 1; return }
                withAnimation(.easeOut(duration: duration)) { progress = 1 }
            }
            .onDisappear { if !(still || Self.frozen) { progress = 0 } }
    }
}

extension View {
    /// Reveals this from the top down as `progress` goes from 0 to 1: a stalk building downward.
    func buildsDownward(_ progress: CGFloat) -> some View {
        mask(alignment: .top) {
            GeometryReader { g in Rectangle().frame(height: g.size.height * progress) }
        }
    }

    /// Reveals this from the leading edge as `progress` goes from 0 to 1: a branch shooting out.
    func shootsOut(_ progress: CGFloat) -> some View {
        mask(alignment: .leading) {
            GeometryReader { g in Rectangle().frame(width: g.size.width * progress) }
        }
    }
}

/// The shared timing of one post's connector: the branch shoots out first, then the frame draws round.
enum ConnectorTiming {
    static func branch(_ p: CGFloat) -> CGFloat { min(1, p * 4) }
    static func frame(_ p: CGFloat) -> CGFloat { max(0, (p - 0.25) / 0.75) }
}

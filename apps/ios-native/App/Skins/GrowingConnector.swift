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
    /// Square ends where two drawn halves meet, so the join is seamless; round ends otherwise.
    var cap: CGLineCap = .round
    /// A tube that changes color along its length: from `from` (at `fade.start`) to `color` (at
    /// `fade.end`), gradually, like a branch from a blue stalk to a red box (Steve, 2026-10-30).
    var from: Color? = nil
    var fade: (start: CGPoint, end: CGPoint) = (.zero, .zero)
    /// How strong the white core is: a thin branch takes less, so its color still shows.
    var white: Double = 1

    private func tint(_ opacity: Double = 1) -> GraphicsContext.Shading {
        guard let from else { return .color(color.opacity(opacity)) }
        return .linearGradient(Gradient(colors: [from.opacity(opacity), color.opacity(opacity)]), startPoint: fade.start, endPoint: fade.end)
    }

    func stroke(_ path: Path, width: CGFloat, in ctx: GraphicsContext) {
        func line(_ w: CGFloat) -> StrokeStyle { StrokeStyle(lineWidth: w, lineCap: cap, lineJoin: .round) }
        // The glow the gas throws round the tube.
        var glow = ctx
        glow.addFilter(.blur(radius: width * 2.2))
        glow.stroke(path, with: tint(0.8), style: line(width * 3))
        var halo = ctx
        halo.addFilter(.blur(radius: width * 0.9))
        halo.stroke(path, with: tint(), style: line(width * 1.6))
        // The glass: a deeper shade at its edges, the full color, a paler band, then the white-hot core.
        ctx.stroke(path, with: tint(), style: line(width))
        ctx.stroke(path, with: .color(.black.opacity(0.4)), style: line(width))
        ctx.stroke(path, with: tint(), style: line(width * 0.72))
        ctx.stroke(path, with: .color(.white.opacity(0.55 * white)), style: line(width * 0.45))
        ctx.stroke(path, with: .color(.white.opacity(0.95 * white)), style: line(max(1, width * 0.2)))
    }
}

/// A shape outlined in a connector look, lit from its start round to `progress` (0 to 1), so it can draw itself in.
struct ConnectorOutline<S: Shape, L: ConnectorLook>: View, Animatable {
    let shape: S
    let look: L
    var width: CGFloat = 5
    nonisolated var progress: CGFloat = 1
    /// Lets SwiftUI step `progress` frame by frame, so the outline visibly draws itself in.
    nonisolated var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    var body: some View {
        Canvas { ctx, size in
            let path = shape.trim(from: 0, to: progress).path(in: CGRect(origin: .zero, size: size).insetBy(dx: width * 6, dy: width * 6))
            look.stroke(path, width: width, in: ctx)
        }
        // Room round the outline for the look's glow, so it never stops at a hard edge.
        .padding(-width * 6)
    }
}

/// One of a box's two tubes, both starting at its top left corner, where the branch from the stalk
/// comes in: one runs along the top and down the right side, the other down the left, along the
/// bottom and round the bottom right corner. They meet end to end, so the box is one unbroken tube
/// with no gap anywhere (Steve, 2026-10-30).
struct BoxHalf: Shape {
    /// 1 for the top-and-right tube, -1 for the left-and-bottom tube.
    let side: CGFloat
    var radius: CGFloat = 12

    func path(in r: CGRect) -> Path {
        let c = min(radius, min(r.width, r.height) / 4)
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.minY + c))
        if side > 0 {
            p.addQuadCurve(to: CGPoint(x: r.minX + c, y: r.minY), control: CGPoint(x: r.minX, y: r.minY))
            p.addLine(to: CGPoint(x: r.maxX - c, y: r.minY))
            p.addQuadCurve(to: CGPoint(x: r.maxX, y: r.minY + c), control: CGPoint(x: r.maxX, y: r.minY))
            p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - c))
        } else {
            p.addLine(to: CGPoint(x: r.minX, y: r.maxY - c))
            p.addQuadCurve(to: CGPoint(x: r.minX + c, y: r.maxY), control: CGPoint(x: r.minX, y: r.maxY))
            p.addLine(to: CGPoint(x: r.maxX - c, y: r.maxY))
            p.addQuadCurve(to: CGPoint(x: r.maxX, y: r.maxY - c), control: CGPoint(x: r.maxX, y: r.maxY))
        }
        return p
    }
}

/// A box frame that draws itself in from its top left corner, along the top and down both sides at
/// once (Steve, 2026-10-30: as the feed scrolls down, a new box's top shows before its bottom).
struct TopDownFrame<L: ConnectorLook>: View {
    let look: L
    var radius: CGFloat = 12
    var width: CGFloat = 8
    var progress: CGFloat = 1

    var body: some View {
        // Both tubes in one drawing, so where they meet the glass joins without a seam.
        ConnectorOutline(shape: BothHalves(radius: radius, drawn: progress), look: look, width: width)
    }
}

/// A box's two tubes, each lit from the top left corner as far as `drawn`.
private struct BothHalves: Shape {
    let radius: CGFloat
    var drawn: CGFloat

    nonisolated var animatableData: CGFloat {
        get { drawn }
        set { drawn = newValue }
    }

    func path(in r: CGRect) -> Path {
        var p = BoxHalf(side: -1, radius: radius).trim(from: 0, to: drawn).path(in: r)
        p.addPath(BoxHalf(side: 1, radius: radius).trim(from: 0, to: drawn).path(in: r))
        return p
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
        Stepped(progress: progress, content: content)
            .onAppear {
                if still || Self.frozen { progress = 1; return }
                withAnimation(.easeOut(duration: duration)) { progress = 1 }
            }
            .onDisappear { if !(still || Self.frozen) { progress = 0 } }
    }
}

/// Hands its content every in-between step of `progress`, so each part's own timing (the branch,
/// then the frame, then the text) plays in order, instead of all of them easing from start to end together.
private struct Stepped<Content: View>: View, Animatable {
    nonisolated var progress: CGFloat
    let content: (CGFloat) -> Content
    nonisolated var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    var body: some View { content(progress) }
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

/// The shared timing of one post's connector: the branch shoots out first, then the frame draws
/// round, then the card's text fades in once the line around it is drawn (Steve, 2026-10-30).
enum ConnectorTiming {
    static func branch(_ p: CGFloat) -> CGFloat { min(1, p * 5) }
    static func frame(_ p: CGFloat) -> CGFloat { min(1, max(0, (p - 0.2) / 0.55)) }
    static func text(_ p: CGFloat) -> CGFloat { max(0, (p - 0.75) / 0.25) }
}

/// Sparkling lights riding the neon here and there (Steve, 2026-10-30): a few bright points of
/// light that travel along a tube at their own speeds, each twinkling in and out at random. Still
/// under Reduce Motion and in the snapshot tests.
struct NeonSparks<S: Shape>: View {
    let shape: S
    let color: Color
    /// The tube's width, which sets the room left round the shape for the glow, as `ConnectorOutline`.
    var width: CGFloat = 8
    var count = 2
    /// True for a closed outline (a box), false for a single straight run (a rod).
    var loop = true
    @Environment(\.accessibilityReduceMotion) private var still
    @State private var seed = Double.random(in: 0..<1000)

    var body: some View {
        if still || GrowingIn<EmptyView>.frozen {
            EmptyView()
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 30)) { tl in
                Canvas { ctx, size in
                    let t = tl.date.timeIntervalSinceReferenceDate
                    let rect = CGRect(origin: .zero, size: size).insetBy(dx: width * 6, dy: width * 6)
                    // Lights travel 90 to 190 points a second, each a short bright point, whatever the tube's length.
                    let length = max(1, loop ? 2 * (rect.width + rect.height) : rect.height)
                    let dash = 7 / length
                    for i in 0..<count {
                        let k = seed + Double(i) * 37.7
                        let speed = (90 + k.truncatingRemainder(dividingBy: 100)) / length
                        let along = (t * speed + k).truncatingRemainder(dividingBy: 1)
                        // Each light shows for part of its run, fading in and out, so they come and go at random.
                        let twinkle = sin((t * (0.6 + Double(i) * 0.23) + k) * .pi)
                        guard twinkle > 0.2 else { continue }
                        let spot = shape.trim(from: along, to: min(1, along + dash)).path(in: rect)
                        var glow = ctx
                        glow.addFilter(.blur(radius: width * 0.9))
                        glow.stroke(spot, with: .color(color.opacity(twinkle)), style: StrokeStyle(lineWidth: width * 1.6, lineCap: .round))
                        ctx.stroke(spot, with: .color(.white.opacity(twinkle)), style: StrokeStyle(lineWidth: width * 0.8, lineCap: .round))
                    }
                }
            }
            .padding(-width * 6)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}

/// A straight vertical line down a view at `x`, for lights riding a rod.
struct VerticalLine: Shape {
    let x: CGFloat
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX + x, y: r.minY))
        p.addLine(to: CGPoint(x: r.minX + x, y: r.maxY))
        return p
    }
}

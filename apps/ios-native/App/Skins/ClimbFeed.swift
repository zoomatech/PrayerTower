import PrayerTowerKit
import SwiftUI

// MARK: - Mountain Climber (Steve, 2026-10-31)

/// The feed is a light brown and gray rock face whose left edge is the cliff edge, with sky
/// beyond it. A Swiss climber, seen from the side, goes up and down that edge with you on a
/// live rope that never ends: scroll up and he climbs quickly up to where you stop, swinging
/// his pickaxe; scroll down and he rappels quickly down, kicking off the wall. Posts sit in
/// smoothed squares of the rock; comments are text on rocks below each post; a tapped comment
/// zooms up full screen in a gradient stone box, lower than the picture, name and first line of
/// the request it answers. Drawn from the Claude Design canvas, like layouts/climb.tsx.
struct ClimbFeed<Row: View>: View {
    let look: ClimbLook
    let cards: [Card]
    let wording: Wording
    let hooks: FeedHooks
    @ViewBuilder let row: (Card) -> Row
    @State private var chase = ClimbChase()
    @State private var reading: ClimbReading?
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        let words = Words(wording)
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        // Tells the climber how far the feed has scrolled.
                        Color.clear.frame(height: 44)
                            .onGeometryChange(for: Double.self) { Double($0.frame(in: .named(ClimbChase.space)).minY) } action: { chase.scroll = -$0 }
                            .background { RockBand(seed: 0, look: look) }
                        ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                            ClimbPost(card: card, index: i, look: look, words: words, row: row, load: hooks.loadComments) { note, kids in
                                withAnimation(still ? nil : .spring(response: 0.45, dampingFraction: 0.72)) { reading = ClimbReading(card: card, note: note, kids: kids) }
                            } more: { hooks.open?(card) }
                            .loadsMore(after: card, in: cards, hooks)
                        }
                        // The rope never ends: it runs on down past the last post.
                        VStack {
                            if !hooks.hasMore, !cards.isEmpty {
                                Text(words("climb.end")).font(.subheadline).foregroundStyle(ClimbArt.ink)
                                    .multilineTextAlignment(.center).padding(12)
                                    .background(Color(look.slab), in: .rect(cornerRadius: 14))
                                    .padding(.leading, Climb.gutter).padding(.trailing, 12).padding(.top, 28)
                            }
                            Spacer(minLength: 0)
                        }
                        .frame(maxWidth: .infinity, minHeight: max(Double(geo.size.height) * 0.7, 260), alignment: .top)
                        .background { RockBand(seed: cards.count + 1, look: look) }
                    }
                }
                .coordinateSpace(name: ClimbChase.space)
                ClimberLayer(chase: chase, still: still).frame(width: 140).allowsHitTesting(false).accessibilityHidden(true)
                if let reading {
                    ClimbCloseUp(reading: reading, look: look, words: words) {
                        withAnimation(still ? nil : .easeOut(duration: 0.25)) { self.reading = nil }
                    }
                    .transition(still ? AnyTransition.opacity : AnyTransition.scale(scale: 0.18).combined(with: .opacity))
                    .zIndex(2)
                }
            }
        }
        .background(Color(look.backdrop))
        .environment(\.colorScheme, .light)
    }
}

struct ClimbReading: Identifiable {
    let card: Card
    let note: Beanstalk.Note
    let kids: [String: [Beanstalk.Note]]
    var id: String { note.id }
}

enum ClimbArt {
    static let ink = Color(RGB(hex: "#2B241C")!)
    static let rockInk = Color(RGB(hex: "#211B14")!)
    static let sky = Color(RGB(hex: "#D9E3E8")!)
    static let rim = Color(RGB(hex: "#4F4436")!)
    static let rimShade = Color(RGB(hex: "#7B6C59")!)
}

/// Where the climber is. A plain class, changed as the frames are drawn, so moving him never redraws the feed.
final class ClimbChase {
    static let space = "climb-feed"
    var scroll: Double = 0
    var y: Double?
    var x: Double = Climb.edgeX - 19
    var p: Double = 0, t: Double = 0, vel: Double = 0
    var mode: Climb.Mode = .still
    var last: Date?

    /// Moves him toward `anchor` down the screen, the same distance per second at any frame rate.
    func tick(anchor: Double, now: Date) {
        let target = scroll + anchor
        guard let y0 = y, let last else {
            y = target
            self.last = now
            return
        }
        let frames = min(max(now.timeIntervalSince(last) * 60, 0), 4)
        self.last = now
        let k = 1 - pow(1 - Climb.catchUp, frames)
        let s = Climb.chase(y0, to: target, k: k)
        y = s.y
        mode = s.mode
        p += abs(s.step) / 11
        t += frames / 60
        vel = vel * 0.85 + (s.step / max(frames, 0.01)) * 0.15
        x += (Climb.edgeX - Climb.pose(mode, p: p, t: t).off - x) * min(1, 0.25 * frames)
    }
}

/// The climber and his rope, drawn over the cliff edge.
private struct ClimberLayer: View {
    let chase: ClimbChase
    let still: Bool

    var body: some View {
        TimelineView(.animation(paused: still)) { tl in
            Canvas { ctx, size in
                let h = Double(size.height)
                let anchor = (h * Climb.anchor).rounded()
                if still {
                    chase.y = chase.scroll + anchor
                    chase.mode = .still
                } else {
                    chase.tick(anchor: anchor, now: tl.date)
                }
                let pose = Climb.pose(chase.mode, p: chase.p, t: chase.t)
                let hx = chase.x, hy = (chase.y ?? anchor) - chase.scroll
                // The rope: taut from above (through his hand unless he is climbing); the slack below swings and trails behind fast moves.
                var above = Path()
                above.move(to: CGPoint(x: Climb.edgeX - 8, y: -20))
                if chase.mode != .up {
                    let hand = Climb.nearHand(pose)
                    above.addLine(to: CGPoint(x: hx + hand.x, y: hy + hand.y))
                }
                above.addLine(to: CGPoint(x: hx + 1, y: hy - 1))
                let sw = 6 * sin(chase.t * 1.7) - chase.vel * 2.2
                let sw2 = 9 * sin(chase.t * 1.7 - 0.8) - chase.vel * 4
                var below = Path()
                below.move(to: CGPoint(x: hx, y: hy))
                below.addCurve(to: CGPoint(x: hx - 6, y: hy + 300), control1: CGPoint(x: hx - 4 + sw, y: hy + 60), control2: CGPoint(x: hx - 10 + sw2, y: hy + 170))
                below.addLine(to: CGPoint(x: hx - 6, y: max(h + 20, hy + 320)))
                for rope in [above, below] {
                    ctx.stroke(rope, with: .color(Color(RGB(hex: "#7A2412")!)), style: .init(lineWidth: 3.4, lineCap: .round, lineJoin: .round))
                    ctx.stroke(rope, with: .color(Color(RGB(hex: "#E0552A")!)), style: .init(lineWidth: 2.2, lineCap: .round, lineJoin: .round, dash: [3, 3]))
                }
                var him = ctx
                him.translateBy(x: hx, y: hy)
                ClimberDrawing.draw(pose, in: him)
            }
        }
    }
}

/// The Swiss climber from the side, round his harness at 0,0: red shirt, pack with the white
/// cross, alpine hat with a feather, pickaxe.
enum ClimberDrawing {
    private static func c(_ hex: String) -> GraphicsContext.Shading { .color(Color(RGB(hex: hex)!)) }
    private static func line(_ ctx: GraphicsContext, _ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, _ hex: String, _ w: Double) {
        var p = Path()
        p.move(to: CGPoint(x: x1, y: y1))
        p.addLine(to: CGPoint(x: x2, y: y2))
        ctx.stroke(p, with: c(hex), style: .init(lineWidth: w, lineCap: .round))
    }
    private static func rect(_ ctx: GraphicsContext, _ x: Double, _ y: Double, _ w: Double, _ h: Double, _ r: Double, _ hex: String) {
        ctx.fill(Path(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: r), with: c(hex))
    }
    private static func dot(_ ctx: GraphicsContext, _ x: Double, _ y: Double, _ r: Double, _ hex: String) {
        ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)), with: c(hex))
    }
    private static func turned(_ ctx: GraphicsContext, _ x: Double, _ y: Double, _ deg: Double) -> GraphicsContext {
        var g = ctx
        g.translateBy(x: x, y: y)
        g.rotate(by: .degrees(deg))
        return g
    }
    private static func leg(_ ctx: GraphicsContext, hip: Double, knee: Double, thigh: String, sock: String, boot: String) {
        let g = turned(ctx, 0, 0, hip)
        line(g, 0, 0, 0, 13, thigh, 7.5)
        let s = turned(g, 0, 13, knee)
        line(s, 0, 0, 0, 10, sock, 5.5)
        rect(s, -4, 9, 11.5, 5, 0, boot)
    }
    private static func path(_ build: (inout Path) -> Void) -> Path {
        var p = Path()
        build(&p)
        return p
    }
    private static func axeHead(_ ctx: GraphicsContext) {
        let pick = path { p in
            p.move(to: CGPoint(x: -2, y: 36)); p.addQuadCurve(to: CGPoint(x: 13, y: 40), control: CGPoint(x: 6, y: 34.5))
            p.addLine(to: CGPoint(x: 12, y: 42.5)); p.addQuadCurve(to: CGPoint(x: -2, y: 39.5), control: CGPoint(x: 6, y: 38.5)); p.closeSubpath()
            p.move(to: CGPoint(x: -2, y: 36)); p.addLine(to: CGPoint(x: -8, y: 35)); p.addLine(to: CGPoint(x: -8, y: 39)); p.addLine(to: CGPoint(x: -2, y: 39.5)); p.closeSubpath()
        }
        ctx.fill(pick, with: c("#9AA3AA"))
        ctx.stroke(pick, with: c("#4B5257"), lineWidth: 1)
    }

    static func draw(_ pose: Climb.Pose, in ctx: GraphicsContext) {
        leg(ctx, hip: pose.farHip, knee: pose.farKnee, thigh: "#4A443C", sock: "#9A0C22", boot: "#1F1810")
        let body = turned(ctx, 0, 0, pose.lean)
        let far = turned(body, 1, -27, pose.farArm)
        line(far, 0, 0, 0, 18, "#9A0C22", 5.5)
        dot(far, 0, 20.5, 3.2, "#C99573")
        rect(body, -15, -31, 10, 22, 3.5, "#9A0C22")
        rect(body, -11.1, -24.5, 2.4, 8.5, 0, "#FFFFFF")
        rect(body, -14.1, -21.5, 8.4, 2.4, 0, "#FFFFFF")
        if !pose.axeInHand {
            // The pickaxe rides on his pack while he rappels or hangs.
            let a = turned(body, -13, -30, -18)
            line(a, 0, 0, 0, 22, "#7A5532", 2.2)
            let head = path { p in
                p.move(to: CGPoint(x: -7, y: -1)); p.addQuadCurve(to: CGPoint(x: 8, y: 1), control: CGPoint(x: 0, y: -4))
                p.addLine(to: CGPoint(x: 7, y: 3)); p.addQuadCurve(to: CGPoint(x: -7, y: 2), control: CGPoint(x: 0, y: 0)); p.closeSubpath()
            }
            a.fill(head, with: c("#9AA3AA"))
        }
        rect(body, -7, -32, 14, 33, 6, "#C8102E")
        rect(body, -8, -3, 16, 4.5, 1.5, "#33302B")
        dot(body, 0, -40, 7, "#6B4A2B")
        dot(body, 3, -39, 5.6, "#E3B08A")
        dot(body, 8.4, -39, 1.5, "#E3B08A")
        body.fill(Path(ellipseIn: CGRect(x: -10, y: -47.4, width: 22, height: 4.8)), with: c("#3D5A2A"))
        body.fill(path { p in
            p.move(to: CGPoint(x: -5, y: -45)); p.addQuadCurve(to: CGPoint(x: 2, y: -54), control: CGPoint(x: -5, y: -54))
            p.addQuadCurve(to: CGPoint(x: 7, y: -45), control: CGPoint(x: 8, y: -54)); p.closeSubpath()
        }, with: c("#4B6B33"))
        rect(body, -5, -47.6, 12, 2, 0, "#C8102E")
        body.stroke(path { p in p.move(to: CGPoint(x: -4, y: -48)); p.addQuadCurve(to: CGPoint(x: -10, y: -64), control: CGPoint(x: -12, y: -57)) },
                    with: c("#F1E9DB"), style: .init(lineWidth: 1.6, lineCap: .round))
        let near = turned(body, 2, -27, pose.nearArm)
        if pose.axeInHand {
            line(near, 0, 17, 0, 38, "#7A5532", 2.6)
            axeHead(near)
        }
        line(near, 0, 0, 0, 19, "#C8102E", 6)
        dot(near, 0, 21.5, 3.6, "#E3B08A")
        leg(ctx, hip: pose.nearHip, knee: pose.nearKnee, thigh: "#5C544A", sock: "#C8102E", boot: "#2B2118")
        ctx.stroke(Path(ellipseIn: CGRect(x: -2.6, y: -3.1, width: 5.2, height: 5.2)), with: c("#E05A2A"), lineWidth: 1.8)
    }
}

/// A band of the rock face: stone facets, a crack or two, the ledge where it meets the band
/// above, and the sky past the cliff edge on the left.
private struct RockBand: View {
    let seed: Int
    let look: ClimbLook

    var body: some View {
        Canvas { ctx, size in
            let w = Double(size.width), h = Double(size.height)
            guard w > 1, h > 1 else { return }
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(look.backdrop)))
            let rock = Climb.rock(w: w, h: h, seed: seed)
            for f in rock.facets {
                var p = Path()
                p.addLines(f.points.map { CGPoint(x: $0.x, y: $0.y) })
                p.closeSubpath()
                ctx.fill(p, with: .color(Color(RGB(hex: f.color)!)))
                ctx.stroke(p, with: .color(Color(red: 80 / 255, green: 66 / 255, blue: 50 / 255).opacity(0.32)), lineWidth: 1)
            }
            for crack in rock.cracks {
                var p = Path()
                p.addLines(crack.map { CGPoint(x: $0.x, y: $0.y) })
                ctx.stroke(p.offsetBy(dx: 1, dy: 1.2), with: .color(.white.opacity(0.4)), lineWidth: 1.4)
                ctx.stroke(p, with: .color(Color(RGB(hex: "#5F5446")!).opacity(0.7)), style: .init(lineWidth: 1.6, lineJoin: .round))
            }
            ctx.fill(Path(CGRect(x: 0, y: 0, width: w, height: 1.5)), with: .color(Color(red: 70 / 255, green: 56 / 255, blue: 42 / 255).opacity(0.45)))
            let edge = Climb.cliffEdge(h: h, seed: seed).map { CGPoint(x: $0.x, y: $0.y) }
            var sky = Path()
            sky.move(to: .zero)
            sky.addLines(edge)
            sky.addLine(to: CGPoint(x: 0, y: h))
            sky.closeSubpath()
            ctx.fill(sky, with: .color(ClimbArt.sky))
            var rim = Path()
            rim.addLines(edge)
            ctx.stroke(rim.offsetBy(dx: 3, dy: 0), with: .color(ClimbArt.rimShade.opacity(0.55)), style: .init(lineWidth: 7, lineJoin: .round))
            ctx.stroke(rim, with: .color(ClimbArt.rim), style: .init(lineWidth: 2.4, lineJoin: .round))
        }
        .accessibilityHidden(true)
    }
}

/// One post in its smoothed square of rock, with its comments on rocks below it.
private struct ClimbPost<Row: View>: View {
    let card: Card
    let index: Int
    let look: ClimbLook
    let words: Words
    let row: (Card) -> Row
    let load: ((Card) async -> [Comment])?
    let open: (Beanstalk.Note, [String: [Beanstalk.Note]]) -> Void
    let more: () -> Void
    @State private var all: [Beanstalk.Note]?

    var body: some View {
        let notes: [Beanstalk.Note] = all ?? (card.leafComments ?? []).map(Beanstalk.Note.init)
        let tree = Beanstalk.tree(notes)
        let total = all != nil ? tree.top.count : max(tree.top.count, card.counts.comments)
        let shown = Array(tree.top.prefix(Climb.rocksShown))
        let c = Climb.corners[index % Climb.corners.count]
        let slab = UnevenRoundedRectangle(topLeadingRadius: c.0, bottomLeadingRadius: c.3, bottomTrailingRadius: c.2, topTrailingRadius: c.1)
        VStack(alignment: .leading, spacing: 10) {
            row(card)
                .padding(12)
                .background(Color(look.slab), in: slab)
                .overlay { slab.stroke(Color(red: 90 / 255, green: 70 / 255, blue: 45 / 255).opacity(0.3), lineWidth: 1).accessibilityHidden(true) }
                .shadow(color: Color(red: 45 / 255, green: 35 / 255, blue: 25 / 255).opacity(0.45), radius: 6, y: 4)
            ForEach(Array(shown.enumerated()), id: \.element.id) { i, note in
                CommentRock(note: note, shape: index * 2 + i, words: words) { open(note, tree.kids) }
                    .frame(maxWidth: 360)
                    .frame(maxWidth: .infinity, alignment: (index + i).isMultiple(of: 2) ? .leading : .trailing)
            }
            if total > shown.count, !shown.isEmpty {
                Button(action: more) {
                    Text(words("climb.more", ["n": "\(total - shown.count)"])).font(.subheadline.bold()).foregroundStyle(ClimbArt.ink)
                        .padding(.horizontal, 16).frame(minHeight: 44)
                        .background(Color(RGB(hex: "#E4DBCA")!), in: .capsule)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.leading, Climb.gutter).padding(.trailing, 12).padding(.top, 22).padding(.bottom, 26)
        .background { RockBand(seed: index + 1, look: look) }
        .task(id: card.counts.comments) {
            guard card.counts.comments > 0, let load else { return }
            all = await load(card).map(Beanstalk.Note.init)
        }
    }
}

/// A comment as text on a jagged rock.
private struct CommentRock: View {
    let note: Beanstalk.Note
    let shape: Int
    let words: Words
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 2) {
                Text(note.author).font(.footnote.bold()).foregroundStyle(Color(RGB(hex: "#3A2F23")!)).lineLimit(1)
                Text(note.body).font(.subheadline).foregroundStyle(ClimbArt.rockInk).lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
            .padding(.vertical, 16).padding(.leading, 22).padding(.trailing, 24)
            .background {
                let rock = RockShape(points: Climb.rockShapes[shape % Climb.rockShapes.count])
                rock.fill(Color(red: 40 / 255, green: 30 / 255, blue: 20 / 255).opacity(0.45)).offset(y: 4)
                rock.fill(LinearGradient(colors: [Color(RGB(hex: "#D6CCBA")!), Color(RGB(hex: "#B9AD98")!), Color(RGB(hex: "#A59882")!)], startPoint: .top, endPoint: UnitPoint(x: 0.6, y: 1)))
                rock.stroke(Color(red: 60 / 255, green: 48 / 255, blue: 36 / 255).opacity(0.55), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(note.author): \(note.body)")
        .accessibilityHint(words("climb.openComment"))
    }
}

struct RockShape: Shape {
    let points: [(x: Double, y: Double)]
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.addLines(points.map { CGPoint(x: r.minX + $0.x * r.width, y: r.minY + $0.y * r.height) })
        p.closeSubpath()
        return p
    }
}

/// The comment full screen, in a stone box with a gradient. Above it the request it answers
/// stays showing: the poster's picture (initials until they add one), name and first line.
private struct ClimbCloseUp: View {
    let reading: ClimbReading
    let look: ClimbLook
    let words: Words
    let close: () -> Void

    var body: some View {
        ZStack(alignment: .top) {
            Button(action: close) { Color(red: 28 / 255, green: 22 / 255, blue: 16 / 255).opacity(0.6) }
                .buttonStyle(.plain)
                .ignoresSafeArea()
                .accessibilityLabel(words("common.close"))
            VStack(spacing: 10) {
                parent
                ZStack(alignment: .topTrailing) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(reading.note.author).font(.headline)
                                Text(reading.note.body).font(.title3)
                            }
                            replies(reading.note.id, level: 1)
                        }
                        .foregroundStyle(ClimbArt.rockInk)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 62).padding(.horizontal, 22).padding(.bottom, 24)
                    }
                    Button(action: close) {
                        Image(systemName: "xmark").font(.headline.bold()).foregroundStyle(ClimbArt.ink)
                            .frame(width: 48, height: 48)
                            .background(Color(RGB(hex: "#EFE5D2")!), in: .circle)
                            .overlay(Circle().stroke(Color(RGB(hex: "#4A3F33")!), lineWidth: 3))
                    }
                    .buttonStyle(.plain)
                    .keyboardShortcut(.cancelAction)
                    .accessibilityLabel(words("common.close"))
                    .padding(10)
                }
                .frame(maxHeight: .infinity)
                .background(LinearGradient(colors: [Color(RGB(hex: "#F4EEE3")!), Color(RGB(hex: "#E4D9C6")!), Color(RGB(hex: "#C9BBA3")!)], startPoint: .topLeading, endPoint: UnitPoint(x: 0.7, y: 1)), in: .rect(cornerRadius: 22))
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color(RGB(hex: "#5A4A38")!), lineWidth: 3))
                .accessibilityAddTraits(.isModal)
            }
            .frame(maxWidth: 720)
            .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 20)
        }
    }

    private var parent: some View {
        let card = reading.card
        let initials = card.author.displayName.split(separator: " ").prefix(2).compactMap(\.first).map { String($0).uppercased() }.joined()
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                ZStack {
                    Ellipse().fill(Color(RGB(hex: "#6D5F4D")!))
                    if let photo = card.author.photoUrl, let url = URL(string: photo) {
                        AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Text(initials).font(.headline).foregroundStyle(Color(RGB(hex: "#F6EFE2")!)) }
                            .clipShape(Ellipse())
                    } else {
                        Text(initials).font(.headline).foregroundStyle(Color(RGB(hex: "#F6EFE2")!))
                    }
                }
                .frame(width: 40, height: 46)
                .accessibilityHidden(true)
                Text(card.author.displayName).font(.headline).foregroundStyle(ClimbArt.ink).lineLimit(1)
            }
            Text(card.body).font(.body).foregroundStyle(ClimbArt.ink).lineLimit(1)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(look.slab), in: UnevenRoundedRectangle(topLeadingRadius: 22, bottomLeadingRadius: 26, bottomTrailingRadius: 18, topTrailingRadius: 30))
    }

    private func replies(_ id: String, level: Int) -> AnyView {
        AnyView(ForEach(reading.kids[id] ?? []) { r in
            VStack(alignment: .leading, spacing: 2) {
                Text(r.author).font(.subheadline.bold())
                Text(r.body).font(.body)
                if level < Beanstalk.maxLevel { replies(r.id, level: level + 1) }
            }
            .padding(.leading, 12)
            .overlay(alignment: .leading) { Rectangle().fill(Color(RGB(hex: "#8A7A63")!)).frame(width: 4) }
            .padding(.leading, 18)
        })
    }
}

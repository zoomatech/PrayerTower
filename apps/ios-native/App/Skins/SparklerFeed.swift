import PrayerTowerKit
import SwiftUI

// MARK: - Full Screen Sparkler (Steve, 2026-11-01)

/// The feed's scroll view, which the feed measures how far it has scrolled against.
private let sparklerSpace = "sparkler-feed"

/// A simple full-screen scroll with no border: each post fills the screen's width. ONE line on the
/// left runs down the whole feed over the posts and grows downward as you scroll (its tip always on
/// screen near the foot, so it never seems to stop while there is more below), with a burning
/// sparkler at its tip leading the way (the line is drawn in the shared glass look,
/// GrowingConnector.swift). Posts are separated by a black line with a light blue line through its
/// middle, the poster's profile picture sits in the upper right corner of each square, and the
/// posts' background is the member's choice under Menu → Settings → Themes → Full Screen Sparkler
/// Theme → Background choices. Like apps/mobile/src/layouts/sparkler.tsx.
struct SparklerFeed<Row: View>: View {
    let look: SparklerLook
    let cards: [Card]
    let wording: Wording
    let hooks: FeedHooks
    @ViewBuilder let row: (Card) -> Row
    @AppStorage(Sparkler.storageKey) private var chosen = "white"
    @Environment(\.accessibilityReduceMotion) private var still
    @Environment(\.colorScheme) private var scheme
    /// How far the feed has scrolled, and how tall it is.
    @State private var scrolled: Double = 0
    @State private var feedHeight: Double = 0
    /// How far the sparkler has rushed ahead of its resting place in a swipe (Steve: the swipe
    /// moves the sparkler down, then the screen catches up to where it went, with a bounce).
    @State private var lead: Double = 0
    @State private var settle: Task<Void, Never>?
    /// The stardust the sparkler has shed along its way.
    @State private var dust = DustBox()

    var body: some View {
        let words = Words(wording)
        let bg = Sparkler.background(chosen, dark: scheme == .dark)
        let moving = !(still || GrowingIn<EmptyView>.frozen)
        VStack(spacing: 0) {
        // Black room under the Home and Menu buttons, held still above the feed, so they never sit
        // on a post's words however far it scrolls.
        // (The line runs up through it to the header's light blue edge: drawn with the rest of the
        // line, in one piece, below.)
        // The black room is where you write a post: a plain text box with light lead-in words in it.
        // Typing starts right there, and the first letters open the full writing screen with them
        // already in it (Steve, 2026-11-02).
        SparklerPostBox(prompt: words("sparkler.prompt"), compose: hooks.compose)
            .frame(height: Sparkler.topRoom)
            .background(Color(look.backdrop))
        GeometryReader { geo in
            let screen = Double(geo.size.height)
            // The tip rests at the same place on screen near its foot, so it is never lost from
            // sight and the line always runs on down; in a swipe it rushes ahead of that.
            // Never stopped at the feed's end either: in the bounce past the last post the line
            // runs on to the sparkler unbroken (Steve, 2026-11-02: the line must NEVER break).
            let rest = Sparkler.tip(scrolled: scrolled, screen: screen, reached: 0, feedHeight: .infinity) - scrolled
            let end = Double.infinity
            // Up and down only.
            ScrollView(.vertical) {
                LazyVStack(spacing: 0) {
                    ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                        SparklerPost(card: card, index: i, look: look, bg: bg, words: words, hooks: hooks, dust: dust, still: !moving, row: row)
                            .loadsMore(after: card, in: cards, hooks)
                    }
                    // Room under the last post, so the line can grow all the way down past it.
                    VStack {
                        if !hooks.hasMore, !cards.isEmpty {
                            Text(words("sparkler.end")).sparklerFont(.callout).foregroundStyle(.white)
                                .multilineTextAlignment(.center).padding(16)
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, minHeight: screen * (1 - Sparkler.tipAt) + 40, alignment: .top)
                }
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(sparklerSpace)) } action: { r in
                    let now = Double(-r.minY)
                    let delta = now - scrolled
                    scrolled = now
                    feedHeight = Double(r.height)
                    guard moving, abs(delta) > 0.5 else { return }
                    // The swipe throws the sparkler on ahead, down (or up) the way it is going...
                    withAnimation(.interactiveSpring(duration: 0.16)) {
                        lead = Sparkler.lead(lead, delta: delta, screen: screen)
                    }
                    // ...and when the swipe ends, the screen catches up to where it went, with a bounce.
                    settle?.cancel()
                    settle = Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(90))
                        guard !Task.isCancelled else { return }
                        withAnimation(.spring(duration: 0.6, bounce: 0.45)) { lead = 0 }
                    }
                }
            }
            .coordinateSpace(name: sparklerSpace)
            // The one line down the feed, over the posts, with the sparkler at its tip and a trail
            // of sparkle behind it.
            .overlay(alignment: .topLeading) {
                // From the very top of the feed, so pulling the feed down never opens a gap under the
                // black band's line (Steve, 2026-11-02).
                SparklerLine(top: 0, rest: rest, lead: lead, end: end, scrolled: scrolled, stripe: Color(look.stripe), still: !moving, dust: dust)
            }
        }
        }
        .background(Color(look.backdrop))
    }
}

/// The text box in the black room above the feed: obviously a place to type, with the lead-in
/// words standing in it until you do. You type on its one short line; when the words reach the
/// end of it (or you press return), it opens the full writing screen with them in it, and the box
/// empties again behind it (Steve, 2026-11-02).
private struct SparklerPostBox: View {
    let prompt: String
    let compose: ((String) -> Void)?
    @State private var typed = ""
    @State private var room: Double = .infinity
    @State private var used: Double = 0
    @FocusState private var focused: Bool

    var body: some View {
        TextField("", text: $typed)
        .font(.subheadline)
        .foregroundStyle(.white)
        .tint(.white)
        .lineLimit(1)
        .focused($focused)
        .submitLabel(.next)
        .onSubmit { open() }
        .onGeometryChange(for: Double.self) { Double($0.size.width) } action: { room = $0 }
        // How wide the words typed so far are, to tell when they reach the end of the line.
        .background(alignment: .leading) {
            Text(typed).font(.subheadline).lineLimit(1).fixedSize().hidden()
                .onGeometryChange(for: Double.self) { Double($0.size.width) } action: { used = $0 }
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        // The lead-in words, all of them, on up to two lines until you type.
        .overlay(alignment: .leading) {
            if typed.isEmpty {
                Text(prompt).font(.footnote).foregroundStyle(Color.white.opacity(0.65))
                    .lineLimit(2).minimumScaleFactor(0.7)
                    .padding(.horizontal, 10)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityLabel(prompt)
        .background(Color.white.opacity(0.1), in: .rect(cornerRadius: 9))
        .overlay(RoundedRectangle(cornerRadius: 9).stroke(Color.white.opacity(focused ? 0.7 : 0.4), lineWidth: 1))
        // Clear of Home and Menu on the left and the logo on the right.
        .padding(.leading, 64).padding(.trailing, 122).padding(.vertical, 9)
        .accessibilityIdentifier("sparkler-compose")
        .onChange(of: used) { _, width in
            if !typed.isEmpty, width >= room - 8 { open() }
        }
    }

    private func open() {
        guard !typed.isEmpty, let compose else { return }
        let text = typed
        focused = false
        typed = ""
        compose(text)
    }
}

/// The line down the left of the screen, from the top of the feed to the tip, with a trail of
/// sparkle along it that thins out toward the top of the screen, and the sparkler burning at its
/// end. Drawn in the screen's own points.
private struct SparklerLine: View {
    /// Where the feed's first post starts on screen (0 once scrolled past it).
    let top: Double
    /// Where the tip rests on screen, how far a swipe has thrown it ahead, and where the feed ends.
    let rest: Double
    let lead: Double
    let end: Double
    let scrolled: Double
    let stripe: Color
    let still: Bool
    let dust: DustBox

    var body: some View {
        let tip = min(rest + lead, end)
        let atEnd = tip >= end - 1
        ZStack(alignment: .topLeading) {
            Canvas { ctx, size in
                var line = Path()
                line.move(to: CGPoint(x: 30, y: 0))
                line.addLine(to: CGPoint(x: 30, y: Double(size.height)))
                // The shared glass look, in the stripe's light blue.
                NeonGlassLook(color: stripe, white: 0.8).stroke(line, width: Sparkler.lineWidth, in: ctx)
            }
            // One piece, from the header's light blue edge (up through the black band above the
            // feed) to the tip, so it never breaks or thins anywhere, pulled down or not (Steve,
            // 2026-11-02).
            .frame(width: 60, height: max(1, tip - top + Sparkler.topRoom))
            .offset(x: Sparkler.lineX - 30, y: min(top, tip) - Sparkler.topRoom)
            SparkleTrail(top: top, tip: tip, scrolled: scrolled, still: still, dust: dust)
                .frame(width: 80, height: max(1, tip + 180))
                .offset(x: Sparkler.lineX - 40)
            if !atEnd {
                SparklerTip(still: still)
                    .offset(x: Sparkler.lineX - SparklerTip.size / 2, y: tip - SparklerTip.size / 2)
                    .accessibilityIdentifier("sparkler-tip")
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The stardust the sparkler has shed, kept across redraws (each frame adds to it as it moves).
final class DustBox {
    var trail = Sparkler.DustTrail()
    /// Where the sparkler and its trail are on screen this frame, so the metal bars between posts
    /// can catch their light.
    var tip: Double = -1000
    var shown: [Sparkler.Mote] = []
}

/// The trail of sparkle and stardust the sparkler leaves (Kit Sparkler.DustTrail).
private struct SparkleTrail: View {
    let top: Double
    let tip: Double
    let scrolled: Double
    let still: Bool
    let dust: DustBox
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        if still {
            Canvas { ctx, size in draw(ctx, size: size, time: 0) }
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 30)) { t in
                Canvas { ctx, size in draw(ctx, size: size, time: t.date.timeIntervalSinceReferenceDate) }
            }
        }
    }

    private func draw(_ ctx: GraphicsContext, size: CGSize, time: Double) {
        let dark = scheme == .dark
        // The trail: where the sparkler has been, held on the screen (never carried by the scroll),
        // each mote drifting on the way it was laid and slowing, and none of it permanent (Steve,
        // 2026-11-02). Stardust is bright on the dark, gold on light posts; glints are yellow.
        if !still { dust.trail.follow(tip: tip, content: scrolled + tip, time: time) }
        let warm = Color(RGB(hex: dark ? "#FFF3B0" : "#E6A700")!), cool = Color(RGB(hex: dark ? "#FFFFFF" : "#F5C518")!)
        let yellows = dark ? Sparkler.trailColors : Sparkler.trailColorsLight
        let motes = dust.trail.motes(time: time)
        dust.tip = tip
        dust.shown = motes
        for m in motes {
            let x = 40 + m.dx
            if m.glint {
                let color = Color(yellows[m.color % yellows.count]).opacity(m.opacity)
                var star = Path()
                star.move(to: CGPoint(x: x - m.r, y: m.y)); star.addLine(to: CGPoint(x: x + m.r, y: m.y))
                star.move(to: CGPoint(x: x, y: m.y - m.r)); star.addLine(to: CGPoint(x: x, y: m.y + m.r))
                ctx.stroke(star, with: .color(color), style: StrokeStyle(lineWidth: 1.4, lineCap: .round))
                ctx.fill(Path(ellipseIn: CGRect(x: x - m.r * 0.4, y: m.y - m.r * 0.4, width: m.r * 0.8, height: m.r * 0.8)), with: .color(color))
            } else {
                ctx.fill(Path(ellipseIn: CGRect(x: x - m.r, y: m.y - m.r, width: m.r * 2, height: m.r * 2)), with: .color((m.warm ? warm : cool).opacity(m.opacity)))
            }
        }
    }
}

/// The warm light the sparkler and its sparkles cast on a brushed metal bar between posts: brushed
/// metal smears a light into a streak along the brushing, brightest right where the light is and
/// strongest as the bar passes close by.
private struct SparkleLightOnMetal: View {
    let dust: DustBox
    let still: Bool

    var body: some View {
        GeometryReader { geo in
            let y0 = Double(geo.frame(in: .named(sparklerSpace)).midY)
            // Only near the sparkler: the others wait, still.
            TimelineView(.animation(minimumInterval: 1.0 / 30, paused: still || abs(dust.tip - y0) > 400)) { _ in
                Canvas { ctx, size in
                    var lit = ctx
                    lit.blendMode = .screen
                    let h = Double(size.height)
                    // The sparkler itself: a broad warm streak.
                    let near = exp(-pow((dust.tip - y0) / 110, 2))
                    if near > 0.02 {
                        // Across the whole bar, constantly receding toward the right (Steve, 2026-11-02).
                        wash(lit, x: Sparkler.lineX, w: Double(size.width), h: h, strength: near * 0.8)
                        streak(lit, x: Sparkler.lineX, width: 120, h: h, strength: near * 0.7)
                    }
                    // Each sparkle close by: a small one where it is.
                    for m in dust.shown where abs(m.y - y0) < 60 {
                        let k = exp(-pow((m.y - y0) / 24, 2)) * m.opacity * (m.glint ? 0.7 : 0.35)
                        if k > 0.02 { streak(lit, x: Sparkler.lineX + m.dx, width: m.glint ? 90 : 50, h: h, strength: k) }
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }

    /// The light spread along the bar from the sparkler's side, fading steadily to the far right.
    private func wash(_ ctx: GraphicsContext, x: Double, w: Double, h: Double, strength: Double) {
        let warm = Color(RGB(hex: "#FFD873")!)
        let k = min(1, strength)
        let stops: [Gradient.Stop] = (0...8).map { i in
            let f = Double(i) / 8
            return .init(color: warm.opacity(k * 0.75 * exp(-3 * f)), location: f)
        }
        let band = CGRect(x: 0, y: 1, width: w, height: h - 3)
        ctx.fill(Path(band), with: .linearGradient(Gradient(stops: stops), startPoint: CGPoint(x: x, y: 0), endPoint: CGPoint(x: w, y: 0)))
        // Brightest along the upper face, where the raised metal faces the light.
        var sheen = Path()
        sheen.move(to: CGPoint(x: 0, y: h * 0.3)); sheen.addLine(to: CGPoint(x: w, y: h * 0.3))
        let line: [Gradient.Stop] = (0...8).map { i in
            let f = Double(i) / 8
            return .init(color: Color.white.opacity(k * 0.5 * exp(-3.5 * f)), location: f)
        }
        ctx.stroke(sheen, with: .linearGradient(Gradient(stops: line), startPoint: CGPoint(x: x, y: 0), endPoint: CGPoint(x: w, y: 0)), lineWidth: 1)
    }

    private func streak(_ ctx: GraphicsContext, x: Double, width: Double, h: Double, strength: Double) {
        let warm = Color(RGB(hex: "#FFD873")!)
        let rect = CGRect(x: x - width / 2, y: 1, width: width, height: h - 2)
        ctx.fill(Path(ellipseIn: rect), with: .radialGradient(
            Gradient(colors: [warm.opacity(min(1, strength)), warm.opacity(min(1, strength) * 0.35), .clear]),
            center: CGPoint(x: x, y: h * 0.4), startRadius: 0, endRadius: width / 2))
        // The hot core along the brushing.
        var core = Path()
        core.move(to: CGPoint(x: x - width * 0.22, y: h * 0.35)); core.addLine(to: CGPoint(x: x + width * 0.22, y: h * 0.35))
        ctx.stroke(core, with: .color(Color.white.opacity(min(1, strength) * 0.6)), lineWidth: 1)
    }
}

/// One post's square: its background, the poster's picture in the corner, the card and its
/// comments, and the separator under it.
private struct SparklerPost<Row: View>: View {
    let card: Card
    let index: Int
    let look: SparklerLook
    let bg: Sparkler.Background
    let words: Words
    let hooks: FeedHooks
    let dust: DustBox
    let still: Bool
    let row: (Card) -> Row
    @State private var all: [Beanstalk.Note]?

    var body: some View {
        let notes: [Beanstalk.Note] = all ?? (card.leafComments ?? []).map(Beanstalk.Note.init)
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                row(card)
                    .padding(.trailing, 52)
                SparklerComments(card: card, notes: notes, total: card.counts.comments, ink: Sparkler.ink(bg), stripe: Color(look.stripe), words: words, hooks: hooks)
            }
            .padding(.leading, Sparkler.textLeft).padding(.trailing, 14).padding(.top, 14).padding(.bottom, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background { SparklerBackdrop(bg: bg, seed: index * 31 + 7) }
            .overlay(alignment: .topTrailing) { ProfilePic(card: card).padding(8) }
            // The card's words and icons in the background's own light or dark.
            .environment(\.colorScheme, bg.dark ? .dark : .light)
            // Three picas of very dark brushed metal, raised like an embossed bar: a lit bevel along
            // the top, a shadowed one along the bottom, brushing plain across the whole width; no
            // glow (Steve, 2026-11-02).
            LinearGradient(stops: [
                .init(color: Color(Sparkler.separatorMetal[0]), location: 0),
                .init(color: Color(Sparkler.separatorMetal[1]), location: 0.09),
                .init(color: Color(Sparkler.separatorMetal[2]), location: 0.4),
                .init(color: Color(Sparkler.separatorMetal[3]), location: 0.88),
                .init(color: Color(Sparkler.separatorMetal[4]), location: 1),
            ], startPoint: .top, endPoint: .bottom)
            .overlay {
                Canvas { ctx, size in
                    let w = Double(size.width), h = Double(size.height)
                    // The brushing: fine streaks running the width of the bar.
                    var rnd = Sparkler.Seeded(index &* 131 &+ 5)
                    for _ in 0..<Int(w / 2.5) {
                        let y = 3 + rnd.next() * (h - 6)
                        let x = rnd.next() * w - 40, len = 50 + rnd.next() * 170
                        var p = Path(); p.move(to: CGPoint(x: x, y: y)); p.addLine(to: CGPoint(x: x + len, y: y))
                        let light = rnd.next() < 0.7
                        ctx.stroke(p, with: .color((light ? Color.white : Color.black).opacity(light ? 0.05 + rnd.next() * 0.07 : 0.12 + rnd.next() * 0.1)), lineWidth: 0.6)
                    }
                    // The raised edges: a bright bevel on top, a dark one beneath.
                    ctx.fill(Path(CGRect(x: 0, y: 0, width: w, height: 1)), with: .color(.white.opacity(0.35)))
                    ctx.fill(Path(CGRect(x: 0, y: 1, width: w, height: 1.5)), with: .color(.white.opacity(0.12)))
                    ctx.fill(Path(CGRect(x: 0, y: h - 2.5, width: w, height: 2.5)), with: .color(.black.opacity(0.7)))
                }
            }
            // It stands a little proud of the post below it.
            .shadow(color: .black.opacity(0.6), radius: 2, y: 2)
            .zIndex(1)
            // The light the sparkler and its sparkles cast, caught on the metal as it passes them
            // (Steve, 2026-11-02).
            .overlay { SparkleLightOnMetal(dust: dust, still: still) }
            .frame(height: Sparkler.separatorHeight)
            .accessibilityHidden(true)
        }
        .task(id: card.counts.comments) {
            guard card.counts.comments > 0, let load = hooks.loadComments else { return }
            all = await load(card).map(Beanstalk.Note.init)
        }
    }
}

/// The poster's own profile picture (initials until they add one), in the square's upper right corner.
private struct ProfilePic: View {
    let card: Card

    var body: some View {
        let initials = card.author.displayName.split(separator: " ").prefix(2).compactMap(\.first).map { String($0).uppercased() }.joined()
        ZStack {
            Circle().fill(Color(RGB(hex: "#5B3E96")!))
            if let photo = card.author.photoUrl, let url = URL(string: photo) {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Text(initials).font(.headline).foregroundStyle(.white) }
                    .clipShape(Circle())
            } else {
                Text(initials).font(.headline).foregroundStyle(.white)
            }
        }
        .frame(width: 48, height: 48)
        .overlay(Circle().stroke(.white, lineWidth: 2))
        .accessibilityHidden(true)
    }
}

/// The burning tip leading the way down: a white-hot center throwing a fresh spray of sparks, most
/// of them downward, with embers streaming down below it, so the direction of travel shows and the
/// line plainly goes on past the bottom post (Steve, 2026-11-01). Under Reduce Motion, one still spray.
private struct SparklerTip: View {
    static let size: Double = 84
    /// How far below the tip the falling embers reach.
    static let trail: Double = 110
    let still: Bool

    var body: some View {
        Group {
            if still {
                Canvas { ctx, size in
                    var rnd = Sparkler.Seeded(5)
                    Self.draw(Sparkler.sparks { rnd.next() }, embers: 0.35, in: ctx, size: size)
                }
            } else {
                TimelineView(.animation(minimumInterval: 1.0 / 30)) { t in
                    Canvas { ctx, size in
                        let phase = t.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.2) / 1.2
                        Self.draw(Sparkler.sparks { Double.random(in: 0..<1) }, embers: phase, in: ctx, size: size)
                    }
                }
            }
        }
        .frame(width: Self.size, height: Self.size + Self.trail)
    }

    /// The spray at the center of the top `size` square, and three embers falling the trail below,
    /// `embers` (0 to 1) of the way through their fall.
    static func draw(_ spray: [Sparkler.Spark], embers: Double, in ctx: GraphicsContext, size: CGSize) {
        let cx = Double(size.width) / 2
        let cy = Self.size / 2
        func dot(_ x: Double, _ y: Double, _ r: Double, _ color: Color) {
            ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(color))
        }
        // Embers stream down the way the line is going, fading as they fall.
        let gold = Color(RGB(hex: "#FFD45C")!)
        for i in 0..<3 {
            let f = (embers + Double(i) / 3).truncatingRemainder(dividingBy: 1)
            let y = cy + 14 + f * (Self.trail + cy - 20)
            dot(cx, y, 4 - f * 2.5, gold.opacity(0.9 * (1 - f)))
            var streak = Path()
            streak.move(to: CGPoint(x: cx, y: y - 12 * (1 - f)))
            streak.addLine(to: CGPoint(x: cx, y: y))
            ctx.stroke(streak, with: .color(.white.opacity(0.7 * (1 - f))), style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
        }
        dot(cx, cy, 16, gold.opacity(0.22))
        dot(cx, cy, 8, Color(RGB(hex: "#FFE680")!).opacity(0.75))
        for s in spray {
            let color = Color(Sparkler.sparkColors[s.color])
            let end = CGPoint(x: cx + s.x2 * 1.3, y: cy + s.y2 * 1.3)
            var p = Path()
            p.move(to: CGPoint(x: cx + s.x1, y: cy + s.y1))
            p.addLine(to: end)
            ctx.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
            if s.dot { dot(end.x, end.y, 1.6, color) }
        }
        dot(cx, cy, 4, .white)
    }
}

/// A background drawn to the square's real size: a solid block, stars, flowers or a texture.
struct SparklerBackdrop: View {
    let bg: Sparkler.Background
    var seed = 3

    private static let flowerHues: [String: [String]] = ["meadow": ["#F2A7B5", "#F6D365", "#B9A4E8"], "blossoms": ["#F49AB4", "#F7BFD0", "#EE7FA0"]]

    var body: some View {
        Canvas { ctx, size in paint(ctx, size: size) }
            .accessibilityHidden(true)
    }

    private func paint(_ ctx: GraphicsContext, size: CGSize) {
        let w = Double(size.width), h = Double(size.height)
        ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(bg.base)))
        switch bg.group {
        case .solid: break
        case .stars: stars(ctx, w: w, h: h)
        case .flowers: flowers(ctx, w: w, h: h)
        case .texture: textures(ctx, w: w, h: h)
        }
    }

    private func stars(_ ctx: GraphicsContext, w: Double, h: Double) {
        var all: [Sparkler.Star] = Sparkler.stars(w: w, h: h, seed: seed)
        if bg.id == "deep-space" { all += Sparkler.stars(w: w, h: h, seed: seed + 7) }
        let blue = Color(RGB(hex: "#BFE3FF")!)
        for s in all {
            let rect = CGRect(x: s.x - s.r, y: s.y - s.r, width: s.r * 2, height: s.r * 2)
            let tint: Color = s.blue ? blue : .white
            ctx.fill(Path(ellipseIn: rect), with: .color(tint.opacity(s.opacity)))
        }
    }

    private func flowers(_ ctx: GraphicsContext, w: Double, h: Double) {
        let names: [String] = Self.flowerHues[bg.id] ?? Self.flowerHues["meadow"]!
        let hues: [Color] = names.map { Color(RGB(hex: $0)!) }
        let middle = Color(RGB(hex: "#F3C94E")!).opacity(0.55)
        for f in Sparkler.flowers(w: w, h: h, seed: seed) {
            var petals = Path()
            for i in 0..<5 { Self.petal(&petals, f, Double(i)) }
            ctx.fill(petals, with: .color(hues[f.hue % hues.count].opacity(0.55)))
            let c: Double = f.r * 0.28
            ctx.fill(Path(ellipseIn: CGRect(x: f.x - c, y: f.y - c, width: c * 2, height: c * 2)), with: .color(middle))
        }
    }

    /// One petal of a five-petal flower, the same shape as the Expo app's petalPath.
    private static func petal(_ p: inout Path, _ f: Sparkler.Flower, _ i: Double) {
        let a: Double = (f.turn + i * 72) * Double.pi / 180
        let l: Double = a - Double.pi / 2
        let side: Double = f.r * 0.55
        let midX: Double = f.x + cos(a) * f.r * 0.5
        let midY: Double = f.y + sin(a) * f.r * 0.5
        let tip = CGPoint(x: f.x + cos(a) * f.r, y: f.y + sin(a) * f.r)
        let c1 = CGPoint(x: midX + cos(l) * side, y: midY + sin(l) * side)
        let c2 = CGPoint(x: midX - cos(l) * side, y: midY - sin(l) * side)
        let centre = CGPoint(x: f.x, y: f.y)
        p.move(to: centre)
        p.addQuadCurve(to: tip, control: c1)
        p.addQuadCurve(to: centre, control: c2)
        p.closeSubpath()
    }

    private func textures(_ ctx: GraphicsContext, w: Double, h: Double) {
        var rnd = Sparkler.Seeded(seed)
        switch bg.id {
        case "linen":
            var across = Path(), down = Path()
            for y in stride(from: 2.0, to: h, by: 4) { across.move(to: CGPoint(x: 0, y: y)); across.addLine(to: CGPoint(x: w, y: y)) }
            for x in stride(from: 2.0, to: w, by: 4) { down.move(to: CGPoint(x: x, y: 0)); down.addLine(to: CGPoint(x: x, y: h)) }
            let thread = Color(RGB(hex: "#D9CFBE")!)
            ctx.stroke(across, with: .color(thread.opacity(0.6)), lineWidth: 0.6)
            ctx.stroke(down, with: .color(thread.opacity(0.4)), lineWidth: 0.6)
        case "paper":
            let speck = Color(RGB(hex: "#BFB49C")!)
            for _ in 0..<Int(w * h / 500) {
                let x: Double = rnd.next() * w
                let y: Double = rnd.next() * h
                let r: Double = 0.3 + rnd.next() * 0.6
                let o: Double = 0.25 + rnd.next() * 0.3
                ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(speck.opacity(o)))
            }
        default:
            // Wood grain: wavy lines across.
            let wood = Color(RGB(hex: "#B48F5E")!).opacity(0.35)
            var y: Double = 4
            var i: Double = 0
            while y < h {
                let amp: Double = 2 + rnd.next() * 4
                let period: Double = 60 + rnd.next() * 80
                var grain = Path()
                grain.move(to: CGPoint(x: 0, y: y))
                for x in stride(from: 10.0, through: w + 10, by: 10) {
                    let wave: Double = sin(x / period * Double.pi * 2 + i) * amp
                    grain.addLine(to: CGPoint(x: x, y: y + wave))
                }
                let width: Double = 0.9 + rnd.next()
                ctx.stroke(grain, with: .color(wood), lineWidth: width)
                y += 7 + rnd.next() * 9
                i += 1
            }
        }
    }
}

// MARK: - Comments

/// A post's comments, indented in from its words, laid out Facebook style (Steve, 2026-11-02;
/// FacebookComments.swift): closed, the top comment's first line fades out before "(+ x more)";
/// a tap opens them, replies indented under their comment; a tap on a comment folds them closed.
/// Only comments get Reply, never their replies.
private struct SparklerComments: View {
    let card: Card
    let notes: [Beanstalk.Note]
    let total: Int
    let ink: (text: RGB, muted: RGB)
    let stripe: Color
    let words: Words
    let hooks: FeedHooks

    var body: some View {
        let count = FacebookThread.count(notes, total: total)
        VStack(alignment: .leading, spacing: 6) {
            // Plainly comments: a speech-bubble and how many (Steve: the folded look alone didn't say so).
            if count > 1 {
                HStack(spacing: 6) {
                    Image(systemName: "bubble.left.and.bubble.right.fill").font(.subheadline).accessibilityHidden(true)
                    Text(words("sparkler.comments", count: count)).sparklerFont(.subheadline, weight: .bold)
                }
                .foregroundStyle(Color(ink.text))
            }
            FacebookComments(
                card: card, notes: notes, total: total,
                ink: FacebookInk(text: Color(ink.text), muted: Color(ink.muted), link: Color(ink.text), thread: Color(ink.muted).opacity(0.6), avatar: Color(ink.text).opacity(0.14)),
                words: words, open: hooks.open)
        }
        .padding(.leading, Sparkler.commentIndent)
    }
}

/// The skin's words, 1 pt bigger than the system's (Steve), still growing with the reader's text size.
private struct SparklerFont: ViewModifier {
    @ScaledMetric private var size: CGFloat
    private let weight: Font.Weight

    init(_ style: Font.TextStyle, weight: Font.Weight) {
        let base: CGFloat = switch style {
        case .title3: 20
        case .headline, .body: 17
        case .callout: 16
        case .subheadline: 15
        case .footnote: 13
        case .caption: 12
        default: 17
        }
        _size = ScaledMetric(wrappedValue: base + 1, relativeTo: style)
        self.weight = weight
    }

    func body(content: Content) -> some View { content.font(.system(size: size, weight: weight)) }
}

private extension View {
    func sparklerFont(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> some View { modifier(SparklerFont(style, weight: weight)) }
}

// MARK: - Menu → Settings → Themes → Full Screen Sparkler Theme → Background choices

/// Menu → Settings (Steve, 2026-11-01): where Themes lives.
struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                NavigationLink(model.words("themes.title")) { ThemesView() }
            }
            .navigationTitle(model.words("themes.settings"))
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button(model.words("common.close")) { dismiss() } }
            }
        }
    }
}

/// Settings → Themes: each theme's own settings.
struct ThemesView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        List {
            NavigationLink(model.words("themes.sparkler")) { SparklerThemeView() }
        }
        .navigationTitle(model.words("themes.title"))
    }
}

/// Themes → Full Screen Sparkler Theme.
struct SparklerThemeView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        List {
            NavigationLink(model.words("themes.backgrounds")) { SparklerBackgroundsView() }
        }
        .navigationTitle(model.words("themes.sparkler"))
    }
}

/// Full Screen Sparkler Theme → Background choices: solid color blocks, starfields, flowers and
/// textures, chosen like Facebook post backgrounds and kept on this device.
struct SparklerBackgroundsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(Sparkler.storageKey) private var chosen = "white"

    var body: some View {
        List {
            Section { Text(model.words("themes.backgroundsHint")) }
            ForEach(Sparkler.Kind.allCases, id: \.self) { kind in
                Section(model.words("themes.groups.\(kind.rawValue)")) {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 88), spacing: 12)], spacing: 12) {
                        ForEach(Sparkler.backgrounds.filter { $0.group == kind }) { bg in
                            let on = Sparkler.background(chosen).id == bg.id
                            Button { chosen = bg.id } label: {
                                VStack(spacing: 4) {
                                    SparklerBackdrop(bg: bg)
                                        .frame(width: 72, height: 72)
                                        .clipShape(.rect(cornerRadius: 10))
                                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(on ? Color.accessibleAccent : Color.subtle.opacity(0.4), lineWidth: on ? 3 : 1))
                                    Text(bg.name).font(.footnote).multilineTextAlignment(.center).lineLimit(2)
                                }
                                .frame(maxWidth: .infinity)
                                .contentShape(.rect)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(bg.name)
                            .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
                        }
                    }
                    .padding(.vertical, 6)
                }
            }
        }
        .navigationTitle(model.words("themes.backgrounds"))
    }
}

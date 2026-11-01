import PrayerTowerKit
import SwiftUI

// MARK: - Full Screen Sparkler (Steve, 2026-11-01)

/// The feed's scroll view, which the feed measures how far it has scrolled against.
private let sparklerSpace = "sparkler-feed"

/// A simple full-screen scroll with no border: each post fills the screen's width. ONE line on the
/// left runs down the whole feed over the posts and grows downward as you scroll, with a burning
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
    /// How far the feed has scrolled, and how tall it is.
    @State private var scrolled: Double = 0
    @State private var feedHeight: Double = 0
    /// Where the line's tip has reached, in the feed's own points. It never draws back.
    @State private var reached: Double = 0

    var body: some View {
        let words = Words(wording)
        let bg = Sparkler.background(chosen)
        GeometryReader { geo in
            let screen = Double(geo.size.height)
            let tip = Sparkler.tip(scrolled: scrolled, screen: screen, reached: reached, feedHeight: feedHeight)
            // Up and down only.
            ScrollView(.vertical) {
                LazyVStack(spacing: 0) {
                    // Black room under the Home and Menu buttons, so they never sit on a post's words.
                    Color(look.backdrop).frame(height: Sparkler.topRoom).accessibilityHidden(true)
                    ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                        SparklerPost(card: card, index: i, look: look, bg: bg, words: words, hooks: hooks, row: row)
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
                // The one line down the whole feed, over the posts, with the sparkler at its tip.
                .overlay(alignment: .topLeading) {
                    SparklerLine(from: max(0, scrolled - 60), tip: tip, atEnd: feedHeight > 0 && tip >= feedHeight - 1, stripe: Color(look.stripe), still: still || GrowingIn<EmptyView>.frozen)
                }
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(sparklerSpace)) } action: { r in
                    scrolled = Double(-r.minY)
                    feedHeight = Double(r.height)
                    let next = Sparkler.tip(scrolled: scrolled, screen: screen, reached: reached, feedHeight: feedHeight)
                    if next > reached { reached = next }
                }
            }
            .coordinateSpace(name: sparklerSpace)
        }
        .background(Color(look.backdrop))
    }
}

/// The line down the left of the feed, grown to `tip`, and the sparkler burning at its end.
private struct SparklerLine: View {
    /// Only the part from here (just above the screen's top) is drawn; above it is off screen.
    let from: Double
    let tip: Double
    let atEnd: Bool
    let stripe: Color
    let still: Bool

    var body: some View {
        ZStack(alignment: .topLeading) {
            Canvas { ctx, _ in
                var line = Path()
                line.move(to: CGPoint(x: 30, y: 0))
                line.addLine(to: CGPoint(x: 30, y: max(0, tip - from)))
                // The shared glass look, in the stripe's light blue.
                NeonGlassLook(color: stripe, white: 0.8).stroke(line, width: Sparkler.lineWidth, in: ctx)
            }
            .frame(width: 60, height: max(1, tip - from))
            .offset(x: Sparkler.lineX - 30, y: min(from, tip))
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

/// One post's square: its background, the poster's picture in the corner, the card and its
/// comments, and the separator under it.
private struct SparklerPost<Row: View>: View {
    let card: Card
    let index: Int
    let look: SparklerLook
    let bg: Sparkler.Background
    let words: Words
    let hooks: FeedHooks
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
            // A black line with a light blue line through its middle.
            Color(look.backdrop)
                .frame(height: Sparkler.separatorHeight)
                .overlay { Color(look.stripe).frame(height: Sparkler.stripeHeight) }
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

/// A post's comments, indented in from its words, with their replies indented further. Closed,
/// only the first line of the first comment shows, with the rest folded up under it like
/// accordion-folded paper. A tap unfolds the next 5 comments; "more" unfolds the next 5 after
/// that; a tap on an open comment folds them all closed again (Steve, 2026-11-01). Each comment
/// shows its first reply; a tap shows the rest, another tap folds them back. Only comments get
/// Reply, never their replies.
private struct SparklerComments: View {
    let card: Card
    let notes: [Beanstalk.Note]
    let total: Int
    let ink: (text: RGB, muted: RGB)
    let stripe: Color
    let words: Words
    let hooks: FeedHooks
    /// How many comments are unfolded: 0 is closed.
    @State private var openTo = 0
    @State private var allReplies: String?
    @Environment(\.accessibilityReduceMotion) private var still

    private var unfold: Animation { still ? .easeInOut(duration: 0.15) : .spring(duration: 0.45, bounce: 0.15) }

    var body: some View {
        let tree = Beanstalk.tree(notes)
        let tops = tree.top
        if let first = tops.first {
            let count = max(tops.count, total)
            VStack(alignment: .leading, spacing: 12) {
                if openTo == 0 {
                    closed(first, more: count - 1, opens: min(1 + Sparkler.opened, tops.count))
                } else {
                    ForEach(Array(tops.prefix(openTo).enumerated()), id: \.element.id) { i, note in
                        comment(note, replies: tree.kids[note.id] ?? [])
                            .transition(still ? .opacity : .accordion(i))
                    }
                    let left = count - openTo
                    if left > 0 {
                        Button {
                            if openTo < tops.count {
                                withAnimation(unfold) { openTo = min(openTo + Sparkler.opened, tops.count) }
                            } else {
                                hooks.open?(card)
                            }
                        } label: {
                            Text(words("sparkler.more", ["n": "\(left)"])).sparklerFont(.subheadline, weight: .bold).foregroundStyle(Color(ink.text))
                                .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.leading, Sparkler.commentIndent)
            .clipped()
        }
    }

    /// The first line of the first comment, with the others folded up under it.
    private func closed(_ first: Beanstalk.Note, more: Int, opens: Int) -> some View {
        Button {
            guard opens > 0 else { return }
            withAnimation(unfold) { openTo = opens }
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                (Text("\(first.author): ").bold() + Text(first.body))
                    .sparklerFont(.body).foregroundStyle(Color(ink.text))
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
                if more > 0 {
                    // The folded-up comments: creased paper edges, each a little narrower.
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(0..<min(3, more), id: \.self) { i in
                            FoldedEdge(ink: Color(ink.muted), down: i % 2 == 0)
                                .frame(height: 7)
                                .padding(.trailing, Double(i) * 18)
                        }
                    }
                    .padding(.top, 4)
                    Text(words("sparkler.more", ["n": "\(more)"])).sparklerFont(.footnote, weight: .bold).foregroundStyle(Color(ink.muted))
                        .padding(.top, 4)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityHint(words("sparkler.open"))
    }

    private func comment(_ note: Beanstalk.Note, replies: [Beanstalk.Note]) -> some View {
        let all = allReplies == note.id
        let shown = all ? replies : Array(replies.prefix(1))
        return VStack(alignment: .leading, spacing: 6) {
            Button {
                withAnimation(unfold) { openTo = 0; allReplies = nil }
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(note.author).sparklerFont(.subheadline, weight: .bold)
                    Text(note.body).sparklerFont(.body)
                }
                .foregroundStyle(Color(ink.text))
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityHint(words("sparkler.fold"))
            // Only the comment gets Reply; its replies never do (Steve: overnesting is hard to follow).
            if let open = hooks.open {
                Button { open(card) } label: {
                    Text(words("post.reply")).sparklerFont(.subheadline, weight: .bold).foregroundStyle(Color(ink.text))
                        .padding(.horizontal, 14).frame(minHeight: 44)
                        .overlay(Capsule().stroke(stripe, lineWidth: 1.5))
                }
                .buttonStyle(.plain)
            }
            if !shown.isEmpty {
                Button {
                    withAnimation(unfold) { allReplies = all ? nil : note.id }
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(shown) { r in
                            (Text("\(r.author): ").bold() + Text(r.body)).sparklerFont(.subheadline).foregroundStyle(Color(ink.text))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        if !all, replies.count > 1 {
                            Text(words("sparkler.moreReplies", count: replies.count - 1)).sparklerFont(.footnote, weight: .bold).foregroundStyle(Color(ink.muted))
                        }
                    }
                    .padding(.leading, 10)
                    .overlay(alignment: .leading) { Rectangle().fill(stripe).frame(width: 3) }
                    // Replies sit further in than their comment.
                    .padding(.leading, Sparkler.replyIndent - Sparkler.commentIndent)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .disabled(replies.count < 2)
            }
        }
        .padding(.leading, 10)
        .overlay(alignment: .leading) { Rectangle().fill(stripe.opacity(0.6)).frame(width: 2) }
    }
}

/// One folded-up comment's edge: a strip of paper creased across its middle.
private struct FoldedEdge: View {
    let ink: Color
    let down: Bool

    var body: some View {
        Canvas { ctx, size in
            let r = CGRect(origin: .zero, size: size)
            ctx.fill(Path(roundedRect: r, cornerRadius: 1.5), with: .color(ink.opacity(0.14)))
            let shade = CGRect(x: 0, y: down ? size.height / 2 : 0, width: size.width, height: size.height / 2)
            ctx.fill(Path(shade), with: .color(ink.opacity(0.16)))
            var crease = Path()
            crease.move(to: CGPoint(x: 0, y: size.height / 2))
            crease.addLine(to: CGPoint(x: size.width, y: size.height / 2))
            ctx.stroke(crease, with: .color(ink.opacity(0.45)), lineWidth: 0.6)
        }
        .accessibilityHidden(true)
    }
}

/// A comment unfolding like a panel of accordion-folded paper: turning out from flat, hinged at
/// its top and bottom by turns, each a beat after the one before.
private struct AccordionPanel: ViewModifier {
    let angle: Double
    let hingeTop: Bool

    func body(content: Content) -> some View {
        content
            .rotation3DEffect(.degrees(angle), axis: (x: 1, y: 0, z: 0), anchor: hingeTop ? .top : .bottom, perspective: 0.6)
            .opacity(abs(angle) > 80 ? 0 : 1)
    }
}

private extension AnyTransition {
    static func accordion(_ i: Int) -> AnyTransition {
        let top = i % 2 == 0
        return AnyTransition.modifier(active: AccordionPanel(angle: top ? -90 : 90, hingeTop: top), identity: AccordionPanel(angle: 0, hingeTop: top))
            .animation(.spring(duration: 0.45, bounce: 0.15).delay(Double(i % Sparkler.opened) * 0.07))
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

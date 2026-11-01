import PrayerTowerKit
import SwiftUI

// MARK: - Full Screen Sparkler (Steve, 2026-11-01)

/// The feed's scroll view, which each post measures itself against.
private let sparklerSpace = "sparkler-feed"

/// A simple full-screen scroll with no border: each post fills the screen's width. A line on the
/// left overlaps the posts and grows downward as you scroll, with a sparkler at its tip leading the
/// way (the line is drawn in the shared connector look, GrowingConnector.swift). Posts are separated
/// by a black line with a light blue line through its middle, the poster's profile picture sits in
/// the upper right corner of each square, and the posts' background is the member's choice under
/// Menu → Settings → Themes → Full Screen Sparkler Theme → Background choices. Like
/// apps/mobile/src/layouts/sparkler.tsx.
struct SparklerFeed<Row: View>: View {
    let look: SparklerLook
    let cards: [Card]
    let wording: Wording
    let hooks: FeedHooks
    @ViewBuilder let row: (Card) -> Row
    @AppStorage(Sparkler.storageKey) private var chosen = "white"

    var body: some View {
        let words = Words(wording)
        let bg = Sparkler.background(chosen)
        GeometryReader { geo in
            // Up and down only.
            ScrollView(.vertical) {
                LazyVStack(spacing: 0) {
                    ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                        SparklerPost(card: card, index: i, look: look, bg: bg, screen: Double(geo.size.height), words: words, hooks: hooks, row: row)
                            .loadsMore(after: card, in: cards, hooks)
                    }
                    // Room under the last post, so its line can grow all the way down to the tip.
                    VStack {
                        if !hooks.hasMore, !cards.isEmpty {
                            Text(words("sparkler.end")).sparklerFont(.callout).foregroundStyle(.white)
                                .multilineTextAlignment(.center).padding(16)
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, minHeight: Double(geo.size.height) * (1 - Sparkler.tipAt) + 40, alignment: .top)
                }
            }
            .coordinateSpace(name: sparklerSpace)
        }
        .background(Color(look.backdrop))
    }
}

/// One post's square: its background, the poster's picture in the corner, the card and its
/// comments, the separator under it, and the line over its left side with the sparkler at the tip.
private struct SparklerPost<Row: View>: View {
    let card: Card
    let index: Int
    let look: SparklerLook
    let bg: Sparkler.Background
    let screen: Double
    let words: Words
    let hooks: FeedHooks
    let row: (Card) -> Row
    @Environment(\.accessibilityReduceMotion) private var still
    /// How far down this post the line has grown, 0 to 1. It never draws back while the post is on hand.
    @State private var reached: Double = 0
    @State private var all: [Beanstalk.Note]?

    private var drawn: Double { still || GrowingIn<EmptyView>.frozen ? 1 : reached }

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
        .overlay(alignment: .topLeading) {
            GeometryReader { g in
                let h = Double(g.size.height)
                Canvas { ctx, _ in
                    var line = Path()
                    line.move(to: CGPoint(x: Sparkler.lineX + 30, y: 0))
                    line.addLine(to: CGPoint(x: Sparkler.lineX + 30, y: h * drawn))
                    // The shared glass look, in the stripe's light blue.
                    NeonGlassLook(color: Color(look.stripe), white: 0.8).stroke(line, width: 4, in: ctx)
                }
                .frame(width: Sparkler.lineX + 60, height: h)
                .offset(x: -30)
                .overlay(alignment: .topLeading) {
                    if drawn > 0, drawn < 1 {
                        SparklerTip(still: still)
                            .offset(x: Sparkler.lineX - 32, y: h * drawn - 32)
                    }
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
        // How far the tip has reached into this post, measured against the screen.
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(sparklerSpace)) } action: { r in
            let next = Sparkler.grown(rowTop: Double(r.minY), rowHeight: Double(r.height), screen: screen, reached: reached)
            if next != reached { reached = next }
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

/// The burning tip: a white-hot center throwing out a fresh spray of sparks, or one still spray.
private struct SparklerTip: View {
    let still: Bool

    var body: some View {
        if still {
            Canvas { ctx, size in
                var rnd = Sparkler.Seeded(5)
                Self.draw(Sparkler.sparks { rnd.next() }, in: ctx, size: size)
            }
            .frame(width: 64, height: 64)
        } else {
            TimelineView(.animation(minimumInterval: 0.07)) { _ in
                Canvas { ctx, size in
                    Self.draw(Sparkler.sparks { Double.random(in: 0..<1) }, in: ctx, size: size)
                }
            }
            .frame(width: 64, height: 64)
        }
    }

    static func draw(_ spray: [Sparkler.Spark], in ctx: GraphicsContext, size: CGSize) {
        let c = CGPoint(x: size.width / 2, y: size.height / 2)
        func dot(_ r: Double, _ color: Color) { ctx.fill(Path(ellipseIn: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)), with: .color(color)) }
        dot(11, Color(RGB(hex: "#FFD45C")!).opacity(0.25))
        dot(6, Color(RGB(hex: "#FFE680")!).opacity(0.7))
        for s in spray {
            let color = Color(Sparkler.sparkColors[s.color])
            var p = Path()
            p.move(to: CGPoint(x: c.x + s.x1, y: c.y + s.y1))
            p.addLine(to: CGPoint(x: c.x + s.x2, y: c.y + s.y2))
            ctx.stroke(p, with: .color(color), style: StrokeStyle(lineWidth: 1.3, lineCap: .round))
            if s.dot { ctx.fill(Path(ellipseIn: CGRect(x: c.x + s.x2 - 1.3, y: c.y + s.y2 - 1.3, width: 2.6, height: 2.6)), with: .color(color)) }
        }
        dot(3, .white)
    }
}

/// A background drawn to the square's real size: a solid block, stars, flowers or a texture.
struct SparklerBackdrop: View {
    let bg: Sparkler.Background
    var seed = 3

    private static let flowerHues: [String: [String]] = ["meadow": ["#F2A7B5", "#F6D365", "#B9A4E8"], "blossoms": ["#F49AB4", "#F7BFD0", "#EE7FA0"]]

    var body: some View {
        Canvas { ctx, size in
            let w = Double(size.width), h = Double(size.height)
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(bg.base)))
            switch bg.group {
            case .solid: break
            case .stars:
                var stars = Sparkler.stars(w: w, h: h, seed: seed)
                if bg.id == "deep-space" { stars += Sparkler.stars(w: w, h: h, seed: seed + 7) }
                for s in stars {
                    ctx.fill(Path(ellipseIn: CGRect(x: s.x - s.r, y: s.y - s.r, width: s.r * 2, height: s.r * 2)), with: .color((s.blue ? Color(RGB(hex: "#BFE3FF")!) : .white).opacity(s.opacity)))
                }
            case .flowers:
                let hues = (Self.flowerHues[bg.id] ?? Self.flowerHues["meadow"]!).map { Color(RGB(hex: $0)!) }
                for f in Sparkler.flowers(w: w, h: h, seed: seed) {
                    var petals = Path()
                    for i in 0..<5 {
                        let a = (f.turn + Double(i) * 72) * .pi / 180
                        let l = a - .pi / 2, side = f.r * 0.55
                        let mid = CGPoint(x: f.x + cos(a) * f.r * 0.5, y: f.y + sin(a) * f.r * 0.5)
                        petals.move(to: CGPoint(x: f.x, y: f.y))
                        petals.addQuadCurve(to: CGPoint(x: f.x + cos(a) * f.r, y: f.y + sin(a) * f.r), control: CGPoint(x: mid.x + cos(l) * side, y: mid.y + sin(l) * side))
                        petals.addQuadCurve(to: CGPoint(x: f.x, y: f.y), control: CGPoint(x: mid.x - cos(l) * side, y: mid.y - sin(l) * side))
                        petals.closeSubpath()
                    }
                    ctx.fill(petals, with: .color(hues[f.hue % hues.count].opacity(0.55)))
                    let c = f.r * 0.28
                    ctx.fill(Path(ellipseIn: CGRect(x: f.x - c, y: f.y - c, width: c * 2, height: c * 2)), with: .color(Color(RGB(hex: "#F3C94E")!).opacity(0.55)))
                }
            case .texture:
                textures(ctx, w: w, h: h)
            }
        }
        .accessibilityHidden(true)
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
            for _ in 0..<Int(w * h / 500) {
                let x = rnd.next() * w, y = rnd.next() * h, r = 0.3 + rnd.next() * 0.6, o = 0.25 + rnd.next() * 0.3
                ctx.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(Color(RGB(hex: "#BFB49C")!).opacity(o)))
            }
        default:
            // Wood grain: wavy lines across.
            var y = 4.0, i = 0.0
            while y < h {
                let a = 2 + rnd.next() * 4, period = 60 + rnd.next() * 80
                var grain = Path()
                grain.move(to: CGPoint(x: 0, y: y))
                for x in stride(from: 10.0, through: w + 10, by: 10) { grain.addLine(to: CGPoint(x: x, y: y + sin(x / period * .pi * 2 + i) * a)) }
                ctx.stroke(grain, with: .color(Color(RGB(hex: "#B48F5E")!).opacity(0.35)), lineWidth: 0.9 + rnd.next())
                y += 7 + rnd.next() * 9
                i += 1
            }
        }
    }
}

// MARK: - Comments

/// The post's comments in its square. Closed: the newest comment with its first reply (Steve: the
/// first reply shows under every comment that has replies). A tap opens the newest five; another
/// folds them closed. Tapping a comment's replies shows the rest, and again folds them away.
private struct SparklerComments: View {
    let card: Card
    let notes: [Beanstalk.Note]
    let total: Int
    let ink: (text: RGB, muted: RGB)
    let stripe: Color
    let words: Words
    let hooks: FeedHooks
    @State private var spread = false
    @State private var allReplies: String?

    var body: some View {
        let tree = Beanstalk.tree(notes)
        let shown = Array(tree.top.prefix(spread ? Sparkler.opened : 1))
        let left = max(tree.top.count, total) - shown.count
        if !shown.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(shown) { note in
                    comment(note, replies: tree.kids[note.id] ?? [])
                }
                if left > 0 {
                    Button {
                        if spread { hooks.open?(card) } else { spread = true }
                    } label: {
                        Text(words("sparkler.more", ["n": "\(left)"])).sparklerFont(.subheadline, weight: .bold).foregroundStyle(Color(ink.text))
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func comment(_ note: Beanstalk.Note, replies: [Beanstalk.Note]) -> some View {
        let all = allReplies == note.id
        let shown = all ? replies : Array(replies.prefix(1))
        return VStack(alignment: .leading, spacing: 6) {
            Button {
                spread.toggle()
                if !spread { allReplies = nil }
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
            .accessibilityHint(words(spread ? "sparkler.fold" : "sparkler.open"))
            // Only the comment gets Reply; its replies never do (Steve: overnesting is hard to follow).
            if spread, let open = hooks.open {
                Button { open(card) } label: {
                    Text(words("post.reply")).sparklerFont(.subheadline, weight: .bold).foregroundStyle(Color(ink.text))
                        .padding(.horizontal, 14).frame(minHeight: 44)
                        .overlay(Capsule().stroke(stripe, lineWidth: 1.5))
                }
                .buttonStyle(.plain)
            }
            if !shown.isEmpty {
                Button {
                    allReplies = all ? nil : note.id
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(shown) { r in
                            (Text("\(r.author): ").bold() + Text(r.body)).sparklerFont(.subheadline).foregroundStyle(Color(ink.text))
                        }
                        if !all, replies.count > 1 {
                            Text(words("sparkler.moreReplies", count: replies.count - 1)).sparklerFont(.footnote, weight: .bold).foregroundStyle(Color(ink.muted))
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 10)
                    .overlay(alignment: .leading) { Rectangle().fill(stripe).frame(width: 3) }
                    .padding(.leading, 8)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .disabled(replies.count < 2)
            }
        }
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

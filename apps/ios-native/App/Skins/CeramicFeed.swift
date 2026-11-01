import PrayerTowerKit
import SwiftUI

// MARK: - Ceramic Figurine (Steve, 2026-10-31)

/// The "elegant retired lady version", drawn from the Claude Design canvas like
/// layouts/ceramic.tsx: pastel unglazed ceramic plaques with etched edges in shadow boxes on
/// platforms, hauled up toward heaven by winged angel figurines on ropes over white pulleys in
/// clouds. The centered post's angel lets go and presents it; every third post a little statue
/// points at it; now and then an angel flies to the new center post. Comments hang from ceramic
/// placards tied under the post: closed, only the first comment's first line; a tap flops them
/// down; under each comment with replies the first reply hangs exposed, and a tap flops the rest
/// down; tapping again folds them up. No Reply on replies. A ceramic turtle walks behind the
/// cards. Plaques, boxes and placards grow with their text; the skin's own text is 1 pt bigger.
struct CeramicFeed<Row: View>: View {
    let look: CeramicLook
    let cards: [Card]
    let wording: Wording
    let hooks: FeedHooks
    @ViewBuilder let row: (Card) -> Row
    @AppStorage("ceramic.figurines") private var choice = "mix"
    @State private var picking = false
    @State private var mids: [Int: Double] = [:]
    @State private var center: Int?
    @State private var trip: CeramicTrip?
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        let words = Words(wording)
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                Color(look.backdrop).ignoresSafeArea()
                // Behind the cards, so the turtle only shows in the gaps between them.
                if !still { CeramicTurtle(width: Double(geo.size.width)).frame(maxHeight: .infinity, alignment: .bottom).padding(.bottom, 8).accessibilityHidden(true) }
                ScrollView(.vertical) {
                    LazyVStack(alignment: .leading, spacing: 30) {
                        Button { picking = true } label: {
                            HStack(spacing: 6) {
                                FigurineView(look: Ceramic.look(choice, 0), pose: .sit, width: 22)
                                Text(words("ceramic.pickTitle")).ceramicFont(.subheadline).foregroundStyle(CeramicArt.ink)
                            }
                            .padding(.horizontal, 12).frame(minHeight: 44)
                            .background(CeramicArt.button, in: .capsule)
                        }
                        .buttonStyle(.plain)
                        .padding(.horizontal, 12).padding(.top, HomeAndMenu.overhang + 10)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                            CeramicPost(card: card, index: i, width: Double(geo.size.width), choice: choice, centered: center == i, words: words, hooks: hooks, row: row)
                                .onGeometryChange(for: Double.self) { Double($0.frame(in: .named(CeramicTrip.space)).midY) } action: { mid in
                                    mids[i] = mid
                                    findCenter(screen: Double(geo.size.height))
                                }
                                .loadsMore(after: card, in: cards, hooks)
                        }
                        if !hooks.hasMore, !cards.isEmpty {
                            Text(words("ceramic.end")).ceramicFont(.subheadline).foregroundStyle(CeramicArt.softInk)
                                .multilineTextAlignment(.center).frame(maxWidth: .infinity).padding(.horizontal, 24)
                        }
                        Color.clear.frame(height: 90)
                    }
                }
                .scrollIndicators(.hidden)
                .coordinateSpace(name: CeramicTrip.space)
                if let trip, !still {
                    FlyingAngel(trip: trip, look: Ceramic.look(choice, trip.post), size: geo.size).allowsHitTesting(false).accessibilityHidden(true)
                }
            }
        }
        .environment(\.colorScheme, .light)
        .sheet(isPresented: $picking) { FigurinePicker(choice: $choice, words: words) }
    }

    /// The post nearest the middle of the screen is the one its angel presents; now and then an
    /// angel flies there from the post that was centered before.
    private func findCenter(screen: Double) {
        guard let mid = Ceramic.centered(mids, screen: screen), mid != center else { return }
        let before = center
        center = mid
        guard let before, trip == nil, !still, Bool.random() else { return }
        trip = CeramicTrip(post: mid, down: mid > before, left: mid.isMultiple(of: 2))
        Task {
            try? await Task.sleep(for: .seconds(3.4))
            trip = nil
        }
    }
}

struct CeramicTrip: Equatable {
    static let space = "ceramic-feed"
    let post: Int
    let down: Bool
    let left: Bool
}

/// The skin's colors, and its drawings read straight from the design's outlines.
enum CeramicArt {
    static let ink = Color(RGB(hex: "#4B3F47")!)
    static let softInk = Color(RGB(hex: "#64555E")!)
    static let rope = Color(RGB(hex: "#D9AF88")!)
    static let ropeLight = Color(RGB(hex: "#F6E7D3")!)
    static let cloud = Color(RGB(hex: "#FBF8FB")!)
    static let cloudLine = Color(RGB(hex: "#CFC1CE")!)
    static let button = Color(RGB(hex: "#EDE3E6")!)
    static let placard = Color(RGB(hex: "#F7F1EE")!)
    static let replyPlacard = Color(RGB(hex: "#E6DEF0")!)
    static let etch = Color(red: 95 / 255, green: 70 / 255, blue: 85 / 255)
    static let shade = Color(red: 70 / 255, green: 50 / 255, blue: 60 / 255)
    static let tints = ["#DCE6EF", "#F3DDD7", "#DDEADF", "#F2EBD2", "#E6DEF0"].map { Color(RGB(hex: $0)!) }

    static func path(_ d: String) -> Path {
        var p = Path()
        for s in SVGPath.parse(d) {
            switch s {
            case let .move(x, y): p.move(to: CGPoint(x: x, y: y))
            case let .line(x, y): p.addLine(to: CGPoint(x: x, y: y))
            case let .cubic(a, b, c, d, x, y): p.addCurve(to: CGPoint(x: x, y: y), control1: CGPoint(x: a, y: b), control2: CGPoint(x: c, y: d))
            case let .quad(a, b, x, y): p.addQuadCurve(to: CGPoint(x: x, y: y), control: CGPoint(x: a, y: b))
            case .close: p.closeSubpath()
            }
        }
        return p
    }

    static func circle(_ cx: Double, _ cy: Double, _ r: Double) -> Path { Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r)) }
    static func ellipse(_ cx: Double, _ cy: Double, _ rx: Double, _ ry: Double) -> Path { Path(ellipseIn: CGRect(x: cx - rx, y: cy - ry, width: 2 * rx, height: 2 * ry)) }
}

extension GraphicsContext {
    /// Fills and outlines a shape, as an SVG element with `fill` and `stroke` does.
    func paint(_ p: Path, fill: Color? = nil, stroke: Color? = nil, width: Double = 1, cap: CGLineCap = .butt, join: CGLineJoin = .miter, dash: [CGFloat] = [], opacity: Double = 1) {
        var c = self
        c.opacity = opacity
        if let fill { c.fill(p, with: .color(fill)) }
        if let stroke { c.stroke(p, with: .color(stroke), style: StrokeStyle(lineWidth: width, lineCap: cap, lineJoin: join, dash: dash)) }
    }

    func paint(_ d: String, fill: Color? = nil, stroke: Color? = nil, width: Double = 1, cap: CGLineCap = .butt, join: CGLineJoin = .miter, dash: [CGFloat] = [], opacity: Double = 1) {
        paint(CeramicArt.path(d), fill: fill, stroke: stroke, width: width, cap: cap, join: join, dash: dash, opacity: opacity)
    }
}

/// The skin's words, 1 pt bigger than the system's (Steve, 2026-10-31), still growing with the reader's text size.
private struct CeramicFont: ViewModifier {
    @ScaledMetric private var size: CGFloat
    private let weight: Font.Weight
    private let serif: Bool

    init(_ style: Font.TextStyle, weight: Font.Weight, serif: Bool) {
        let base: CGFloat = switch style {
        case .title2: 22
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
        self.serif = serif
    }

    func body(content: Content) -> some View { content.font(.system(size: size, weight: weight, design: serif ? .serif : .default)) }
}

private extension View {
    func ceramicFont(_ style: Font.TextStyle, weight: Font.Weight = .regular, serif: Bool = false) -> some View { modifier(CeramicFont(style, weight: weight, serif: serif)) }
}

/// The Ceramic header: the cream shelf up behind the clock, with an etched line along its foot.
struct CeramicHeader: View {
    var body: some View {
        SkinHeaderBand(edge: 4) { ctx, size, bottom in
            ctx.fill(Path(CGRect(x: 0, y: 0, width: size.width, height: bottom + 1)), with: .color(Color(RGB(hex: "#F6F0EE")!)))
            ctx.fill(Path(CGRect(x: 0, y: bottom, width: size.width, height: 1)), with: .color(Color(red: 110 / 255, green: 85 / 255, blue: 100 / 255).opacity(0.3)))
            ctx.fill(Path(CGRect(x: 0, y: bottom + 1, width: size.width, height: 1)), with: .color(.white.opacity(0.8)))
        }
    }
}

// MARK: - A post

private struct CeramicPost<Row: View>: View {
    let card: Card
    let index: Int
    let width: Double
    let choice: String
    let centered: Bool
    let words: Words
    let hooks: FeedHooks
    let row: (Card) -> Row
    @State private var all: [Beanstalk.Note]?

    var body: some View {
        let fig = Ceramic.figures(choice, index: index)
        let tint = CeramicArt.tints[index % CeramicArt.tints.count]
        let notes: [Beanstalk.Note] = all ?? (card.leafComments ?? []).map(Beanstalk.Note.init)
        let tree = Beanstalk.tree(notes)
        let total = all != nil ? tree.top.count : max(tree.top.count, card.counts.comments)
        VStack(spacing: 0) {
            Haul(width: width, left: fig.left, pointer: fig.statue != nil)
                .frame(height: 112, alignment: .top)
                .overlay(alignment: fig.left ? .topLeading : .topTrailing) {
                    FigurineView(look: fig.angel, pose: .pull, present: centered, flip: !fig.left, width: 46)
                        .padding(.top, 22).padding(fig.left ? .leading : .trailing, 4)
                }
                .overlay(alignment: fig.left ? .topTrailing : .topLeading) {
                    if let statue = fig.statue {
                        FigurineView(look: statue, pose: .stand, flip: fig.left, width: 46)
                            .padding(.top, 22).padding(fig.left ? .trailing : .leading, 4)
                    }
                }
                .accessibilityHidden(true)
            VStack(spacing: 0) {
                // The shadow box: an outer frame, a sunken well, and the pastel plaque inside.
                row(card)
                    .padding(14)
                    .background(tint, in: .rect(cornerRadius: 10))
                    .overlay {
                        ZStack {
                            RoundedRectangle(cornerRadius: 7).stroke(CeramicArt.etch.opacity(0.32), lineWidth: 1).padding(5)
                            RoundedRectangle(cornerRadius: 5).stroke(CeramicArt.etch.opacity(0.3), style: StrokeStyle(lineWidth: 1, dash: [1, 2])).padding(9)
                        }
                        .allowsHitTesting(false).accessibilityHidden(true)
                    }
                    .shadow(color: CeramicArt.shade.opacity(0.24), radius: 3.5, y: 4)
                    .padding(7)
                    .background(Color(RGB(hex: "#E5DAD5")!), in: .rect(cornerRadius: 9))
                    .padding(6)
                    .background(Color(RGB(hex: "#F1E4DF")!), in: .rect(cornerRadius: 14))
                    .overlay { RoundedRectangle(cornerRadius: 14).stroke(Color(red: 120 / 255, green: 90 / 255, blue: 105 / 255).opacity(0.2), lineWidth: 1).accessibilityHidden(true) }
                    .shadow(color: CeramicArt.shade.opacity(0.16), radius: 6, y: 5)
                    .padding(.horizontal, 50)
                // The platform it stands on, with its two brass pins.
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(RGB(hex: "#F8F1EC")!))
                    .frame(height: 14)
                    .overlay(alignment: .bottom) { Rectangle().fill(Color(RGB(hex: "#EADDD7")!)).frame(height: 4) }
                    .overlay(alignment: .topLeading) { Circle().fill(Color(RGB(hex: "#E6CFA0")!)).frame(width: 8, height: 8).offset(x: 10, y: -3) }
                    .overlay(alignment: .topTrailing) { Circle().fill(Color(RGB(hex: "#E6CFA0")!)).frame(width: 8, height: 8).offset(x: -10, y: -3) }
                    .shadow(color: CeramicArt.shade.opacity(0.22), radius: 5, y: 6)
                    .padding(.horizontal, 26).padding(.top, -4)
                    .accessibilityHidden(true)
            }
            // The two ropes the shadow box hangs from.
            .background(alignment: .top) {
                HStack {
                    Capsule().fill(CeramicArt.rope).frame(width: 4)
                    Spacer()
                    Capsule().fill(CeramicArt.rope).frame(width: 4)
                }
                .padding(.horizontal, 38).padding(.bottom, 52).padding(.top, -6)
                .accessibilityHidden(true)
            }
            if total > 0, !tree.top.isEmpty {
                Placards(card: card, top: tree.top, kids: tree.kids, total: total, words: words, hooks: hooks)
                    .padding(.horizontal, 52)
            }
        }
        .background(alignment: .topLeading) {
            if index % 5 == 1 || index % 5 == 4 { DriftCloud().offset(x: index.isMultiple(of: 2) ? -40 : width - 90, y: 160).accessibilityHidden(true) }
        }
        .task(id: card.counts.comments) {
            guard card.counts.comments > 0, let load = hooks.loadComments else { return }
            all = await load(card).map(Beanstalk.Note.init)
        }
    }
}

/// The pulley rig over a post, in real points across the screen (never stretched).
private struct Haul: View {
    let width: Double
    let left: Bool
    let pointer: Bool

    var body: some View {
        Canvas { ctx, _ in
            let w = width, mid = w / 2
            let pull = left ? mid - 12 : mid + 12
            let load = left ? mid + 12 : mid - 12
            let hand = left ? 42.0 : w - 42
            let tail = left ? 36.0 : w - 36
            let dir = left ? -1.0 : 1.0
            ctx.paint("M\(mid - 45) 22h90a11 11 0 0 0-2-21.6A17 17 0 0 0 \(mid + 13) -4a14 14 0 0 0-26 3A11 11 0 0 0 \(mid - 45) 22Z", fill: CeramicArt.cloud, stroke: CeramicArt.cloudLine, width: 1.2)
            ctx.paint(Path(roundedRect: CGRect(x: mid - 4, y: 12, width: 8, height: 14), cornerRadius: 2), fill: .white, stroke: Color(RGB(hex: "#B9AEB6")!))
            let haul = "M\(pull) 27 L\(hand) 53.5 L\(tail) 57"
            ctx.paint(haul, stroke: CeramicArt.rope, width: 3.4, cap: .round, join: .round)
            ctx.paint(haul, stroke: CeramicArt.ropeLight, width: 3.4, join: .round, dash: [2.2, 2.8])
            ctx.paint("M\(tail) 57 Q\(tail + 7 * dir) 68 \(tail + 3 * dir) 80", stroke: CeramicArt.rope, width: 3, cap: .round)
            ctx.paint("M\(tail + 3 * dir) 79 l-3.5 9 h7 Z", fill: Color(RGB(hex: "#EBC6D0")!), stroke: Color(RGB(hex: "#B88E9A")!), width: 0.9)
            let line = "M\(load) 27 V84"
            ctx.paint(line, stroke: CeramicArt.rope, width: 3.4, cap: .round)
            ctx.paint(line, stroke: CeramicArt.ropeLight, width: 3.4, dash: [2.2, 2.8])
            let bridle = "M\(load) 92 L40 112 M\(load) 92 L\(w - 40) 112"
            ctx.paint(bridle, stroke: CeramicArt.rope, width: 2.6, cap: .round)
            ctx.paint(bridle, stroke: CeramicArt.ropeLight, width: 2.6, dash: [2, 2.6])
            ctx.paint(CeramicArt.circle(load, 88, 4), stroke: .white, width: 2.4)
            ctx.paint(CeramicArt.circle(load, 88, 4), stroke: Color(RGB(hex: "#A99DA6")!), width: 0.6)
            // The shiny, elegant white pulley.
            ctx.paint(CeramicArt.circle(mid, 26, 13), fill: Color(RGB(hex: "#F9F8FA")!), stroke: Color(RGB(hex: "#A99DA6")!), width: 1.2)
            ctx.paint(CeramicArt.circle(mid, 26, 9.5), fill: .white, stroke: Color(RGB(hex: "#DCD5DA")!), width: 1.6)
            ctx.paint("M\(mid) 17.5v17M\(mid - 8.5) 26h17M\(mid - 6) 20l12 12M\(mid + 6) 20l-12 12", stroke: Color(RGB(hex: "#CFC6CC")!), width: 1.3, cap: .round)
            ctx.paint(CeramicArt.circle(mid, 26, 3), fill: Color(RGB(hex: "#EBD9A6")!), stroke: Color(RGB(hex: "#B89F62")!), width: 0.8)
            ctx.paint("M\(mid - 9.5) 19.5a11.5 11.5 0 0 1 10-5.5", stroke: .white, width: 2.4, cap: .round)
            ctx.paint(CeramicArt.circle(mid - 6.4, 18.6, 1.3), fill: .white)
            // The clouds the figures stand on.
            func feet(_ x: Double) {
                ctx.paint("M\(x) 106h50a8 8 0 0 0-2-15.5 12 12 0 0 0-22-3 9 9 0 0 0-16 5A7.5 7.5 0 0 0 \(x) 106Z", fill: CeramicArt.cloud, stroke: CeramicArt.cloudLine, width: 1.1)
            }
            feet(left ? 2 : w - 54)
            if pointer { feet(left ? w - 54 : 2) }
        }
        .frame(width: width, height: 116)
    }
}

private struct DriftCloud: View {
    var body: some View {
        Canvas { ctx, _ in
            ctx.paint("M16 44h96a14 14 0 0 0-3-27.5A21 21 0 0 0 72 9a17 17 0 0 0-30 7A13.5 13.5 0 0 0 16 44Z", fill: CeramicArt.cloud, stroke: CeramicArt.cloudLine, width: 1.2)
            ctx.paint("M44 30q6-6 13 0M78 26q5-5 11 0", stroke: Color(RGB(hex: "#DED3DC")!), width: 1)
        }
        .frame(width: 130, height: 50)
    }
}

// MARK: - Comments on ceramic placards

/// A placard flopping down on its ties, like ceramic plaques tied together.
private struct Flop: ViewModifier {
    let index: Int
    @State private var down = false
    @Environment(\.accessibilityReduceMotion) private var still

    func body(content: Content) -> some View {
        content
            .rotation3DEffect(.degrees(down || still ? 0 : -100), axis: (x: 1, y: 0, z: 0), anchor: .top, perspective: 0.6)
            .opacity(down || still ? 1 : 0)
            .onAppear {
                guard !still else { return }
                withAnimation(.spring(response: 0.6, dampingFraction: 0.55).delay(Double(index) * 0.14)) { down = true }
            }
    }
}

/// The two short ropes a placard hangs from.
private struct Ties: View {
    let inset: Double
    var height: Double = 12

    var body: some View {
        HStack {
            Capsule().fill(CeramicArt.rope).frame(width: 3, height: height)
            Spacer()
            Capsule().fill(CeramicArt.rope).frame(width: 3, height: height)
        }
        .padding(.horizontal, inset)
        .accessibilityHidden(true)
    }
}

private struct Etch: View {
    var radius: Double = 7
    var body: some View {
        RoundedRectangle(cornerRadius: radius).stroke(CeramicArt.etch.opacity(0.28), lineWidth: 1).padding(4).allowsHitTesting(false).accessibilityHidden(true)
    }
}

private func initials(_ name: String) -> String {
    name.split(separator: " ").prefix(2).compactMap { $0.first.map { String($0).uppercased() } }.joined()
}

private struct Oval: View {
    let name: String
    var body: some View {
        Text(initials(name)).ceramicFont(.footnote, weight: .semibold, serif: true).foregroundStyle(CeramicArt.ink)
            .frame(minWidth: 24, minHeight: 28).background(Color(RGB(hex: "#E5D9E3")!), in: .ellipse)
            .accessibilityHidden(true)
    }
}

private struct Placards: View {
    let card: Card
    let top: [Beanstalk.Note]
    let kids: [String: [Beanstalk.Note]]
    let total: Int
    let words: Words
    let hooks: FeedHooks
    @State private var open = false
    @Environment(\.dynamicTypeSize) private var size

    var body: some View {
        if open {
            let shown = Array(top.prefix(Ceramic.opened))
            VStack(spacing: 0) {
                ForEach(Array(shown.enumerated()), id: \.element.id) { i, note in
                    CommentPlacard(note: note, replies: Ceramic.replies(to: note.id, in: kids), words: words, reply: hooks.open.map { o in { o(card) } }) {
                        withAnimation(.easeInOut(duration: 0.3)) { open = false }
                    }
                    .modifier(Flop(index: i))
                }
                if total > shown.count, let more = hooks.open {
                    VStack(spacing: 0) {
                        Ties(inset: 34)
                        Button { more(card) } label: {
                            Text(words("ceramic.more", ["n": "\(total - shown.count)"])).ceramicFont(.subheadline).foregroundStyle(CeramicArt.ink)
                                .frame(maxWidth: .infinity, minHeight: 44).padding(.horizontal, 12)
                                .background(CeramicArt.placard, in: .rect(cornerRadius: 10)).overlay { Etch() }
                        }
                        .buttonStyle(.plain)
                    }
                    .modifier(Flop(index: shown.count))
                }
            }
        } else if let first = top.first {
            // Closed: only the first comment's first line, the stack behind it hidden.
            VStack(spacing: 0) {
                Ties(inset: 34)
                Button { withAnimation { open = true } } label: {
                    HStack(spacing: 8) {
                        Oval(name: first.author)
                        (Text(first.author).fontWeight(.medium) + Text(" · " + first.body))
                            .ceramicFont(.subheadline).foregroundStyle(CeramicArt.ink)
                            .lineLimit(size.isAccessibilitySize ? nil : 1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if total > 1 { Text("+\(total - 1)").ceramicFont(.footnote).foregroundStyle(CeramicArt.softInk) }
                    }
                    .padding(.vertical, 10).padding(.horizontal, 12).frame(minHeight: 44)
                    .background(CeramicArt.placard, in: .rect(cornerRadius: 10))
                    .overlay { Etch() }
                    .shadow(color: CeramicArt.shade.opacity(0.22), radius: 3, y: 3)
                }
                .buttonStyle(.plain)
                .background(alignment: .bottom) {
                    // The placards stacked behind it.
                    ZStack {
                        if total > 2 { RoundedRectangle(cornerRadius: 10).fill(Color(RGB(hex: "#E3D7D4")!)).padding(.horizontal, 12).offset(y: 12) }
                        if total > 1 { RoundedRectangle(cornerRadius: 10).fill(Color(RGB(hex: "#EDE3E0")!)).padding(.horizontal, 6).offset(y: 6) }
                    }
                    .accessibilityHidden(true)
                }
                .accessibilityLabel(words("ceramic.showComments", count: total))
                .accessibilityValue("\(first.author): \(first.body)")
            }
            .padding(.bottom, 14)
        }
    }
}

private struct CommentPlacard: View {
    let note: Beanstalk.Note
    let replies: [Beanstalk.Note]
    let words: Words
    let reply: (() -> Void)?
    let fold: () -> Void
    @State private var open = false
    @Environment(\.dynamicTypeSize) private var size

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Ties(inset: 34)
            VStack(alignment: .leading, spacing: 6) {
                // Tapping a comment again folds the comments back up.
                Button(action: fold) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            Oval(name: note.author)
                            Text(note.author).ceramicFont(.headline, weight: .semibold, serif: true).foregroundStyle(CeramicArt.ink)
                        }
                        Text(note.body).ceramicFont(.subheadline).foregroundStyle(CeramicArt.ink).fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityHint(words("ceramic.foldComments"))
                if let reply {
                    Button(action: reply) {
                        Text(words("post.reply")).ceramicFont(.footnote).foregroundStyle(CeramicArt.ink)
                            .padding(.horizontal, 12).frame(minHeight: 32).background(CeramicArt.button, in: .capsule)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 10).padding(.horizontal, 12)
            .background(CeramicArt.placard, in: .rect(cornerRadius: 10))
            .overlay { Etch() }
            .shadow(color: CeramicArt.shade.opacity(0.22), radius: 3, y: 3)
            if let first = replies.first, !open {
                // The first reply hangs exposed under the comment, with how many more there are.
                VStack(spacing: 0) {
                    Ties(inset: 26, height: 10)
                    Button { withAnimation { open = true } } label: {
                        HStack(spacing: 6) {
                            (Text(first.author).fontWeight(.semibold) + Text(" · " + first.body))
                                .ceramicFont(.footnote).foregroundStyle(CeramicArt.ink)
                                .lineLimit(size.isAccessibilitySize ? nil : 1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if replies.count > 1 { Text("+\(replies.count - 1)").ceramicFont(.footnote).foregroundStyle(CeramicArt.softInk) }
                        }
                        .padding(.vertical, 9).padding(.horizontal, 11).frame(minHeight: 44)
                        .background(CeramicArt.replyPlacard, in: .rect(cornerRadius: 9))
                        .overlay { Etch(radius: 6) }
                        .shadow(color: CeramicArt.shade.opacity(0.2), radius: 2.5, y: 3)
                    }
                    .buttonStyle(.plain)
                    .background(alignment: .bottom) {
                        if replies.count > 1 { RoundedRectangle(cornerRadius: 9).fill(Color(RGB(hex: "#D9CFE6")!)).padding(.horizontal, 7).offset(y: 6).accessibilityHidden(true) }
                    }
                    .accessibilityLabel("\(first.author): \(first.body)")
                    .accessibilityHint(words("ceramic.showReplies", count: replies.count))
                }
                .padding(.leading, 22).padding(.bottom, replies.count > 1 ? 6 : 0)
            }
            if open {
                VStack(spacing: 0) {
                    ForEach(Array(replies.enumerated()), id: \.element.id) { i, r in
                        VStack(spacing: 0) {
                            Ties(inset: 26, height: 10)
                            // Tapping a reply folds the replies back up. Replies never get a Reply
                            // button (Steve, 2026-11-01: overnesting is hard to follow).
                            Button { withAnimation(.easeInOut(duration: 0.3)) { open = false } } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(r.author).ceramicFont(.subheadline, weight: .semibold, serif: true).foregroundStyle(CeramicArt.ink)
                                    Text(r.body).ceramicFont(.footnote).foregroundStyle(CeramicArt.ink).fixedSize(horizontal: false, vertical: true)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, 9).padding(.horizontal, 11)
                                .background(CeramicArt.replyPlacard, in: .rect(cornerRadius: 9))
                                .overlay { Etch(radius: 6) }
                                .shadow(color: CeramicArt.shade.opacity(0.2), radius: 2.5, y: 3)
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint(words("ceramic.foldReplies"))
                        }
                        .modifier(Flop(index: i))
                    }
                }
                .padding(.leading, 22)
            }
        }
    }
}

// MARK: - Figurines

/// One statuette, drawn from the design's "Figurine" component on its 60 x 100 grid and
/// always scaled evenly. `present`: the host turns a little and lifts its hand to present the
/// post beside it, like a game-show host showing a prize.
struct FigurineView: View {
    enum Pose { case sit, stand, host, pull }
    let look: Ceramic.Look
    let pose: Pose
    var present = false
    var flip = false
    let width: Double

    private static let dress: [Ceramic.Look: (String, String)] = [
        .angel: ("#D3DFEC", "#95ABC4"), .garden: ("#D3E6D6", "#93B39A"), .shepherd: ("#E6D6B9", "#B9A37A"),
        .choir: ("#DCCFEA", "#A794C2"), .dove: ("#F1D7D3", "#C99F98"),
    ]

    var body: some View {
        Canvas { ctx, _ in
            var c = ctx
            c.scaleBy(x: width / 60, y: width / 60)
            if flip {
                c.translateBy(x: 60, y: 0)
                c.scaleBy(x: -1, y: 1)
            }
            draw(c)
        }
        .frame(width: width, height: width * 100 / 60)
        .accessibilityHidden(true)
    }

    private func hex(_ s: String) -> Color { Color(RGB(hex: s)!) }

    private func draw(_ base: GraphicsContext) {
        let (d0, d1) = Self.dress[look] ?? ("#D3DFEC", "#95ABC4")
        let dress = hex(d0), line = hex(d1)
        let skin = hex("#F7E6D8"), skinLine = hex("#B8957F")
        let stand = pose != .sit
        let pull = pose == .pull
        let host = pose == .host || pull
        let free = !(pull && !present)
        base.paint(Path(roundedRect: CGRect(x: 8, y: 94, width: 44, height: 4.5), cornerRadius: 1.5), fill: hex("#DCCFC4"), stroke: hex("#A89788"), width: 0.7)
        base.paint(CeramicArt.ellipse(30, 94, 22, 3.6), fill: hex("#EFE6DE"), stroke: hex("#A89788"), width: 0.7)
        var ctx = base
        // Turned a few degrees, never narrowed: the figure keeps its true proportions.
        let turn = host && present ? 3.0 : pull ? -6.0 : 0
        ctx.translateBy(x: 30, y: 94)
        ctx.rotate(by: .degrees(turn))
        ctx.translateBy(x: -30, y: -94)
        var head = ctx
        if !stand { head.translateBy(x: 0, y: 12) }
        // Every figure has angel wings (Steve, 2026-10-31).
        head.paint("M23 59C9 50 4 66 12 76c4-4 9-8 13-10Z", fill: hex("#FBF8F3"), stroke: hex("#A8968A"), width: 0.9)
        head.paint("M37 59c14-9 19 7 11 17-4-4-9-8-13-10Z", fill: hex("#FBF8F3"), stroke: hex("#A8968A"), width: 0.9)
        head.paint("M12 66c3 1 6 1 10-1M14 71c2 0 5-1 8-3M48 66c-3 1-6 1-10-1M46 71c-2 0-5-1-8-3", stroke: hex("#C4B5AA"), width: 0.8)
        if stand {
            if free, look == .shepherd { ctx.paint("M19 98V66c0-6 3-8 6-8 3 0 4 2 4 4.5", stroke: hex("#C4A88A"), width: 2.2, cap: .round) }
            ctx.paint(CeramicArt.ellipse(25, 92, 5, 2.8), fill: hex("#B9A0B2"))
            ctx.paint(CeramicArt.ellipse(35, 92, 5, 2.8), fill: hex("#B9A0B2"))
            ctx.paint("M22 54Q30 50 38 54L44 89Q30 93 16 89Z", fill: dress, stroke: line, width: 0.9)
            ctx.paint("M21 78Q30 81 39 78", stroke: line, width: 0.8)
            if free {
                ctx.paint("M23.5 58Q17.5 67 19 76", stroke: dress, width: 6, cap: .round)
                ctx.paint(CeramicArt.circle(19, 77.5, 3), fill: skin, stroke: skinLine, width: 0.7)
            }
            if pose == .stand {
                ctx.paint("M36.5 58Q45.5 56 53 52.5", stroke: dress, width: 6, cap: .round)
                ctx.paint(CeramicArt.circle(54.5, 52, 3), fill: skin, stroke: skinLine, width: 0.7)
                ctx.paint("M56.5 51.2 59.6 50", stroke: hex("#F0D9C8"), width: 2, cap: .round)
            }
            if look == .choir { ctx.paint(CeramicArt.ellipse(30, 52.5, 9, 3), fill: hex("#FFFDF8"), stroke: hex("#B9ACA1"), width: 0.8) }
            if host, pose == .host || present {
                // The presenting arm, raised to the side when its post is centered.
                var arm = ctx
                if present {
                    arm.translateBy(x: 36.5, y: 58)
                    arm.rotate(by: .degrees(-86))
                    arm.translateBy(x: -36.5, y: -58)
                }
                arm.paint("M36.5 58Q41 66 40.5 75", stroke: dress, width: 6, cap: .round)
                arm.paint(CeramicArt.ellipse(40.6, 77.8, 2.3, 3.8), fill: skin, stroke: skinLine, width: 0.7)
                arm.paint("M38.9 81l-1 1.7M40.6 81.5v1.9M42.3 81l1 1.7", stroke: skinLine, width: 0.7, cap: .round)
            }
            if pull, !present {
                // Both hands up on the rope, hauling the prayer toward heaven.
                ctx.paint("M23.5 58Q33 52 42.5 44", stroke: dress, width: 6, cap: .round)
                ctx.paint(CeramicArt.circle(43.5, 43, 3), fill: skin, stroke: skinLine, width: 0.7)
                ctx.paint("M36.5 58Q43 50 48.5 40", stroke: dress, width: 6, cap: .round)
                ctx.paint(CeramicArt.circle(49.5, 38.5, 3), fill: skin, stroke: skinLine, width: 0.7)
            }
            if free, look == .garden { flower(ctx, 18.5, 81.2) }
            if free, look == .dove { dove(ctx, 17, 79) }
            if free, look == .choir {
                ctx.paint(Path(roundedRect: CGRect(x: 13, y: 73, width: 9.5, height: 11), cornerRadius: 1), fill: hex("#CDBDDC"), stroke: hex("#8E78A6"), width: 0.8)
                ctx.paint("M15 76h5.5M15 78.5h5.5", stroke: hex("#F4EEF8"), width: 0.9)
            }
        } else {
            ctx.paint(CeramicArt.ellipse(24, 92, 5, 2.6), fill: hex("#B9A0B2"))
            ctx.paint(CeramicArt.ellipse(36, 92, 5, 2.6), fill: hex("#B9A0B2"))
            ctx.paint("M17 72Q30 60 43 72L47 91Q30 95 13 91Z", fill: dress, stroke: line, width: 0.9)
            ctx.paint("M20 70Q19.5 78 27 79M40 70Q40.5 78 33 79", stroke: dress, width: 6, cap: .round)
            ctx.paint("M27.4 80 30 68.6 32.6 80Z", fill: skin, stroke: skinLine, width: 0.8, join: .round)
            if look == .choir {
                ctx.paint(CeramicArt.ellipse(30, 64.5, 9, 3), fill: hex("#FFFDF8"), stroke: hex("#B9ACA1"), width: 0.8)
                ctx.paint("M21 72.5 30 75l9-2.5V81l-9 2.5L21 81Z", fill: hex("#FFFDF8"), stroke: hex("#9C88B3"), width: 0.9, join: .round)
                ctx.paint("M30 75v8.5M23 75.5l5 1.3M23 78l5 1.3M32 76.8l5-1.3M32 79.3l5-1.3", stroke: hex("#CFC2DD"), width: 0.7)
            }
            if look == .garden {
                ctx.paint("M10 92c0-4 1-7 3-9", stroke: hex("#B9CDB4"), width: 1)
                flower(ctx, 13.5, 82.4)
            }
            if look == .dove { dove(ctx, 48, 87) }
            if look == .shepherd {
                ctx.paint("M45 91v2.5M52 91v2.5", stroke: hex("#A89788"), width: 1.4, cap: .round)
                ctx.paint(CeramicArt.ellipse(49, 87.5, 8.5, 5.2), fill: hex("#FBF8F3"), stroke: hex("#B5A79B"), width: 0.9)
                ctx.paint("M43 86q1.5-2 3 0q1.5-2 3 0q1.5-2 3 0q1.5-2 3 0", stroke: hex("#E6DDD4"), width: 0.8)
                ctx.paint(CeramicArt.circle(55.2, 82.6, 3.6), fill: hex("#EFE3D9"), stroke: hex("#B19F91"), width: 0.8)
                ctx.paint("M55.3 82.6q.8.6 1.6 0", stroke: hex("#8A7478"), width: 0.8, cap: .round)
            }
        }
        // The head.
        head.paint(CeramicArt.circle(30, 34, 17), fill: skin, stroke: skinLine, width: 0.9)
        if pose == .stand || (pull && !present) {
            // Looking toward the post it points at or hauls.
            head.paint(CeramicArt.ellipse(32, 36, 1.6, 2.2), fill: hex("#45363B"))
            head.paint(CeramicArt.ellipse(39.5, 36, 1.6, 2.2), fill: hex("#45363B"))
            head.paint("M34 43q2 1.5 4 0", stroke: hex("#A0716B"), width: 0.8, cap: .round)
        } else if host, present {
            head.paint(CeramicArt.ellipse(33, 35.5, 1.6, 2.2), fill: hex("#45363B"))
            head.paint(CeramicArt.ellipse(40.5, 35.5, 1.6, 2.2), fill: hex("#45363B"))
            head.paint("M33.5 42q2.8 2.4 5.6 0", stroke: hex("#A0716B"), width: 0.9, cap: .round)
        } else {
            // Eyes closed in quiet prayer.
            head.paint("M22.5 36q2.5 2.2 5 0M32.5 36q2.5 2.2 5 0", stroke: hex("#45363B"), width: 1.1, cap: .round)
            head.paint("M28.2 42q1.8 1.3 3.6 0", stroke: hex("#A0716B"), width: 0.8, cap: .round)
        }
        head.paint(CeramicArt.circle(22, 40.5, 2.6), fill: hex("#F2B4AA"), opacity: 0.55)
        head.paint(CeramicArt.circle(40, 40.5, 2.6), fill: hex("#F2B4AA"), opacity: 0.55)
        switch look {
        case .angel:
            head.paint("M13 33Q12 16 30 16Q48 16 47 33Q44 25 37 24Q34 27 30 24Q26 27 23 24Q16 25 13 33Z", fill: hex("#EFDCAE"), stroke: hex("#C2A66A"), width: 0.8)
            head.paint(CeramicArt.ellipse(30, 11, 11, 2.8), stroke: hex("#C9A75E"), width: 1.8)
        case .garden:
            head.paint("M14 37Q12 23 20 20H40Q48 23 46 37Q44 31 42 29H18Q16 31 14 37Z", fill: hex("#C9A48C"))
            head.paint("M16 25Q17 11 30 11Q43 11 44 25Z", fill: hex("#F4D9D3"), stroke: hex("#BF9A91"), width: 0.8)
            head.paint(CeramicArt.ellipse(30, 25, 21, 5), fill: hex("#F4D9D3"), stroke: hex("#BF9A91"), width: 0.8)
            head.paint("M16.5 21.5Q30 18.5 43.5 21.5", stroke: hex("#E9B9C4"), width: 2)
        case .shepherd:
            head.paint("M12 36Q12 14 30 14Q48 14 48 36L46 48Q44 30 30 27Q16 30 14 48Z", fill: hex("#EFE6CB"), stroke: hex("#B8A678"), width: 0.8)
            head.paint("M14 28Q30 22 46 28", stroke: hex("#C9B184"), width: 2)
        case .dove:
            head.paint(CeramicArt.circle(12, 31, 4.6), fill: hex("#A8826C"), stroke: hex("#8A6753"), width: 0.8)
            head.paint(CeramicArt.circle(48, 31, 4.6), fill: hex("#A8826C"), stroke: hex("#8A6753"), width: 0.8)
            head.paint("M13 33Q12 16 30 16Q48 16 47 33Q45 25 38 23Q30 27 22 23Q15 25 13 33Z", fill: hex("#A8826C"), stroke: hex("#8A6753"), width: 0.8)
            head.paint("M14.5 27.5l-3.5-2.5M45.5 27.5l3.5-2.5", stroke: hex("#E9B9C4"), width: 1.6, cap: .round)
        case .choir:
            head.paint("M13 34Q12 16 30 16Q48 16 47 34Q46 26 41 24Q36 28 30 25Q24 28 19 24Q14 26 13 34Z", fill: hex("#C9A48C"), stroke: hex("#97735D"), width: 0.8)
        }
    }

    private func flower(_ ctx: GraphicsContext, _ x: Double, _ y: Double) {
        for (dx, dy) in [(-1.9, -0.6), (1.9, -0.4), (-0.1, -2.6), (-1.1, 1.8), (1.3, 1.8)] {
            ctx.paint(CeramicArt.circle(x + dx, y + dy, 2), fill: hex("#F2C4CF"))
        }
        ctx.paint(CeramicArt.circle(x, y, 1.3), fill: hex("#EFD79A"))
    }

    private func dove(_ base: GraphicsContext, _ x: Double, _ y: Double) {
        var ctx = base
        ctx.translateBy(x: x, y: y)
        let line = hex("#9E8E97")
        ctx.paint("M-6 1 L-10 -1 L-9 3Z", fill: .white, stroke: line, width: 0.8, join: .round)
        ctx.paint(CeramicArt.ellipse(0, 1, 6, 3.4), fill: .white, stroke: line, width: 0.8)
        ctx.paint(CeramicArt.circle(5, -2.2, 2.4), fill: .white, stroke: line, width: 0.8)
        ctx.paint("M-3 0 Q0 -5 4 -1", stroke: line, width: 0.8)
        ctx.paint("M7.2 -2.4 L9 -1.8 L7.2 -1.2Z", fill: hex("#E7C78F"))
        ctx.paint(CeramicArt.circle(5.6, -2.6, 0.5), fill: hex("#45363B"))
    }
}

/// Now and then, as the center moves on, an angel flies from the old post to the new one.
private struct FlyingAngel: View {
    let trip: CeramicTrip
    let look: Ceramic.Look
    let size: CGSize
    @State private var there = false

    var body: some View {
        let x0 = trip.left ? 8.0 : Double(size.width) - 48
        let from = trip.down ? 90.0 : Double(size.height) - 40
        FigurineView(look: look, pose: .host, present: true, flip: !trip.left, width: 40)
            .offset(x: there ? x0 + (trip.left ? 6 : -6) : x0, y: there ? Double(size.height) / 2 : from)
            .opacity(there ? 1 : 0.2)
            .onAppear { withAnimation(.easeInOut(duration: 3.2)) { there = true } }
    }
}

/// The ceramic turtle, walking slowly across behind the cards.
private struct CeramicTurtle: View {
    let width: Double

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30)) { tl in
            // 46 seconds a lap: 25 walking across, then a rest out of sight.
            let t = tl.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 46)
            let x = t < 25 ? -80 + (width + 90) * t / 25 : width + 10
            Canvas { ctx, _ in
                ctx.paint(CeramicArt.ellipse(31, 33, 25, 2.4), fill: Color(RGB(hex: "#5A4652")!), opacity: 0.15)
                let shell = Color(RGB(hex: "#CFE0D2")!), edge = Color(RGB(hex: "#7F9F88")!)
                ctx.paint(CeramicArt.ellipse(18, 28, 4, 5), fill: shell, stroke: edge, width: 0.9)
                ctx.paint(CeramicArt.ellipse(44, 28, 4, 5), fill: shell, stroke: edge, width: 0.9)
                ctx.paint("M8 23.5 3 26.5 9 26.5Z", fill: shell, stroke: edge, width: 0.9, join: .round)
                ctx.paint(CeramicArt.circle(56, 19, 6.2), fill: Color(RGB(hex: "#D6E5D8")!), stroke: edge, width: 0.9)
                ctx.paint(CeramicArt.ellipse(58.2, 17.4, 0.9, 1.2), fill: Color(RGB(hex: "#45363B")!))
                ctx.paint("M57 21.6q1.5 1 3 0", stroke: Color(RGB(hex: "#7F6A6E")!), width: 0.7, cap: .round)
                ctx.paint("M9 25Q11 5 31 4.5Q51 5 53 25Z", fill: Color(RGB(hex: "#CBE0D0")!), stroke: edge, width: 1)
                ctx.paint("M25 11h12l4 7-4 7H25l-4-7Z", stroke: Color(RGB(hex: "#93B39C")!), width: 0.9, join: .round)
                ctx.paint("M25 11 19 9M37 11l6-2M41 18h10M21 18H11M25 25l-3 0M37 25h3", stroke: Color(RGB(hex: "#93B39C")!), width: 0.9, cap: .round)
                ctx.paint("M8 25.5H54", stroke: Color(RGB(hex: "#ECDFC8")!), width: 3.2, cap: .round)
            }
            .frame(width: 64, height: 36)
            .offset(x: x)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .allowsHitTesting(false)
    }
}

/// Members pick their own style of figurines (five looks, or all five mixed).
private struct FigurinePicker: View {
    @Binding var choice: String
    let words: Words
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 10) {
            Text(words("ceramic.pickTitle")).ceramicFont(.title2, weight: .semibold, serif: true).foregroundStyle(CeramicArt.ink)
                .accessibilityAddTraits(.isHeader)
            Text(words("ceramic.pickSub")).ceramicFont(.subheadline).foregroundStyle(CeramicArt.softInk)
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 10)], spacing: 10) {
                    ForEach(Ceramic.choices, id: \.self) { c in
                        Button { choice = c } label: {
                            VStack(spacing: 4) {
                                FigurineView(look: c == "mix" ? .dove : Ceramic.look(c, 0), pose: .sit, width: 54)
                                Text(words("ceramic.looks.\(c)")).ceramicFont(.footnote).foregroundStyle(CeramicArt.ink).multilineTextAlignment(.center)
                            }
                            .frame(maxWidth: .infinity).padding(.vertical, 8).padding(.horizontal, 4)
                            .background(Color(RGB(hex: "#EFE5E3")!), in: .rect(cornerRadius: 16))
                            .overlay { RoundedRectangle(cornerRadius: 16).stroke(c == choice ? Color(RGB(hex: "#8E7088")!) : .clear, lineWidth: 2) }
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(c == choice ? .isSelected : [])
                    }
                }
            }
            Button { dismiss() } label: {
                Text(words("common.close")).ceramicFont(.headline).foregroundStyle(.white).frame(maxWidth: .infinity, minHeight: 48)
                    .background(Color(RGB(hex: "#8E7088")!), in: .capsule)
            }
            .buttonStyle(.plain)
        }
        .padding(18)
        .background(Color(RGB(hex: "#F6F0EE")!))
        .environment(\.colorScheme, .light)
        .presentationDetents([.medium, .large])
    }
}

import CoreText
import PrayerTowerKit
import SwiftUI

// The Beanstalk (Steve, 2026-10-30), ported from his Claude Design file "Beanstalk feed"
// (Main.dc.html), the same as the Expo app (apps/mobile/src/layouts/beanstalk.tsx). Each post sits
// in a frame wound with two twisting vine strands, mirrored left and right, that draw themselves
// from the bottom middle up both sides to a flower at the top, with leaves and tendrils along them.
// Below each post a two-strand stalk grows down to the next post, and the post's comments hang off
// it on big tilted leaves, three at a time, left and right by turns; ‹ 1–3 of N › swaps in the next
// three. A leaf with replies sprouts them as smaller leaves (three levels); a leaf whose words are
// cut off opens as one big leaf with the whole comment and its replies. Each post grows in (the card
// springs up, the vine draws, the leaves unfurl) whenever it scrolls into view, and resets when it
// leaves. Steve's additions: the poster in an oval locket over the frame's top left corner, fruit
// over the top right once someone has gifted the poster tokens, and each post a little left or right
// of the centre line (never more than 15%). The geometry is BeanDraw in PrayerTowerKit.

private enum Bean {
    static let page = Color(RGB(hex: "#EFE4C6")!)
    static let cream = Color(RGB(hex: "#FFF7E2")!)
    static let ink = Color(RGB(hex: "#2A2118")!)
    static let vineInk = Color(RGB(hex: "#23301D")!)
    static let strand = Color(RGB(hex: "#4F8A35")!)
    static let strandLight = Color(RGB(hex: "#9CC862")!)
    static let tendril = Color(RGB(hex: "#3F6B2F")!)
    static let vineLeaf = Color(RGB(hex: "#7FB352")!)
    static let vineLeafLight = Color(RGB(hex: "#A9CF6A")!)
    static let petal = Color(RGB(hex: "#F3CF6B")!)
    static let heart = Color(RGB(hex: "#B23A22")!)
    static let stem = Color(RGB(hex: "#5E9440")!)
    static let leaves = [Color(RGB(hex: "#B6D77A")!), Color(RGB(hex: "#D7EBB0")!), Color(RGB(hex: "#9CC862")!)]
    /// The leaf veins: the stalk's green made 10% lighter (Steve, 2026-10-30).
    static let vein = Color(RGB(hex: "#6E9F53")!)
    static let button = Color(RGB(hex: "#D7EBB0")!)
    static let sub = Color(RGB(hex: "#5C4A33")!)
    // A little darker than the design's #2F4F86, for 4.5:1 on the darkest leaf (WCAG AA).
    static let link = Color(RGB(hex: "#23407F")!)
    static let text = Color(RGB.commentText)
    static let locket = Color(RGB(hex: "#C9A227")!)
    /// Apple's accessibility audit (debug samples only) checks the feed at rest, drawn whole as with
    /// Reduce Motion: it changes the text size as it measures, and posts growing in again then read as clipped.
    static let audit: Bool = {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains("-PTAuditSamples")
        #else
        return false
        #endif
    }()
    static let locketFace = Color(RGB(hex: "#F2B9A0")!)
    static let space = "beanstalk"
}

/// The design's fonts, bundled in App/Fonts (SIL Open Font License): Alegreya for words, Henny Penny for the title.
private enum BeanFont {
    static let ready: Bool = {
        for name in ["Alegreya_400Regular", "Alegreya_400Regular_Italic", "Alegreya_600SemiBold", "Alegreya_700Bold", "Alegreya_700Bold_Italic", "HennyPenny_400Regular"] {
            if let url = Bundle.main.url(forResource: name, withExtension: "ttf") { CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil) }
        }
        return true
    }()
    static func body(_ size: Double) -> Font { .custom("Alegreya-Regular", size: size) }
    static func semi(_ size: Double) -> Font { .custom("Alegreya-SemiBold", size: size) }
    static func bold(_ size: Double) -> Font { .custom("Alegreya-Bold", size: size) }
    /// A size that doesn't grow with the text setting, for a letter drawn inside a fixed shape.
    static func boldFixed(_ size: Double) -> Font { .custom("Alegreya-Bold", fixedSize: size) }
    static func boldItalic(_ size: Double) -> Font { .custom("Alegreya-BoldItalic", size: size) }
    static func title(_ size: Double) -> Font { .custom("HennyPenny-Regular", size: size) }
}

/// A CSS cubic-bezier easing.
private struct Ease {
    let x1: Double, y1: Double, x2: Double, y2: Double
    static let linear = Ease(x1: 0, y1: 0, x2: 1, y2: 1)
    static let easeIn = Ease(x1: 0.42, y1: 0, x2: 1, y2: 1)
    static let vine = Ease(x1: 0.4, y1: 0.15, x2: 0.45, y2: 1)
    static let card = Ease(x1: 0.2, y1: 1.25, x2: 0.35, y2: 1)
    static let pop = Ease(x1: 0.3, y1: 1.7, x2: 0.5, y2: 1)
    static let unfurl = Ease(x1: 0.3, y1: 1.5, x2: 0.5, y2: 1)

    private func bez(_ a: Double, _ b: Double, _ s: Double) -> Double {
        let u: Double = 1 - s
        let first: Double = 3 * u * u * s * a
        let second: Double = 3 * u * s * s * b
        return first + second + s * s * s
    }

    func callAsFunction(_ t: Double) -> Double {
        if t <= 0 { return 0 }
        if t >= 1 { return 1 }
        var lo = 0.0, hi = 1.0, s = t
        for _ in 0..<24 {
            s = (lo + hi) / 2
            if bez(x1, x2, s) < t { lo = s } else { hi = s }
        }
        return bez(y1, y2, s)
    }
}

/// A post's growing clock, in milliseconds since it scrolled into view; every piece reads its own stretch of it.
private struct Clock {
    let ms: Double
    func span(_ at: Double, _ dur: Double, _ from: Double, _ to: Double, _ e: Ease = .linear) -> Double {
        let t: Double = min(1, max(0, (ms - at) / dur))
        return from + (to - from) * e(t)
    }
}

private func path(_ d: BeanDraw.Drawing) -> Path {
    var p = Path()
    for s in d {
        switch s {
        case let .move(x, y): p.move(to: CGPoint(x: x, y: y))
        case let .line(x, y): p.addLine(to: CGPoint(x: x, y: y))
        case let .curve(a, b, c, e, x, y): p.addCurve(to: CGPoint(x: x, y: y), control1: CGPoint(x: a, y: b), control2: CGPoint(x: c, y: e))
        case .close: p.closeSubpath()
        case let .circle(x, y, r): p.addEllipse(in: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r))
        }
    }
    return p
}

struct BeanstalkFeed<Row: View>: View {
    let look: VineLook
    let cards: [Card]
    let wording: Wording
    let hooks: FeedHooks
    @ViewBuilder let row: (Card) -> Row
    @Environment(\.dynamicTypeSize) private var type

    var body: some View {
        let words = Words(wording)
        let _ = BeanFont.ready
        // Enlarged text (Steve, 2026-10-31): the posts take the lane's whole width, less room for
        // the locket and the frame's vine, and stop swaying aside, so the words get the space.
        let big: Bool = type > .large
        ScrollViewReader { proxy in
            VStack(spacing: 0) {
                // At the accessibility text sizes the banner would fill the screen, so it scrolls away
                // with the feed instead of staying fixed above it.
                if !type.isAccessibilitySize {
                    banner(words) { withAnimation { proxy.scrollTo("beanstalk-top", anchor: .top) } }
                }
                GeometryReader { geo in
                    let lane: Double = min(Double(geo.size.width), 760)
                    let width: Double = big ? max(BeanDraw.frameWidth(lane), lane - 72) : BeanDraw.frameWidth(lane)
                    let shifts: [Double] = cards.enumerated().map { big ? 0 : BeanDraw.postShift(id: $1.id, index: $0, lane: lane) }
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            if type.isAccessibilitySize { banner(words, stacked: true) {}.id("beanstalk-banner") }
                            Color.clear.frame(height: 76).id("beanstalk-top")
                            ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                                BeanPost(card: card, index: i, width: width, shift: shifts[i], next: i + 1 < shifts.count ? shifts[i + 1] : shifts[i], margin: (lane - width) / 2,
                                         viewport: Double(geo.size.height), words: words, row: row, load: hooks.loadComments)
                                    .loadsMore(after: card, in: cards, hooks)
                            }
                            ground(words)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    // Posts measure themselves against the visible part of the feed as it scrolls.
                    .coordinateSpace(name: Bean.space)
                }
            }
        }
        .background(Bean.page)
        .environment(\.colorScheme, .light)
    }

    /// Stacked: the title on its own lines and the button under it, so words wrap whole, never mid-word.
    private func banner(_ words: Words, stacked: Bool = false, climb: @escaping () -> Void) -> some View {
        let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
        return layout {
            Canvas { ctx, _ in
                var s = Path()
                s.move(to: CGPoint(x: 17, y: 32)); s.addCurve(to: CGPoint(x: 12, y: 8), control1: CGPoint(x: 17, y: 22), control2: CGPoint(x: 10, y: 18))
                s.addCurve(to: CGPoint(x: 20, y: 9), control1: CGPoint(x: 13, y: 3), control2: CGPoint(x: 20, y: 3))
                s.addCurve(to: CGPoint(x: 16, y: 9), control1: CGPoint(x: 20, y: 13), control2: CGPoint(x: 15, y: 13))
                ctx.stroke(s, with: .color(Bean.tendril), style: .init(lineWidth: 3, lineCap: .round))
                var l = Path()
                l.move(to: CGPoint(x: 17, y: 22)); l.addCurve(to: CGPoint(x: 31, y: 20), control1: CGPoint(x: 22, y: 16), control2: CGPoint(x: 30, y: 16))
                l.addCurve(to: CGPoint(x: 17, y: 22), control1: CGPoint(x: 26, y: 24), control2: CGPoint(x: 21, y: 24)); l.closeSubpath()
                ctx.fill(l, with: .color(Color(RGB(hex: "#8DBA5C")!)))
                ctx.stroke(l, with: .color(Bean.ink), lineWidth: 2)
            }
            .frame(width: 34, height: 34)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                // Wraps instead of clipping at the largest text sizes.
                Text(words("beanstalk.title")).font(BeanFont.title(23)).foregroundStyle(Bean.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text(words("beanstalk.subtitle")).font(BeanFont.body(13)).foregroundStyle(Bean.sub)
                    .fixedSize(horizontal: false, vertical: true)
            }
            // Stacked, the banner scrolls with the feed, so it has no climb-back button.
            if !stacked {
                Spacer()
                Button(action: climb) {
                    Text(words("beanstalk.climb")).font(BeanFont.semi(14)).foregroundStyle(Bean.ink)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Bean.button, in: .capsule)
                        .overlay(Capsule().stroke(Bean.ink, lineWidth: 2))
                }
                .buttonStyle(.plain)
                .accessibilityHint(words("beanstalk.climbHint"))
            }
        }
        // Clear of the Home button at the top left: beside it, or stacked, below it with the whole width.
        .padding(.leading, stacked ? 16 : 60)
        .padding(.trailing, 16)
        .padding(.top, stacked ? 64 : 10)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Bean.cream)
        .overlay(alignment: .bottom) { Rectangle().fill(Bean.ink).frame(height: 3) }
        .background(alignment: .bottom) { Rectangle().fill(Bean.ink).frame(height: 4).offset(y: 4) }
        .zIndex(1)
    }

    private func ground(_ words: Words) -> some View {
        VStack(spacing: 4) {
            GeometryReader { g in
                let w: Double = Double(g.size.width)
                ZStack {
                    Color(RGB(hex: "#A9D3E8")!)
                    Ellipse().fill(Color(RGB(hex: "#7BA05B")!)).overlay(Ellipse().stroke(Bean.ink, lineWidth: 3))
                        .frame(width: w * 0.9, height: 210).position(x: w * 0.25, y: 157)
                    Ellipse().fill(Color(RGB(hex: "#4F7A3A")!)).overlay(Ellipse().stroke(Bean.ink, lineWidth: 3))
                        .frame(width: w * 0.9, height: 210).position(x: w * 0.8, y: 171)
                    Rectangle().fill(Bean.stem).overlay(Rectangle().stroke(Bean.ink, lineWidth: 2.5))
                        .frame(width: 14, height: 128).position(x: w / 2, y: 64)
                    Rectangle().fill(Color(RGB(hex: "#8A5A2E")!)).overlay(alignment: .top) { Rectangle().fill(Bean.ink).frame(height: 3) }
                        .frame(width: w, height: 26).position(x: w / 2, y: 137)
                }
            }
            .frame(height: 150)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Bean.ink, lineWidth: 3))
            .background(RoundedRectangle(cornerRadius: 18).fill(Bean.ink).offset(x: 6, y: 7))
            .accessibilityHidden(true)
            Text(words("beanstalk.ground")).font(BeanFont.title(24)).foregroundStyle(Bean.ink).padding(.top, 20)
            Text(wording == .neutral ? words("vine.tip") : words("beanstalk.groundSub")).font(BeanFont.body(16)).foregroundStyle(Bean.sub)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: 560)
        .padding(.horizontal, 18)
        .padding(.bottom, 60)
    }
}

/// One post: its vine-wound card, then the stalk down to the next post with its comments on leaves.
private struct BeanPost<Row: View>: View {
    let card: Card
    let index: Int
    let width: Double
    /// Where this post sits, and where the next one does, off the centre line.
    let shift: Double
    let next: Double
    /// The lane's space on each side of the frame, before the post's own shift.
    let margin: Double
    let viewport: Double
    let words: Words
    let row: (Card) -> Row
    let load: ((Card) async -> [Comment])?
    @State private var grownAt: Date?
    @State private var pageAt: Date?
    @State private var openAt: Date?
    @State private var settled = 0
    @State private var all: [Beanstalk.Note]?
    @State private var cv = BeanDraw.LeafState()
    @State private var geo: BeanDraw.FrameVine?
    @State private var reading: Beanstalk.Note?
    /// Where on screen the card's poster name ends, so a comment's close-up opens below it.
    @State private var nameBottom: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var still: Bool { reduceMotion || Bean.audit }

    var body: some View {
        let notes: [Beanstalk.Note] = all ?? (card.leafComments ?? []).map(Beanstalk.Note.init)
        let tree = Beanstalk.tree(notes)
        let total: Int = all != nil ? tree.top.count : max(tree.top.count, card.counts.comments)
        let hang = BeanDraw.hanging(w: width, top: tree.top, kids: tree.kids, cv: cv, seed: index, bend: next - shift, room: (margin + shift, margin - shift))
        let live: Bool = !still && isLive(Date())
        let vp: Double = viewport
        TimelineView(.animation(paused: !live)) { tl in
            VStack(spacing: 0) {
                framed(clock(grownAt, tl.date, full: 2000))
                hanging(hang, tree: (tree.top, tree.kids), total: total, c: clock(grownAt, tl.date, full: 2000), page: clock(pageAt, tl.date, full: 700), open: clock(openAt, tl.date, full: 450))
            }
        }
        .frame(width: width)
        .overlay(alignment: .top) { if index == 0 { Lead().offset(y: -60) } }
        .offset(x: shift)
        .frame(maxWidth: .infinity)
        // The design's IntersectionObserver: grown once 8% is on screen, reset once wholly off, so it grows again.
        .onGeometryChange(for: Int.self) { g in
            let f = g.frame(in: .named(Bean.space))
            let top: Double = Double(f.minY), end: Double = Double(f.maxY), tall: Double = Double(f.height)
            let bottom: Double = vp * 0.96
            let seen: Double = min(end, bottom) - max(top, 0)
            if tall > 0 && (seen >= tall * 0.08 || seen >= 0.08 * bottom) { return 1 }
            // Reset only once well past the edge: a post that a text-size change nudges just off
            // screen and back keeps its drawing instead of growing in again mid-read.
            if end <= -vp * 0.5 || top >= vp * 1.5 { return -1 }
            return 0
        } action: { state in
            if state == 1 && grownAt == nil {
                grownAt = .now
                pageAt = nil
                openAt = nil
            }
            if state == -1 { grownAt = nil }
        }
        // Re-renders once each drawing has finished, so the frame clock stops.
        .task(id: [grownAt, pageAt, openAt]) {
            try? await Task.sleep(for: .seconds(2.2))
            settled += 1
        }
        .task(id: grownAt != nil) {
            guard grownAt != nil, all == nil, card.counts.comments > 0, let load else { return }
            all = await load(card).map(Beanstalk.Note.init)
        }
        .fullScreenCover(item: $reading) { note in
            // The tapped comment and every later one on the post; a reply opened alone is read by itself.
            let rest = Array(tree.top.drop { $0.id != note.id })
            BeanReader(thread: rest.isEmpty ? [note] : rest, kids: tree.kids, words: words, top: nameBottom) { reading = nil }
        }
    }

    private func isLive(_ now: Date) -> Bool {
        for start in [grownAt, pageAt, openAt] {
            if let start, now.timeIntervalSince(start) < 2.1 { return true }
        }
        return false
    }

    private func clock(_ start: Date?, _ now: Date, full: Double) -> Clock {
        if still { return Clock(ms: full) }
        guard let start else { return Clock(ms: 0) }
        return Clock(ms: now.timeIntervalSince(start) * 1000)
    }

    private func framed(_ c: Clock) -> some View {
        let sx: Double = c.span(100, 600, 0.72, 1, .card)
        let sy: Double = c.span(100, 600, 0.06, 1, .card)
        let dy: Double = c.span(100, 600, 80, 0, .card)
        let fade: Double = c.span(100, 200, 0, 1)
        let pop: Double = c.span(100, 600, 0.4, 1, .card)
        let fruit: Double = c.span(1300, 450, 0, 1, .pop)
        // At its full height whatever the text size, so wrapped words always have the room they need.
        return row(card)
            .fixedSize(horizontal: false, vertical: true)
            .padding(12)
            // Room at the sides, so the frame's vine as it wiggles never runs over the first or last letters.
            .padding(.horizontal, 10)
            // Room under the locket, so it never sits over the poster's name.
            .padding(.top, 44)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Bean.cream)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Bean.ink, lineWidth: 3))
            .background(RoundedRectangle(cornerRadius: 18).fill(Bean.ink).offset(x: 6, y: 7))
            .onGeometryChange(for: CGSize.self) { $0.size } action: { s in measured(s) }
            // The locket and the poster's name, on screen: the card's top plus room under the locket and the name's line.
            // Rounded, so scrolling only updates it every few points.
            .onGeometryChange(for: Double.self) { (Double($0.frame(in: .global).minY) / 8).rounded() * 8 + 80 } action: { nameBottom = $0 }
            // The card springs up from the stalk: from low, narrow and flat, to whole.
            // Drawn only, never laid out: the words keep their true place and size for the screen
            // reader and Apple's audit while the card grows in.
            .visualEffect { content, _ in
                content.scaleEffect(x: sx, y: sy, anchor: .bottom).offset(y: dy).opacity(fade)
            }
            .overlay {
                if let geo { FrameCanvas(geo: geo, c: c).frame(width: geo.w, height: geo.h).accessibilityHidden(true) }
            }
            .overlay(alignment: .topLeading) {
                Locket(name: card.author.displayName, photo: card.author.photoUrl).scaleEffect(pop).opacity(fade).offset(x: -29, y: -50)
                    // The name beside it already says who posted; the locket is only its picture.
                    .accessibilityHidden(true)
            }
            .overlay(alignment: .topTrailing) {
                if card.gifted == true { VineFruit(label: words("vine.fruit"), size: 44).scaleEffect(fruit).offset(x: 20, y: -24) }
            }
    }

    private func measured(_ s: CGSize) {
        let w: Double = Double(s.width), h: Double = Double(s.height)
        guard w > 20, h > 20 else { return }
        let pad2: Double = 2 * BeanDraw.pad
        if let geo, abs(geo.w - w - pad2) <= 1, abs(geo.h - h - pad2) <= 1 { return }
        geo = BeanDraw.frameVine(w: w, h: h)
    }

    private func hanging(_ h: BeanDraw.Hanging, tree: (top: [Beanstalk.Note], kids: [String: [Beanstalk.Note]]), total: Int, c: Clock, page: Clock, open: Clock) -> some View {
        let bend: Double = next - shift
        let paged: Bool = pageAt != nil
        return ZStack(alignment: .topLeading) {
            StalkCanvas(h: h, c: c).frame(width: width, height: h.H).accessibilityHidden(true)
            ForEach(h.leaves) { leaf in
                // The first time, on the post's clock after the stalk has grown; a new page, or opened replies, on their own.
                let lc: Clock = leaf.level > 1 ? open : (paged ? page : c)
                // A cluster spreading out: the leaves after the ones already out unfurl in turn.
                let at: Double = leaf.level > 1 ? 0 : (paged ? Double(max(0, leaf.k - (cv.shown - Beanstalk.spreadCount))) * 110 : 1100 + Double(leaf.k) * 180)
                BeanLeafView(leaf: leaf, c: lc, at: at, words: words) { cut in tap(leaf, cut: cut) }
                    .offset(x: leaf.x, y: leaf.y)
            }
            // More than three comments: an uncountable cluster of leaves that rustles and spreads out
            // to five when tapped; past five, a smaller cluster at the bottom reveals the next ones.
            if h.cluster || h.more {
                let top: Double = h.cluster ? 66 : 36
                LeafCluster(big: h.cluster, seed: index, first: h.cluster ? tree.top.first : nil, width: (width * 0.5).rounded(), vine: { (y: Double) -> Double in
                    // The stalk's own sway and wiggle at this height, less the cluster's own shift.
                    let Y = h.pgY - top + y
                    return 7 * sin(Y / 30) + bend * BeanDraw.smooth(Y / max(1, h.H)) - bend * (h.pgY / max(1, h.H))
                }, words: words) {
                    var next = cv
                    if next.spread { next.shown += Beanstalk.spreadCount } else { next.spread = true }
                    cv = next
                    pageAt = .now
                }
                .frame(width: width)
                .offset(x: bend * (h.pgY / max(1, h.H)), y: h.pgY - top)
                .opacity(c.span(1100, 300, 0, 1))
            }
        }
        .frame(width: width, height: h.H, alignment: .topLeading)
    }

    private func tap(_ leaf: BeanDraw.Leaf, cut: Bool) {
        // A first-level comment always opens the square close-up (Steve, 2026-11-01).
        if cut || leaf.level == 1 {
            reading = leaf.note
            return
        }
        guard leaf.replies > 0, leaf.level < 3 else { return }
        cv.toggleReplies(level: leaf.level, index: leaf.path[leaf.level == 1 ? 0 : 1])
        openAt = .now
    }

    private func pager(_ h: BeanDraw.Hanging, total: Int) -> some View {
        let from = h.page * Beanstalk.perPage + 1
        let to = min(total, from + Beanstalk.perPage - 1)
        let first = h.page <= 0, last = h.page >= h.pages - 1
        return HStack(spacing: 8) {
            Button { go(h.page - 1) } label: { PagerKey(left: true) }
                .buttonStyle(.plain).disabled(first).opacity(first ? 0.35 : 1)
                .accessibilityLabel(words("beanstalk.prev"))
            Text(words("beanstalk.range", ["from": String(from), "to": String(to), "total": String(total)]))
                .font(BeanFont.bold(14)).foregroundStyle(Bean.ink)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Bean.cream, in: .capsule)
                .overlay(Capsule().stroke(Bean.ink, lineWidth: 2))
            Button { go(h.page + 1) } label: { PagerKey(left: false) }
                .buttonStyle(.plain).disabled(last).opacity(last ? 0.35 : 1)
                .accessibilityLabel(words("beanstalk.next"))
        }
    }

    private func go(_ p: Int) {
        cv = BeanDraw.LeafState(page: p)
        pageAt = .now
    }
}

/// A ‹ or › key of the pager, a leaf-cornered tile.
private struct PagerKey: View {
    let left: Bool
    var body: some View {
        let shape = UnevenRoundedRectangle(topLeadingRadius: 4, bottomLeadingRadius: 22, bottomTrailingRadius: 4, topTrailingRadius: 22)
        Canvas { ctx, _ in
            var p = Path()
            if left {
                p.move(to: CGPoint(x: 10, y: 3)); p.addLine(to: CGPoint(x: 4, y: 8)); p.addLine(to: CGPoint(x: 10, y: 13))
            } else {
                p.move(to: CGPoint(x: 6, y: 3)); p.addLine(to: CGPoint(x: 12, y: 8)); p.addLine(to: CGPoint(x: 6, y: 13))
            }
            ctx.stroke(p, with: .color(Bean.ink), style: .init(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
        }
        .frame(width: 16, height: 16)
        .frame(width: 44, height: 44)
        .background(Bean.button, in: shape)
        .overlay(shape.stroke(Bean.ink, lineWidth: 2.5))
        .background(shape.fill(Bean.ink).offset(x: 2, y: 3))
    }
}

/// The stalk below a post, growing down to the next one, with the leaves' stems.
private struct StalkCanvas: View {
    let h: BeanDraw.Hanging
    let c: Clock

    var body: some View {
        Canvas { ctx, _ in
            let grow: Double = c.span(500, 750, 0, 1, .easeIn)
            let s1 = path(h.s1).trimmedPath(from: 0, to: grow)
            let s2 = path(h.s2).trimmedPath(from: 0, to: grow)
            ctx.stroke(s2, with: .color(Bean.vineInk), style: .init(lineWidth: 6.5, lineCap: .round, lineJoin: .round))
            ctx.stroke(s2, with: .color(Bean.strandLight), style: .init(lineWidth: 3, lineCap: .round, lineJoin: .round))
            ctx.stroke(s1, with: .color(Bean.vineInk), style: .init(lineWidth: 9.5, lineCap: .round, lineJoin: .round))
            ctx.stroke(s1, with: .color(Bean.strand), style: .init(lineWidth: 5.5, lineCap: .round, lineJoin: .round))
            var stems = ctx
            stems.opacity = c.span(1050, 300, 0, 1)
            let st = path(h.stems)
            stems.stroke(st, with: .color(Bean.vineInk), style: .init(lineWidth: 6.5, lineCap: .round))
            stems.stroke(st, with: .color(Bean.stem), style: .init(lineWidth: 3.2, lineCap: .round))
            var deco = ctx
            deco.opacity = c.span(900, 300, 0, 1)
            let d = path(h.deco)
            deco.fill(d, with: .color(Bean.vineLeaf))
            deco.stroke(d, with: .color(Bean.vineInk), lineWidth: 1.7)
        }
        .allowsHitTesting(false)
    }
}

/// The vine round the frame, drawing itself on the post's clock.
private struct FrameCanvas: View {
    let geo: BeanDraw.FrameVine
    let c: Clock

    var body: some View {
        Canvas { ctx, _ in
            var tendrils = ctx
            tendrils.opacity = c.span(1050, 500, 0, 1)
            tendrils.stroke(path(geo.tendrils), with: .color(Bean.tendril), style: .init(lineWidth: 2.4, lineCap: .round))
            let g1: Double = c.span(0, 1350, 0, 1, .vine)
            let g2: Double = c.span(120, 1350, 0, 1, .vine)
            for d in geo.s2 {
                let p = path(d).trimmedPath(from: 0, to: g2)
                ctx.stroke(p, with: .color(Bean.vineInk), style: .init(lineWidth: 6.5, lineCap: .round, lineJoin: .round))
                ctx.stroke(p, with: .color(Bean.strandLight), style: .init(lineWidth: 3, lineCap: .round, lineJoin: .round))
            }
            for d in geo.s1 {
                let p = path(d).trimmedPath(from: 0, to: g1)
                ctx.stroke(p, with: .color(Bean.vineInk), style: .init(lineWidth: 9.5, lineCap: .round, lineJoin: .round))
                ctx.stroke(p, with: .color(Bean.strand), style: .init(lineWidth: 5.5, lineCap: .round, lineJoin: .round))
            }
            // Leaves in five groups, one after another round the frame.
            let starts: [Double] = [200, 420, 660, 900, 1120]
            for g in 0..<5 {
                var lc = ctx
                lc.opacity = c.span(starts[g], 280, 0, 1)
                let a = path(geo.la[g])
                let b = path(geo.lb[g])
                lc.fill(a, with: .color(Bean.vineLeaf))
                lc.stroke(a, with: .color(Bean.vineInk), lineWidth: 1.7)
                lc.fill(b, with: .color(Bean.vineLeafLight))
                lc.stroke(b, with: .color(Bean.vineInk), lineWidth: 1.7)
            }
            // The flower at the top middle pops open once the vine meets there.
            bloom(ctx, path(geo.flower), at: 1300, dur: 450, fill: Bean.petal, line: 1.8)
            bloom(ctx, path(geo.heart), at: 1450, dur: 350, fill: Bean.heart, line: 1.5)
        }
        .allowsHitTesting(false)
    }

    private func bloom(_ ctx: GraphicsContext, _ p: Path, at: Double, dur: Double, fill: Color, line: Double) {
        let s: Double = c.span(at, dur, 0, 1, .pop)
        guard s > 0.001 else { return }
        let fx: Double = geo.flowerAt.x, fy: Double = geo.flowerAt.y
        let t = CGAffineTransform(translationX: fx, y: fy).scaledBy(x: s, y: s).translatedBy(x: -fx, y: -fy)
        let q = p.applying(t)
        ctx.fill(q, with: .color(fill))
        ctx.stroke(q, with: .color(Bean.vineInk), lineWidth: line)
    }
}

/// The design's leaf, drawn in a 200×100 box: wide at the base, a pointed tip. `flip` puts the base on the right.
private struct DesignLeaf: Shape {
    var flip = false
    var veins = false
    var big = false

    func path(in r: CGRect) -> Path {
        // Always the drawing's own 2 by 1, centred in whatever box it is given: no frame, text
        // length or text size can ever stretch a leaf into a puffy or squashed one (Steve, 2026-11-01).
        let W = min(Double(r.width), 2 * Double(r.height)), H = W / 2
        let X0 = Double(r.midX) - W / 2, Y0 = Double(r.midY) - H / 2
        func P(_ x: Double, _ y: Double) -> CGPoint {
            let u: Double = x / 200 * W
            let px: Double = flip ? W - u : u
            return CGPoint(x: X0 + px, y: Y0 + y / 100 * H)
        }
        var p = Path()
        func curve(_ v: [Double]) { p.addCurve(to: P(v[4], v[5]), control1: P(v[0], v[1]), control2: P(v[2], v[3])) }
        if veins {
            let small: [[Double]] = [[2, 50, 60, 46, 140, 48, 198, 60], [46, 48, 56, 34, 64, 22, 74, 12], [46, 48, 56, 62, 62, 76, 70, 88], [96, 48, 106, 34, 116, 22, 128, 14],
                                     [96, 49, 106, 62, 114, 74, 124, 84], [144, 52, 152, 44, 158, 36, 168, 30], [144, 53, 150, 62, 156, 68, 164, 74]]
            let large: [[Double]] = [[2, 50, 8, 50, 10, 50, 12, 50], [186, 57, 190, 58, 194, 59, 198, 60], [30, 30, 34, 24, 38, 18, 44, 12], [30, 72, 34, 78, 38, 84, 44, 88], [168, 40, 172, 36, 176, 32, 180, 30]]
            for v in big ? large : small {
                p.move(to: P(v[0], v[1]))
                curve(Array(v[2...]))
            }
            return p
        }
        p.move(to: P(2, 50))
        curve([4, 34, 22, 10, 66, 6])
        curve([112, 2, 160, 20, 198, 60])
        curve([158, 82, 110, 98, 64, 94])
        curve([24, 90, 4, 66, 2, 50])
        p.closeSubpath()
        return p
    }
}

/// One hanging leaf: it unfurls from its stem, tilted as in the design.
private struct BeanLeafView: View {
    let leaf: BeanDraw.Leaf
    let c: Clock
    let at: Double
    let words: Words
    let onTap: (Bool) -> Void

    private func leafWords(_ text: String, _ fs: Double, _ nameFs: Double, _ hint: String, lines: Int, show: Bool) -> some View {
        VStack(spacing: 0) {
            Text(leaf.note.author).font(BeanFont.bold(nameFs)).lineLimit(1).minimumScaleFactor(0.6)
            Text(text).font(BeanFont.body(fs)).lineLimit(lines).minimumScaleFactor(0.6)
            if show { Text(hint).font(BeanFont.boldItalic(12)).foregroundStyle(Bean.link).lineLimit(1).minimumScaleFactor(0.6).padding(.top, 2) }
        }
    }

    var body: some View {
        let left: Bool = leaf.side < 0
        let fs: Double = leaf.level == 1 ? 14 : (leaf.level == 2 ? 12.5 : 12)
        let nameFs: Double = leaf.level == 1 ? 13.5 : (leaf.level == 2 ? 12 : 11.5)
        let small: Bool = leaf.level > 1
        let fit = Beanstalk.fit(leaf.note.body, max: Beanstalk.chars(width: leaf.lw * 0.64, font: fs, lines: small ? 1 : 2))
        let more: Bool = leaf.replies > 0 && leaf.level < 3
        let hint: String = more ? (leaf.open ? words("beanstalk.fold") : words("beanstalk.replies", count: leaf.replies)) : ""
        let anchor: UnitPoint = left ? .trailing : .leading
        let grow: Double = c.span(at, 450, 0, 1, .unfurl)
        let turn: Double = c.span(at, 450, -14, 0, .unfurl)
        // A reply leaf keeps its words further in from its tilted outline, so they always sit on the leaf's pale middle.
        let near: Double = small ? 0.18 : 0.12, far: Double = small ? 0.28 : 0.24
        let padL: Double = leaf.lw * (left ? far : near)
        let padR: Double = leaf.lw * (left ? near : far)
        Button { onTap(fit.cut) } label: {
            // The words are shortened to fit; at a larger text size the leaf keeps its size and its
            // words step down to whatever fits inside it (the whole comment opens on a tap and is
            // read in full by VoiceOver), so nothing ever spills out of a leaf.
            ViewThatFits(in: .vertical) {
                leafWords(fit.text, fs, nameFs, hint, lines: small ? 1 : 2, show: !hint.isEmpty && !small)
                leafWords(fit.text, fs, nameFs, hint, lines: small ? 1 : 2, show: false)
                leafWords(fit.text, fs, nameFs, hint, lines: 1, show: false)
                Text(leaf.note.author).font(BeanFont.bold(nameFs)).lineLimit(1).minimumScaleFactor(0.3)
            }
            .foregroundStyle(Bean.text)
            .multilineTextAlignment(.center)
            .padding(.top, small ? 4 : 10)
            .padding(.bottom, small ? 6 : 12)
            .padding(.leading, padL)
            .padding(.trailing, padR)
            .frame(width: leaf.lw)
            // A reply keeps a real leaf's shape, half as tall as it is wide, so it never balloons.
            // A true leaf's proportions at a fixed size: the words never stretch it (Steve, 2026-10-30).
            .frame(height: BeanDraw.leafHeight(width: leaf.lw))
            .background { LeafBack(flip: left, fill: Bean.leaves[leaf.fill]) }
        }
        .buttonStyle(.plain)
        // Not .disabled: a disabled button draws the whole leaf faded, its words too faint to read.
        .allowsHitTesting(fit.cut || more || leaf.level == 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(leaf.note.author): \(leaf.note.body)")
        .accessibilityHint(fit.cut || leaf.level == 1 ? words("beanstalk.readHint") : (more ? words("beanstalk.repliesHint") : ""))
        .accessibilityAddTraits(fit.cut || more || leaf.level == 1 ? .isButton : [])
        .overlay(alignment: left ? .trailing : .leading) {
            // Replies wait as holly berries at the leaf's stem (Steve, 2026-10-30).
            if more && !leaf.open { HollyBerries(count: min(leaf.replies, 3)).offset(x: left ? 10 : -10, y: 18).accessibilityHidden(true) }
        }
        .scaleEffect(grow, anchor: anchor)
        .rotationEffect(.degrees(turn), anchor: anchor)
        .rotationEffect(.degrees(leaf.ang), anchor: anchor)
        // A reply grows out of its holly berry: the berry swells, then the small leaf unfurls from it,
        // and the berry stays at the leaf's stem as its seed.
        .overlay(alignment: left ? .trailing : .leading) {
            if small { HollyBerries(count: 1).scaleEffect(1 + 0.5 * (1 - grow)).offset(x: left ? 7 : -7).accessibilityHidden(true) }
        }
    }
}

/// A few red holly berries, each with a glint, ringed in the drawing's ink.
private struct HollyBerries: View {
    let count: Int
    var body: some View {
        ZStack {
            ForEach(0..<count, id: \.self) { i in
                let spot: [CGSize] = [CGSize(width: 0, height: 0), CGSize(width: 9, height: -5), CGSize(width: 4, height: 8)]
                ZStack {
                    Circle().fill(Color(RGB(hex: "#C62828")!))
                    Circle().stroke(Bean.vineInk, lineWidth: 1.5)
                    Circle().fill(.white.opacity(0.75)).frame(width: 3, height: 3).offset(x: -2, y: -2)
                }
                .frame(width: 10, height: 10)
                .offset(spot[i % 3])
            }
        }
        .frame(width: 24, height: 24)
    }
}

/// A cluster of comments waiting to be read, grown the way a vine grows leaves: several nodes
/// close together on the stalk, each leaf on its own short stalk (petiole), alternating sides
/// and spreading outward, never overlapping. The largest leaf carries the first line of the top
/// comment. A tap rustles every leaf on its stalk, then the comments spread out (Steve, 2026-10-30).
private struct LeafCluster: View {
    /// The cluster under a post; false for the smaller one that reveals more.
    let big: Bool
    let seed: Int
    /// The top comment, whose first line shows on the largest leaf.
    let first: Beanstalk.Note?
    /// A hanging leaf's width; the cluster is twice that, centred on the stalk.
    let width: Double
    /// Where the vine actually is at a height in the cluster, off its centre line: it sways and wiggles.
    var vine: (Double) -> Double = { _ in 0 }
    let words: Words
    let spread: () -> Void
    @State private var rustles = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var still: Bool { reduceMotion || Bean.audit }

    /// One leaf at its node: how far down the stalk, which side, its stalk's length, the blade's
    /// width and its tilt (positive droops the tip).
    private struct Node { let y: Double, side: Double, stalk: Double, size: Double, droop: Double, text: Bool }

    private var nodes: [Node] {
        let lead = width - 14
        if !big {
            return [Node(y: 9, side: 1, stalk: 14, size: 64, droop: -24, text: false),
                    Node(y: 37, side: -1, stalk: 14, size: 57, droop: 10, text: false),
                    Node(y: 64, side: 1, stalk: 12, size: 51, droop: 30, text: false)]
        }
        // Upper leaves reach up and out, lower ones droop, like a shoot seen from the side.
        return [Node(y: 29, side: 1, stalk: 18, size: 92, droop: -14, text: false),
                Node(y: 29, side: -1, stalk: 12, size: lead, droop: 3, text: true),
                Node(y: 84, side: 1, stalk: 16, size: 68, droop: 2, text: false),
                Node(y: 136, side: 1, stalk: 16, size: 79, droop: 28, text: false),
                Node(y: 150, side: -1, stalk: 16, size: 64, droop: 30, text: false),
                Node(y: 194, side: -1, stalk: 14, size: 48, droop: 40, text: false)]
    }

    var body: some View {
        let W = width
        let all = nodes
        let tall: Double = big ? 242 : 99
        Button {
            rustles += 1
            Task {
                try? await Task.sleep(for: .seconds(still ? 0 : 0.5))
                withAnimation(.easeOut(duration: 0.4)) { spread() }
            }
        } label: {
            ZStack(alignment: .topLeading) {
                // The leaf stalks, each from its own node on the vine.
                Canvas { ctx, _ in
                    for n in all {
                        let a = n.droop * .pi / 180
                        let vx = W + vine(n.y)
                        var p = Path()
                        p.move(to: CGPoint(x: vx, y: n.y))
                        p.addQuadCurve(to: CGPoint(x: vx + n.side * n.stalk, y: n.y + n.stalk * 0.35 + n.stalk * 0.4 * sin(a)),
                                       control: CGPoint(x: vx + n.side * n.stalk * 0.5, y: n.y - 3))
                        ctx.stroke(p, with: .color(Bean.vineInk), style: .init(lineWidth: 4.5, lineCap: .round))
                        ctx.stroke(p, with: .color(Bean.stem), style: .init(lineWidth: 2.5, lineCap: .round))
                    }
                }
                .frame(width: 2 * W, height: tall)
                ForEach(Array(all.enumerated()), id: \.offset) { i, n in
                    let left = n.side < 0
                    let h = (n.size * (n.text ? 0.58 : 0.5)).rounded()
                    let ex = W + vine(n.y) + n.side * n.stalk
                    let ey = n.y + n.stalk * 0.35 + n.stalk * 0.4 * sin(n.droop * .pi / 180)
                    let anchor: UnitPoint = left ? .trailing : .leading
                    blade(n, flip: left, fill: Bean.leaves[(i + seed) % Bean.leaves.count])
                        // Always a true leaf's proportions: the words never stretch it (Steve, 2026-10-30).
                        .frame(width: n.size, height: h)
                        // Each leaf swings on its own stalk, out of step with the rest.
                        .rustle(rustles, by: Double(i % 3 + 2) * (i % 2 == 0 ? 1 : -1), anchor: anchor)
                        .rotationEffect(.degrees(n.side * n.droop), anchor: anchor)
                        .offset(x: left ? ex - n.size : ex, y: ey - h / 2)
                }
            }
            .frame(width: 2 * W, height: tall, alignment: .topLeading)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(first.map { "\($0.author): \($0.body). " + words("beanstalk.openCluster") } ?? words(big ? "beanstalk.openCluster" : "beanstalk.moreCluster"))
    }

    @ViewBuilder private func blade(_ n: Node, flip: Bool, fill: Color) -> some View {
        ZStack {
            LeafBack(flip: flip, fill: fill, line: 2)
            if n.text, let first {
                VStack(spacing: 1) {
                    Text(first.author).font(BeanFont.bold(13)).lineLimit(1).minimumScaleFactor(0.6)
                    // The opening of the top comment, shortened to fit at a word; larger text shrinks to
                    // fit the leaf rather than stretching it.
                    Text(Beanstalk.fit(first.body, max: Beanstalk.chars(width: n.size * 0.9, font: 12.5, lines: 2)).text)
                        .font(BeanFont.body(12.5)).lineLimit(2).minimumScaleFactor(0.6)
                }
                .foregroundStyle(Bean.text)
                .multilineTextAlignment(.center)
                .padding(.leading, n.size * (flip ? 0.2 : 0.16))
                .padding(.trailing, n.size * (flip ? 0.16 : 0.2))
            }
        }
    }
}

private extension View {
    /// Shakes like a leaf in a gust when `trigger` changes, `by` degrees at its widest swing.
    func rustle(_ trigger: Int, by amp: Double, anchor: UnitPoint) -> some View {
        keyframeAnimator(initialValue: 0.0, trigger: trigger) { view, angle in
            view.rotationEffect(.degrees(angle), anchor: anchor)
        } keyframes: { _ in
            KeyframeTrack {
                CubicKeyframe(amp * 3, duration: 0.07)
                CubicKeyframe(-amp * 2.6, duration: 0.08)
                CubicKeyframe(amp * 2.2, duration: 0.08)
                CubicKeyframe(-amp * 1.4, duration: 0.08)
                CubicKeyframe(amp * 0.8, duration: 0.08)
                CubicKeyframe(0, duration: 0.08)
            }
        }
    }
}

private struct LeafBack: View {
    var flip = false
    var fill: Color
    var line = 2.5
    var big = false
    var body: some View {
        ZStack {
            DesignLeaf(flip: flip).fill(fill)
            // From the leaf's own green at its edges to a brighter, paler green in the middle (Steve, 2026-10-30).
            DesignLeaf(flip: flip).fill(EllipticalGradient(colors: [Color(RGB(hex: "#F4FBE4")!).opacity(0.85), Color(RGB(hex: "#F4FBE4")!).opacity(0)],
                                                           center: .center, startRadiusFraction: 0, endRadiusFraction: 0.55))
            DesignLeaf(flip: flip).stroke(Bean.vineInk, lineWidth: line)
            DesignLeaf(flip: flip, veins: true, big: big).stroke(Bean.vein.opacity(0.55), style: .init(lineWidth: 1.2, lineCap: .round))
        }
    }
}

/// The poster's initial in an oval gold locket hanging from a little loop (70% larger than first drawn).
private struct Locket: View {
    let name: String
    /// The member's own photo, when they've added one under Me.
    var photo: String? = nil
    var body: some View {
        VStack(spacing: -5) {
            Circle().stroke(Bean.locket, lineWidth: 3.4).frame(width: 15, height: 15)
                .background(Circle().stroke(Bean.ink, lineWidth: 6.8))
            ZStack {
                Ellipse().fill(Bean.locket).overlay(Ellipse().stroke(Bean.ink, lineWidth: 3))
                Ellipse().fill(Bean.locketFace).overlay(Ellipse().stroke(Bean.ink, lineWidth: 2.2)).padding(8.5)
                if let photo, let url = URL(string: photo) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        initial
                    }
                    .frame(width: 61, height: 71)
                    .clipShape(Ellipse())
                    .overlay(Ellipse().stroke(Bean.ink, lineWidth: 2.2))
                } else {
                    initial
                }
            }
            .frame(width: 78, height: 88)
        }
        .accessibilityHidden(true)
    }

    /// Drawn, not a text element: SwiftUI still listed a hidden Text letter to the screen reader and
    /// Apple's audit, outside its card, and the poster's name already says who it is.
    private var initial: some View {
        let letter = String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased()
        return Canvas { ctx, box in
            ctx.draw(Text(letter).font(BeanFont.boldFixed(37)).foregroundStyle(Bean.ink), at: CGPoint(x: box.width / 2, y: box.height / 2))
        }
        .frame(width: 61, height: 71)
        .accessibilityHidden(true)
    }
}

/// The stem and leaf that lead the stalk down into the newest post.
private struct Lead: View {
    var body: some View {
        Canvas { ctx, _ in
            var s = Path()
            s.move(to: CGPoint(x: 30, y: 0))
            s.addCurve(to: CGPoint(x: 30, y: 44), control1: CGPoint(x: 42, y: 16), control2: CGPoint(x: 18, y: 30))
            s.addCurve(to: CGPoint(x: 30, y: 60), control1: CGPoint(x: 36, y: 52), control2: CGPoint(x: 31, y: 57))
            ctx.stroke(s, with: .color(Bean.vineInk), style: .init(lineWidth: 10, lineCap: .round))
            ctx.stroke(s, with: .color(Bean.strand), style: .init(lineWidth: 6, lineCap: .round))
            var l = Path()
            l.move(to: CGPoint(x: 34, y: 22))
            l.addCurve(to: CGPoint(x: 58, y: 20), control1: CGPoint(x: 42, y: 12), control2: CGPoint(x: 54, y: 13))
            l.addCurve(to: CGPoint(x: 34, y: 22), control1: CGPoint(x: 52, y: 28), control2: CGPoint(x: 42, y: 28))
            l.closeSubpath()
            l.move(to: CGPoint(x: 34, y: 22))
            l.addLine(to: CGPoint(x: 54, y: 20))
            ctx.fill(l, with: .color(Bean.vineLeaf))
            ctx.stroke(l, with: .color(Bean.vineInk), lineWidth: 1.8)
        }
        .frame(width: 60, height: 60)
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }
}

/// The big leaf: one comment and its replies.
private struct BeanReader: View {
    /// The comment tapped, then every later first-level comment on the post.
    let thread: [Beanstalk.Note]
    let kids: [String: [Beanstalk.Note]]
    let words: Words
    /// Where the poster's locket and name end on screen: the close-up opens below them, so you
    /// can always see whose post you're answering (Steve, 2026-10-30).
    var top: Double = 0
    let close: () -> Void
    /// The comments whose replies are all shown; the rest show their first reply and "+N more".
    @State private var opened: Set<String> = []

    // The full close-up only hints at a leaf (Steve, 2026-10-30): a plain green square, paler in
    // the middle, with V-shaped veins repeating down it, and the replies indented under the comment
    // as in any social app. No leaf outline, no vine lining.
    // Steve, 2026-11-01: a first-level comment opens it, with all the later comments exposed, each
    // with its first reply and a count of how many more there are at that level ("+13 more").
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                ForEach(thread) { c in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.author).font(BeanFont.bold(17))
                        Text(c.body).font(BeanFont.body(20)).fixedSize(horizontal: false, vertical: true)
                        replies(c.id, level: 1)
                    }
                }
            }
            .foregroundStyle(Bean.text)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 22)
            .padding(.top, 64)
            // Room under the last words, clear of the square's foot, however many "+N more" open.
            .padding(.bottom, 44)
        }
        .scrollBounceBehavior(.basedOnSize)
        // A square, as large as the screen allows; longer threads scroll inside it, and the words
        // never show past its edges (never up over the poster's name).
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: 600)
        .scrollClipDisabled(false)
        .background { LeafSquare().accessibilityHidden(true) }
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .contentShape(RoundedRectangle(cornerRadius: 16))
        .overlay(alignment: .topTrailing) {
            Button(action: close) {
                Image(systemName: "xmark").font(.headline.bold()).foregroundStyle(Bean.ink)
                    .frame(width: 44, height: 44)
                    .background(Color(RGB(hex: "#F3E3B8")!), in: .circle)
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.cancelAction)
            .accessibilityLabel(words("common.close"))
            .padding(12)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
        .modifier(BelowName(top: top, close: close))
        .presentationBackground(.clear)
        .environment(\.colorScheme, .light)
    }

    /// The replies to one comment: the first, then "+N more" for the rest at that level until tapped.
    private func replies(_ id: String, level: Int) -> AnyView {
        let all = kids[id] ?? []
        let shown = opened.contains(id) ? all : Array(all.prefix(1))
        let hidden = all.count - shown.count
        return AnyView(VStack(alignment: .leading, spacing: 0) {
            ForEach(shown) { r in
                VStack(alignment: .leading, spacing: 2) {
                    Text(r.author).font(BeanFont.bold(17))
                    Text(r.body).font(BeanFont.body(18)).fixedSize(horizontal: false, vertical: true)
                    if level < Beanstalk.maxLevel { replies(r.id, level: level + 1) }
                }
                .padding(.top, 8)
                .padding(.leading, 12)
                .overlay(alignment: .leading) { Rectangle().fill(level == 1 ? Bean.stem : Bean.strandLight).frame(width: 4) }
                .padding(.leading, 20)
            }
            if hidden > 0 {
                Button { opened.insert(id) } label: {
                    Text("+\(hidden) more").font(BeanFont.boldItalic(16)).foregroundStyle(Bean.link)
                        .frame(minHeight: 44, alignment: .leading)
                }
                .buttonStyle(.plain)
                .padding(.leading, 32)
                .accessibilityLabel("\(hidden) more \(hidden == 1 ? "reply" : "replies")")
                .accessibilityHint("Shows them all")
            }
        })
    }
}

/// Places the close-up below the poster's locket and name, dimming only the feed beneath them, so
/// the post's author stays in view. A tap outside the square closes it.
private struct BelowName: ViewModifier {
    let top: Double
    let close: () -> Void
    func body(content: Content) -> some View {
        GeometryReader { g in
            // On screen even when the post is scrolled part way off, and never so low the square has no room.
            let y: Double = min(max(top, 60), Double(g.size.height) * 0.5)
            VStack(spacing: 0) {
                Color.clear.contentShape(.rect).frame(height: y).onTapGesture(perform: close)
                content.frame(maxHeight: .infinity, alignment: .top)
            }
            .background(alignment: .bottom) {
                Color.black.opacity(0.45).frame(height: max(0, Double(g.size.height) - y + 8)).onTapGesture(perform: close).accessibilityHidden(true)
            }
        }
        .ignoresSafeArea()
    }
}

/// A green square that suggests a leaf: the leaf's green at the edges, paler and brighter in the
/// middle, a midrib down the centre and V-shaped veins repeating along it.
private struct LeafSquare: View {
    var body: some View {
        ZStack {
            // 10% lighter at both ends of the gradient than first drawn (Steve, 2026-10-30).
            Rectangle().fill(Color(RGB(hex: "#BDDB87")!))
            Rectangle().fill(EllipticalGradient(colors: [Color(RGB(hex: "#F5FBE7")!).opacity(0.9), Color(RGB(hex: "#F5FBE7")!).opacity(0)],
                                                center: .center, startRadiusFraction: 0, endRadiusFraction: 0.6))
            Canvas { ctx, size in
                let cx = size.width / 2
                let reach = size.width * 0.42
                var veins = Path()
                veins.move(to: CGPoint(x: cx, y: 0))
                veins.addLine(to: CGPoint(x: cx, y: size.height))
                var y: CGFloat = reach * 0.6
                while y < size.height + reach * 0.6 {
                    veins.move(to: CGPoint(x: cx - reach, y: y - reach * 0.6))
                    veins.addLine(to: CGPoint(x: cx, y: y))
                    veins.addLine(to: CGPoint(x: cx + reach, y: y - reach * 0.6))
                    y += 70
                }
                ctx.stroke(veins, with: .color(Bean.vein.opacity(0.22)), style: .init(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
            }
        }
    }
}

/// Fruit on the vine (Steve, 2026-10-30): someone has gifted the poster tokens, regular or Priestly.
struct VineFruit: View {
    let label: String
    var size: Double = 34

    var body: some View {
        Canvas { ctx, sz in
            ctx.scaleBy(x: sz.width / 34, y: sz.height / 34)
            var stem = Path()
            stem.move(to: CGPoint(x: 17, y: 2)); stem.addCurve(to: CGPoint(x: 11, y: 15), control1: CGPoint(x: 17, y: 7), control2: CGPoint(x: 14, y: 10))
            stem.move(to: CGPoint(x: 17, y: 2)); stem.addCurve(to: CGPoint(x: 24, y: 16), control1: CGPoint(x: 18, y: 8), control2: CGPoint(x: 21, y: 11))
            ctx.stroke(stem, with: .color(Color(RGB(hex: "#4A3220")!)), style: .init(lineWidth: 2, lineCap: .round))
            var leaf = Path()
            leaf.move(to: CGPoint(x: 17, y: 4)); leaf.addQuadCurve(to: CGPoint(x: 30, y: 5), control: CGPoint(x: 25, y: 0))
            leaf.addQuadCurve(to: CGPoint(x: 17, y: 4), control: CGPoint(x: 23, y: 9))
            ctx.fill(leaf, with: .color(Color(RGB(hex: "#7FB347")!)))
            ctx.stroke(leaf, with: .color(Bean.vineInk), lineWidth: 1.2)
            for (x, y, hex) in [(11.0, 22.0, "#D9452B"), (24.0, 23.0, "#E8762E")] {
                let fruit = Path(ellipseIn: CGRect(x: x - 8, y: y - 8, width: 16, height: 16))
                ctx.fill(fruit, with: .color(Color(RGB(hex: hex)!)))
                ctx.stroke(fruit, with: .color(Color(RGB(hex: "#3A1A10")!)), lineWidth: 1.6)
                ctx.fill(Path(ellipseIn: CGRect(x: x - 4.7, y: y - 5.2, width: 4.4, height: 4.4)), with: .color(.white.opacity(0.6)))
            }
        }
        .frame(width: size, height: size)
        .accessibilityElement()
        .accessibilityLabel(label)
        .accessibilityAddTraits(.isImage)
    }
}

import PrayerTowerKit
import SwiftUI

/// The feed drawn in the member's skin (docs/FEED_SKINS.md). Every skin keeps the same card
/// content and the ONE row of action icons; only the frame around it changes. Drawings are
/// hidden from VoiceOver, and anything that moves stops with Reduce Motion.
struct SkinnedFeed<Row: View>: View {
    let theme: FeedTheme
    let cards: [Card]
    let wording: Wording
    var hasMore = true
    @ViewBuilder let row: (Card) -> Row
    let onEnd: () async -> Void
    /// Swipe to pray: what a confirmed swipe right does.
    var onPray: (Card) -> Void = { _ in }
    /// Opens a post with all its comments (the vine's "more comments" leaf).
    var onOpen: ((Card) -> Void)?
    /// A post's comments, for the Beanstalk's leaves; nil uses the newest few the feed sent.
    var loadComments: ((Card) async -> [Comment])?

    var body: some View {
        // The bar keeps its own background over a skin, so its title never sits on a dark backdrop.
        layouts.solidNavigationBar()
    }

    @ViewBuilder private var layouts: some View {
        switch theme.kind {
        case .vine:
            if VineLook(theme).vineStyle == .beanstalk {
                BeanstalkFeed(look: VineLook(theme), cards: cards, wording: wording, row: row, onEnd: onEnd, loadComments: loadComments)
            } else {
                VineFeed(look: VineLook(theme), cards: cards, wording: wording, row: row, onEnd: onEnd, onOpen: onOpen, loadComments: loadComments)
            }
        case .wall: WallFeed(look: WallLook(theme), cards: cards, words: LayoutWords(wording), row: row, onEnd: onEnd)
        case .tower: TowerFeed(look: TowerLook(theme), cards: cards, wording: wording, hasMore: hasMore, row: row, onEnd: onEnd)
        case .circuit: CircuitFeed(look: CircuitLook(theme), cards: cards, words: LayoutWords(wording), hasMore: hasMore, row: row, onEnd: onEnd)
        case .carousel: SwipeFeed(cards: cards, wording: wording, hasMore: hasMore, row: row, onEnd: onEnd, onPray: onPray)
        case .flip: FlipFeed(cards: cards, wording: wording, hasMore: hasMore, row: row, onEnd: onEnd)
        case .column: List(cards) { card in row(card).task { if card.id == cards.last?.id { await onEnd() } } }
        }
    }
}

// MARK: - Vine (Beanstalk, Golden Wood, Moonlit Gate, Neon Cinderella, Blossom Garden, seasonal skins)

/// One tall stalk down the left edge (down the middle on a wide iPad or Mac lane), each post
/// housed in a whole drawn leaf, newest at the top, its newest comments on smaller leaves below.
struct VineFeed<Row: View>: View {
    let look: VineLook
    let cards: [Card]
    let wording: Wording
    @ViewBuilder let row: (Card) -> Row
    let onEnd: () async -> Void
    var onOpen: ((Card) -> Void)?
    var loadComments: ((Card) async -> [Comment])?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 44) {
                if look.vineStyle == .gate { GateTop(look: look).frame(height: 150).frame(maxWidth: .infinity) }
                ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                    VStack(alignment: .leading, spacing: 18) {
                        // Neon: the post's icons sit inside its frame, under the box, as neon outlines (Steve, 2026-10-30).
                        VineLeaf(look: look, wording: wording, depth: 0, below: look.vineStyle == .neon ? AnyView(row(card).environment(\.cardPart, .icons(Color(look.leaf)))) : nil) {
                            row(card).environment(\.cardPart, look.vineStyle == .neon ? .post : .whole)
                        }
                        .overlay(alignment: .topTrailing) {
                            if card.gifted == true { VineFruit(label: Words(wording)("vine.fruit")).padding(.trailing, 14) }
                        }
                        if look.vineStyle == .neon {
                            // A loaded stack of comments to flip through, coming out of the post (Steve, 2026-10-30).
                            NeonCommentStack(card: card, look: look, wording: wording, load: loadComments, onOpen: onOpen)
                        } else {
                            ForEach(card.leafComments ?? []) { c in
                                VineLeaf(look: look, wording: wording, depth: 1) { LeafCommentText(comment: c, look: look) }
                            }
                        }
                        if look.vineStyle != .neon, card.moreComments > 0 {
                            if let onOpen {
                                Button { onOpen(card) } label: { MoreLeaves(count: card.moreComments, look: look, wording: wording) }.buttonStyle(.plain)
                            } else {
                                MoreLeaves(count: card.moreComments, look: look, wording: wording)
                            }
                        }
                        if look.fairytale, let scene = NeonSceneKind.after(card: i) { NeonScene(kind: scene, look: look) }
                    }
                    .task { if card.id == cards.last?.id { await onEnd() } }
                }
                Text(Skin.tip(look, wording))
                    .font(.footnote)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(Color(look.tipColor))
                    .backdropPlate(look.backdrop)
                    // On a backdrop, a solid backing of the backdrop's own color, so a glowing stalk
                    // close by never lights up behind the words; and clear of the stalk.
                    .padding(look.backdrop == nil ? 0 : 8)
                    .background { if let b = look.backdrop { RoundedRectangle(cornerRadius: 10).fill(Color(b)) } }
                    .padding(.leading, 56)
                    .padding(.bottom, 160)
            }
            .padding(.vertical, 20)
            // Neon's stalk gets room for its glow, which would otherwise stop at a hard edge.
            .background(alignment: .topLeading) { Stalk(look: look).frame(width: look.vineStyle == .neon ? 80 : 40).accessibilityHidden(true) }
        }
        .background(look.backdrop.map { Color($0) } ?? Color.pageBackground)
        .environment(\.colorScheme, look.backdrop.map { BackdropText(on: $0).light } == true ? .dark : .light)
    }
}

/// The stalk, drawn the whole height of the feed. Its style follows `vineStyle`.
struct Stalk: View {
    let look: VineLook
    @Environment(\.accessibilityReduceMotion) private var still
    @Environment(\.dynamicTypeSize) private var size
    private var glow: Bool { look.stemGlow && !size.isAccessibilitySize }
    /// Neon's rod builds downward from the top when the feed opens, as the vines grow.
    @State private var grown: CGFloat = 0

    var body: some View {
        rod
            .buildsDownward(look.vineStyle == .neon ? grown : 1)
            .onAppear {
                if look.vineStyle != .neon || still || GrowingIn<EmptyView>.frozen { grown = 1; return }
                withAnimation(.easeIn(duration: 2.5)) { grown = 1 }
            }
    }

    private var rod: some View {
        Canvas { ctx, size in
            let x = 20.0, w = look.stemWidth
            func wave(_ phase: Double, _ amp: Double) -> Path {
                var p = Path()
                p.move(to: CGPoint(x: x, y: 0))
                var y = 0.0
                while y < size.height {
                    p.addLine(to: CGPoint(x: x + amp * sin(y / 60 + phase), y: y))
                    y += 6
                }
                return p
            }
            switch look.vineStyle {
            case .beanstalk:
                // Two thick strands twisting round each other.
                ctx.stroke(wave(0, 5), with: .color(Color(look.stem)), style: .init(lineWidth: w * 0.6, lineCap: .round))
                ctx.stroke(wave(.pi, 5), with: .color(Color(look.branch)), style: .init(lineWidth: w * 0.5, lineCap: .round))
            case .ink:
                ctx.stroke(wave(0, 3), with: .color(Color(look.ink ?? look.branch)), style: .init(lineWidth: w + 2))
                ctx.stroke(wave(0, 3), with: .color(Color(look.stem)), style: .init(lineWidth: w))
            case .neon:
                // One straight neon glass tube, Tron style: a radiant glow round glass that is
                // deeper colored at its edges and close to white in the middle.
                var rod = Path()
                rod.move(to: CGPoint(x: x, y: 0))
                rod.addLine(to: CGPoint(x: x, y: size.height))
                let tube: CGFloat = max(8, CGFloat(w) * 2.5)
                NeonGlassLook(color: Color(look.stem)).stroke(rod, width: tube, in: ctx)
                if !look.fairytale {
                    // Tron's circuitry: short traces off the rod in the second color, each a straight
                    // run that bends down in a small smooth curve, then runs on.
                    let trace = NeonGlassLook(color: Color(look.branch))
                    var ty = 70.0
                    var k = 0
                    while ty < size.height {
                        let reach = k % 2 == 0 ? 34.0 : 22.0
                        var t = Path()
                        t.move(to: CGPoint(x: x + tube / 2, y: ty))
                        t.addLine(to: CGPoint(x: x + reach - 8, y: ty))
                        t.addQuadCurve(to: CGPoint(x: x + reach, y: ty + 8), control: CGPoint(x: x + reach, y: ty))
                        t.addLine(to: CGPoint(x: x + reach, y: ty + 30))
                        trace.stroke(t, width: 3, in: ctx)
                        ty += k % 2 == 0 ? 110 : 170
                        k += 1
                    }
                }
            case .gate:
                // Fine lines of silver light.
                for dx in [-2.0, 2.0] {
                    var p = Path()
                    p.move(to: CGPoint(x: x + dx, y: 0))
                    p.addLine(to: CGPoint(x: x + dx, y: size.height))
                    ctx.stroke(p, with: .color(Color(look.stem)), lineWidth: 1)
                }
            case .floral:
                // A slender stem twined with a pink tendril, and blossoms along it.
                ctx.stroke(wave(0, 2), with: .color(Color(look.stem)), lineWidth: w)
                ctx.stroke(wave(.pi / 2, 7), with: .color(Color(look.tendril)), lineWidth: 1.5)
                var y = 90.0
                while y < size.height {
                    ctx.fill(Path(ellipseIn: CGRect(x: x - 6, y: y, width: 12, height: 12)), with: .color(Color(look.leaf)))
                    y += 180
                }
            case .plain:
                if look.stemDouble {
                    ctx.stroke(wave(0, 4).offsetBy(dx: -2, dy: 0), with: .color(Color(look.stem)), lineWidth: 1.5)
                    ctx.stroke(wave(0, 4).offsetBy(dx: 2, dy: 0), with: .color(Color(look.stem)), lineWidth: 1.5)
                } else {
                    ctx.stroke(wave(0, 4), with: .color(Color(look.stem)), style: .init(lineWidth: w, lineCap: .round))
                }
            }
        }
        // The glow's blur reads as smudged text beside the accessibility sizes' giant letters.
        .shadow(color: glow ? Color(look.stem).opacity(0.8) : .clear, radius: glow ? 8 : 0)
        .overlay(alignment: .top) { if look.vineStyle == .neon && !still { Spark(color: Color(look.stem)) } }
    }
}

/// A spark with a fading tail running down Neon Cinderella's rod, again and again.
struct Spark: View {
    let color: Color
    /// Held still inside the snapshot tests (XCTest is loaded in the app there), so each picture matches its reference.
    static var frozen: Bool { GrowingIn<EmptyView>.frozen }
    var body: some View {
        TimelineView(.animation(paused: Self.frozen)) { t in
            GeometryReader { geo in
                let phase = Self.frozen ? 0.1 : t.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 4) / 4
                let y = phase * min(geo.size.height, 2400)
                Capsule()
                    .fill(LinearGradient(colors: [color.opacity(0), color, .white], startPoint: .top, endPoint: .bottom))
                    .frame(width: 4, height: 40)
                    .position(x: 20, y: y)
                    .neonTube(color)
            }
        }
        .allowsHitTesting(false)
    }
}

/// A post or comment housed in its leaf: the leaf shape, with a smaller box tinted toward the
/// leaf that keeps every text color at 4.5:1. Comments step further from the stalk.
struct VineLeaf<Content: View>: View {
    let look: VineLook
    let wording: Wording
    let depth: Int
    /// Shown inside the frame, under the post's box: neon's icons (Steve, 2026-10-30).
    var below: AnyView? = nil
    /// How many more cards wait behind this one in a stack, drawn as frames peeking out behind it.
    var stacked: Int = 0
    @ViewBuilder let content: () -> Content
    @Environment(\.dynamicTypeSize) private var size
    /// Neon indents a comment under its post, joined by a tube that comes down and turns into it.
    private var tucked: Bool { look.vineStyle == .neon && depth > 0 }
    /// Each level of reply sits further in, under its parent.
    private var indent: CGFloat { 104 + CGFloat(depth - 1) * 40 }

    var body: some View {
        // Neon's connector grows in as the post comes into view: the branch, then the frame.
        GrowingIn(duration: look.vineStyle == .neon ? 2 : 0) { p in leaf(look.vineStyle == .neon ? p : 1) }
    }

    @ViewBuilder private func leaf(_ drawn: CGFloat) -> some View {
        let box = Color(look.leafBox(wording))
        VStack(spacing: 12) {
            content()
                .opacity(ConnectorTiming.text(drawn))
                .padding(depth == 0 ? 14 : 10)
                .background(box, in: .rect(cornerRadius: 12))
                .overlay {
                    if look.vineStyle == .ink { RoundedRectangle(cornerRadius: 12).stroke(Color(look.ink ?? look.branch), lineWidth: 1.5) }
                }
            if let below { below.opacity(ConnectorTiming.text(drawn)) }
        }
            .padding(.horizontal, depth == 0 ? 18 : 14)
            .padding(.vertical, below == nil ? (depth == 0 ? 40 : 26) : 24)
            .background {
                ZStack {
                    // The rest of the stack, peeking out behind, dimmer the further back.
                    // Each one a whole card, overlapping like a loaded deck.
                    ForEach(Array(stride(from: min(stacked, 3), to: 0, by: -1)), id: \.self) { k in
                        ZStack {
                            Color(look.backdrop ?? look.leafBox(wording)).padding(14)
                            RoundedRectangle(cornerRadius: 12).fill(box.opacity(0.35)).padding(.horizontal, depth == 0 ? 18 : 14).padding(.vertical, 24)
                            frame(drawn)
                        }
                        .opacity(1 - Double(k) * 0.22)
                        .offset(x: CGFloat(k) * 12, y: CGFloat(k) * 12)
                    }
                    frame(drawn)
                }
                .accessibilityHidden(true)
            }
            .environment(\.colorScheme, .light)
            .padding(.leading, depth == 0 ? 36 : tucked ? indent : 64)
            .padding(.trailing, 8)
            .overlay(alignment: .leading) {
                if tucked {
                    // From the post's box above (over the gap between them), down and round into this box.
                    drop.buildsDownward(ConnectorTiming.branch(drawn)).padding(.top, -18).accessibilityHidden(true)
                } else {
                    twig.shootsOut(ConnectorTiming.branch(drawn)).accessibilityHidden(true)
                }
            }
    }

    /// What houses the box: a leaf, a neon frame, an arched doorway or a petal frame.
    @ViewBuilder private func frame(_ drawn: CGFloat) -> some View {
        switch look.vineStyle {
        case .neon:
            // A real tube: colored glass glowing round a thin white-hot core.
            // Posts glow in the main color, their comments in the second (Tron's blue and red).
            TopDownFrame(look: NeonGlassLook(color: Color(depth == 0 || look.fairytale ? look.stem : look.branch), cap: .butt), width: 8, progress: ConnectorTiming.frame(drawn))
        case .gate:
            ArchTop().stroke(Color(look.stem), lineWidth: 1.2).overlay(alignment: .top) {
                Image(systemName: "sparkle").font(.caption).foregroundStyle(Color(look.tendril)).offset(y: -6)
            }
        case .floral:
            Scallop().fill(Color(look.leaf).opacity(0.55))
        default:
            ZStack {
                LeafOutline(shape: look.leafShape).fill(Color(look.leaf))
                // Fine veins read as stray strokes beside the accessibility sizes' giant letters.
                if !size.isAccessibilitySize { LeafVeins().stroke(Color(look.branch).opacity(0.45), lineWidth: 1) }
                if look.vineStyle == .ink {
                    // Pen and ink in the manner of Tolkien's own tree drawings: a firm outline and
                    // fine hatching along the leaf's edges, clipped to the leaf.
                    PenHatching().stroke(Color(look.ink ?? look.branch).opacity(0.55), lineWidth: 0.8)
                        .clipShape(LeafOutline(shape: look.leafShape))
                    LeafOutline(shape: look.leafShape).stroke(Color(look.ink ?? look.branch), lineWidth: 2)
                }
            }
        }
    }

    /// The short curved stem from the stalk to this leaf.
    /// Neon's comment connector: a red tube down from the post's box that bends smoothly into the
    /// comment's box.
    private var drop: some View {
        Canvas { ctx, size in
            let x: CGFloat = 72 + CGFloat(depth - 1) * 40, r: CGFloat = 12, y: CGFloat = 48
            var p = Path()
            p.move(to: CGPoint(x: x, y: 0))
            p.addLine(to: CGPoint(x: x, y: y - r))
            p.addQuadCurve(to: CGPoint(x: x + r, y: y), control: CGPoint(x: x, y: y))
            p.addLine(to: CGPoint(x: indent + 4, y: y))
            NeonGlassLook(color: Color(look.branch), white: 0.45).stroke(p, width: 6, in: ctx)
        }
        .frame(width: indent + 26)
    }

    private var twig: some View {
        Canvas { ctx, size in
            var p = Path()
            let reach = depth == 0 ? 40.0 : 68.0
            if look.vineStyle == .neon {
                // No plant: a straight glass tube off the rod, Tron style, glowing like the rest,
                // with no node or ornament where it joins.
                let y = size.height * 0.3
                p.move(to: CGPoint(x: 20, y: y))
                p.addLine(to: CGPoint(x: reach, y: y))
                let boxColor = Color(depth == 0 || look.fairytale ? look.stem : look.branch)
                // From the stalk's color, gradually into the box's, solid in the box's color where it meets the box (blue to red for a comment).
                NeonGlassLook(color: boxColor, from: Color(look.stem), fade: (CGPoint(x: 20, y: y), CGPoint(x: 20 + (reach - 20) * 0.6, y: y)), white: 0.45).stroke(p, width: 6, in: ctx)
                return
            }
            p.move(to: CGPoint(x: 20, y: size.height * 0.2))
            p.addQuadCurve(to: CGPoint(x: reach, y: size.height * 0.42), control: CGPoint(x: 22, y: size.height * 0.4))
            ctx.stroke(p, with: .color(Color(look.lit ? look.stem : look.branch)), style: .init(lineWidth: max(1.5, look.stemWidth / 3), lineCap: .round))
            if look.vineStyle == .ink {
                // A pen curl off the twig, as in the Expo drawing and Tolkien's trees.
                ctx.stroke(PenCurl.path(at: CGPoint(x: 26, y: size.height * 0.3), radius: 7), with: .color(Color(look.ink ?? look.branch)), style: .init(lineWidth: 1.4, lineCap: .round))
            }
        }
        .frame(width: depth == 0 ? 44 : 72)
    }
}

/// The older comments waiting behind frosted glass, with how many there are (BlurredLeaves in vine.tsx).
struct MoreLeaves: View {
    let count: Int
    let look: VineLook
    let wording: Wording

    var body: some View {
        ZStack {
            HStack(spacing: 10) {
                ForEach(0..<3, id: \.self) { _ in LeafOutline().fill(Color(look.leaf)).frame(width: 46, height: 30) }
            }
            .blur(radius: 6)
            .opacity(0.7)
            .accessibilityHidden(true)
            Text(Skin.moreComments(count))
                .font(.footnote.bold())
                .foregroundStyle(Color(RGB.commentText))
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .background(Color(look.leafBox(wording)), in: .capsule)
        }
        .padding(.leading, 58)
        .padding(.vertical, 10)
    }
}

struct LeafCommentText: View {
    let comment: LeafComment
    let look: VineLook
    @Environment(\.dynamicTypeSize) private var size
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            // At the accessibility sizes the words need the room, and a small mark beside giant
            // letters reads as a stray glyph.
            if look.vineStyle != .floral, !size.isAccessibilitySize { Mark(shape: look.leafShape, color: Color(look.leaf), center: Color(look.tendril)) }
            VStack(alignment: .leading, spacing: 2) {
                Text(comment.author.displayName).font(.caption.bold())
                Text(comment.body).font(.callout)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Neon's comments (Steve, 2026-10-30): a loaded stack you flip through, coming out of the parent
/// post; a comment's replies come out of it the same way, each with its own icons. Swipe sideways
/// to flip.
struct NeonCommentStack: View {
    let card: Card
    let look: VineLook
    let wording: Wording
    let load: ((Card) async -> [Comment])?
    var onOpen: ((Card) -> Void)?
    @State private var comments: [Comment] = []

    var body: some View {
        // A view that's always there, so the comments load even while the level is still empty.
        VStack(alignment: .leading, spacing: 0) {
            Color.clear.frame(height: 1)
            CommentLevel(card: card, all: comments, parent: nil, depth: 1, look: look, wording: wording, onOpen: onOpen)
        }
        .task(id: card.id) { comments = await load?(card) ?? [] }
    }
}

/// One level of the stack: the comments under `parent`, one showing at a time, then that one's replies.
private struct CommentLevel: View {
    let card: Card
    let all: [Comment]
    let parent: String?
    let depth: Int
    let look: VineLook
    let wording: Wording
    var onOpen: ((Card) -> Void)?
    @State private var shown = 0
    @State private var hearted: Set<String> = []
    @Environment(AppModel.self) private var model

    private var here: [Comment] { all.filter { $0.parentId == parent } }

    var body: some View {
        if !here.isEmpty {
            let i = min(shown, here.count - 1)
            let c = here[i]
            VStack(alignment: .leading, spacing: 18) {
                VineLeaf(look: look, wording: wording, depth: depth, below: AnyView(icons(c, i)), stacked: here.count - 1 - i) {
                    LeafCommentText(comment: LeafComment(id: c.id, body: c.body, author: c.author, createdAt: c.createdAt), look: look)
                }
                .id(c.id)
                .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
                .gesture(DragGesture(minimumDistance: 24).onEnded { g in
                    withAnimation(.easeOut(duration: 0.3)) {
                        if g.translation.width < -40 { shown = min(here.count - 1, i + 1) }
                        if g.translation.width > 40 { shown = max(0, i - 1) }
                    }
                })
                .accessibilityAction(named: "Next comment") { shown = min(here.count - 1, i + 1) }
                .accessibilityAction(named: "Previous comment") { shown = max(0, i - 1) }
                // Replies: at most three levels deep (Steve, 2026-10-29).
                if depth < 3 {
                    AnyView(CommentLevel(card: card, all: all, parent: c.id, depth: depth + 1, look: look, wording: wording, onOpen: onOpen))
                }
            }
        }
    }

    /// A comment's own icons: a heart, reply, and where it sits in the stack.
    private func icons(_ c: Comment, _ i: Int) -> some View {
        let color = Color(look.branch)
        return HStack(spacing: 18) {
            Button {
                let on = !hearted.contains(c.id)
                if on { hearted.insert(c.id) } else { hearted.remove(c.id) }
                Task { _ = try? await model.store.api.heartComment(c.id, on: on) }
            } label: {
                NeonButtonGlyph(symbol: "heart", color: color, size: 34, action: .wellWishes)
                    .background(hearted.contains(c.id) ? color.opacity(0.25) : .clear, in: .capsule)
            }
            .accessibilityLabel("Heart")
            .accessibilityAddTraits(hearted.contains(c.id) ? .isSelected : [])
            Button { onOpen?(card) } label: { NeonButtonGlyph(symbol: "arrowshape.turn.up.left", color: color, size: 34, tron: TronIcon.reply) }
                .accessibilityLabel("Reply")
            Spacer()
            if here.count > 1 {
                Text("\(i + 1) of \(here.count)").font(.caption.monospacedDigit().bold()).foregroundStyle(.white)
                    .shadow(color: color, radius: 4)
                    .accessibilityHidden(true)
            }
        }
        .buttonStyle(.plain)
    }
}

/// Moonlit Gate's drawn gate at the top of the feed: two pillars, an arch, a ring of stars and a crescent moon.
struct GateTop: View {
    let look: VineLook
    var body: some View {
        Canvas { ctx, size in
            let line = GraphicsContext.Shading.color(Color(look.stem))
            // Explicit CGFloat keeps the type checker fast (older Xcode gives up on the mixed form).
            let h: CGFloat = size.height
            let w: CGFloat = min(size.width - 40, 260)
            let x0: CGFloat = (size.width - w) / 2
            var arch = Path()
            arch.move(to: CGPoint(x: x0, y: h))
            arch.addLine(to: CGPoint(x: x0, y: h * 0.45))
            arch.addQuadCurve(to: CGPoint(x: x0 + w, y: h * 0.45), control: CGPoint(x: x0 + w / 2, y: -h * 0.15))
            arch.addLine(to: CGPoint(x: x0 + w, y: h))
            ctx.stroke(arch, with: line, lineWidth: 1.2)
            ctx.stroke(arch.offsetBy(dx: 0, dy: 8), with: line, lineWidth: 0.6)
            for i in 0..<9 {
                let a: CGFloat = .pi * (0.1 + 0.8 * CGFloat(i) / 8)
                let px: CGFloat = x0 + w / 2 - cos(a) * w * 0.38
                let py: CGFloat = h * 0.42 - sin(a) * h * 0.32
                let pt = CGPoint(x: px, y: py)
                ctx.fill(Path(ellipseIn: CGRect(x: pt.x - 1.5, y: pt.y - 1.5, width: 3, height: 3)), with: .color(Color(look.tendril)))
            }
            var moon = Path(ellipseIn: CGRect(x: size.width - 60, y: 10, width: 26, height: 26))
            moon = moon.subtracting(Path(ellipseIn: CGRect(x: size.width - 53, y: 6, width: 26, height: 26)))
            ctx.fill(moon, with: line)
        }
        .accessibilityHidden(true)
    }
}

/// Neon Cinderella's tube drawings between requests, from SF Symbols for now (the Expo app draws its own castle, coach and slipper).
struct NeonScene: View {
    let kind: NeonSceneKind
    let look: VineLook

    var body: some View {
        let box = NeonSceneKind.box
        Canvas { ctx, size in
            ctx.translateBy(x: (size.width - box.width) / 2 - box.x, y: -box.y)
            if let h = kind.halo {
                let ring = Path(ellipseIn: CGRect(x: h.cx - h.r, y: h.cy - h.r, width: h.r * 2, height: h.r * 2))
                ctx.stroke(ring, with: .color(Color(look.stem).opacity(0.25)), lineWidth: 10)
            }
            for tube in kind.tubes {
                let color = Color(tube.ink == .accent ? look.leaf : look.stem)
                let path = Path(tube.ops)
                // A wide faint bloom, a halo, the tube, and a white-hot core (`Rod` in vine-flow.tsx).
                for (c, w) in [(color.opacity(0.14), tube.width + 14), (color.opacity(0.35), tube.width + 6), (color, tube.width),
                               (Color.white.opacity(0.85), max(0.8, tube.width / 3))] {
                    ctx.stroke(path, with: .color(c), style: StrokeStyle(lineWidth: w, lineCap: .round, lineJoin: .round))
                }
            }
        }
        .frame(height: box.height)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .accessibilityHidden(true)
    }
}

extension Path {
    /// A SwiftUI path from a scene's drawing steps.
    init(_ ops: [PathOp]) {
        self.init()
        for op in ops {
            switch op {
            case let .move(x, y): move(to: CGPoint(x: x, y: y))
            case let .line(x, y): addLine(to: CGPoint(x: x, y: y))
            case let .quad(x, y, cx, cy): addQuadCurve(to: CGPoint(x: x, y: y), control: CGPoint(x: cx, y: cy))
            case let .cubic(x, y, c1x, c1y, c2x, c2y):
                addCurve(to: CGPoint(x: x, y: y), control1: CGPoint(x: c1x, y: c1y), control2: CGPoint(x: c2x, y: c2y))
            case .close: closeSubpath()
            }
        }
    }
}

// MARK: - Wall

/// One post per screen on a dark backdrop, with a hard snap per swipe, like a short-video app.
struct WallFeed<Row: View>: View {
    let look: WallLook
    let cards: [Card]
    let words: LayoutWords
    @ViewBuilder let row: (Card) -> Row
    let onEnd: () async -> Void

    var body: some View {
        ScrollView(.vertical) {
            LazyVStack(spacing: 0) {
                ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                    ScrollView {
                        VStack(spacing: 12) {
                            row(card)
                            // "Post 2 of 9", and on the first post how to reach the next. The words shown
                            // are the words read, so nothing reads as cut off.
                            Text(words.wallPosition(i + 1, of: cards.count) + (i == 0 ? " · \(words.wallSwipe)" : ""))
                                .font(.footnote)
                                .foregroundStyle(Color.subtle)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .backdropPlate(look.backdrop)
                        .padding(24)
                    }
                        .scrollBounceBehavior(.basedOnSize)
                        .containerRelativeFrame([.horizontal, .vertical])
                        .task { if card.id == cards.last?.id { await onEnd() } }
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .background(Color(look.backdrop))
        .environment(\.colorScheme, BackdropText(on: look.backdrop).light ? .dark : .light)
    }
}

// MARK: - Prayer Tower / Climbing Tower

/// One request per floor, carved on a stone tablet between two drawn stone walls, with its
/// newest comments on smaller sub-tablets hung below. The climber rises a floor per request.
struct TowerFeed<Row: View>: View {
    let look: TowerLook
    let cards: [Card]
    let wording: Wording
    var hasMore = true
    @ViewBuilder let row: (Card) -> Row
    let onEnd: () async -> Void
    @State private var floor: String?
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 28) {
                Battlements(look: look).frame(height: 28).accessibilityHidden(true)
                ForEach(cards) { card in
                    VStack(spacing: 10) {
                        Tablet(look: look, wording: wording, small: false) { row(card) }
                        ForEach(card.leafComments ?? []) { c in
                            Tablet(look: look, wording: wording, small: true) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(c.author.displayName).font(.caption.bold())
                                    Text(c.body).font(.callout)
                                }
                                .accessibilityElement(children: .combine)
                            }
                            .padding(.horizontal, 28)
                        }
                    }
                    .padding(.horizontal, 34)
                    .id(card.id)
                    .task { if card.id == cards.last?.id { await onEnd() } }
                }
                if !hasMore, !cards.isEmpty {
                    Label(LayoutWords(wording).towerTop, systemImage: "flag.fill").font(.headline).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true).onBackdrop(look.backdrop).padding(.horizontal, 34).padding(.top, 24).padding(.bottom, 160)
                }
            }
            .scrollTargetLayout()
            .padding(.vertical, 12)
        }
        .scrollPosition(id: $floor, anchor: .top)
        .safeAreaInset(edge: .bottom) {
            if let n = cards.firstIndex(where: { $0.id == floor }) ?? (cards.isEmpty ? nil : 0) {
                // A solid strip along the bottom, like a toolbar, so the words scroll under it
                // rather than showing through round a floating label.
                Text(LayoutWords(wording).towerFloor(n + 1, of: cards.count))
                    .font(.footnote.bold())
                    .foregroundStyle(Color(RGB.commentText))
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity)
                    .background(Color(RGB(hex: "#FBFAF7")!))
            }
        }
        .background { StoneWalls(look: look).accessibilityHidden(true) }
        .background(Color(look.backdrop))
        .overlay(alignment: .trailing) {
            // The climber on a rope, rising as the member reads down the tower.
            let index = Double(cards.firstIndex { $0.id == floor } ?? 0)
            VStack(spacing: 0) {
                Rectangle().fill(Color(look.mortar)).frame(width: 2, height: max(20, 200 - index * 24))
                // Kept to the wall's width, so it never hangs over a tablet.
                DecorativeGlyph(glyph: look.climber, size: 22, maxScale: 1)
            }
            .frame(maxHeight: .infinity, alignment: .top)
            .padding(.trailing, 4)
            .animation(still ? nil : .spring(duration: 0.6), value: index)
            .accessibilityHidden(true)
        }
        .environment(\.colorScheme, .light)
    }
}

/// A stone tablet: a rounded top, a square foot and a pale smoothed face that keeps 4.5:1.
struct Tablet<Content: View>: View {
    let look: TowerLook
    let wording: Wording
    let small: Bool
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(small ? 10 : 14)
            .padding(.top, small ? 10 : 22)
            .background(Color(look.face(wording)), in: ArchTop(rise: 0.08))
            .padding(small ? 4 : 6)
            .background(Color(look.stone), in: ArchTop(rise: 0.08))
            .overlay(alignment: .top) {
                if small {
                    // The short iron chain it hangs from.
                    Rectangle().fill(Color(look.mortar)).frame(width: 2, height: 10).offset(y: -10).accessibilityHidden(true)
                }
            }
    }
}

/// Courses of dressed stone down both sides, each block a slightly different shade.
struct StoneWalls: View {
    let look: TowerLook
    var body: some View {
        Canvas { ctx, size in
            let wall = 26.0, course = 18.0
            for (side, x0) in [(0, 0.0), (1, size.width - wall)] {
                var row = 0
                var y = 0.0
                while y < size.height {
                    let shift = row.isMultiple(of: 2) ? 0.0 : wall / 2
                    var x = x0 - shift
                    var n = side * 7 + row * 3
                    while x < x0 + wall {
                        let shadeBy = Double((n * 37) % 9) / 60
                        let block = CGRect(x: max(x, x0), y: y, width: min(x + wall, x0 + wall) - max(x, x0) - 1.5, height: course - 1.5)
                        ctx.fill(Path(block), with: .color(Color(look.stone.mix(.white, shadeBy))))
                        x += wall
                        n += 1
                    }
                    var joint = Path()
                    joint.move(to: CGPoint(x: x0, y: y + course - 0.75))
                    joint.addLine(to: CGPoint(x: x0 + wall, y: y + course - 0.75))
                    ctx.stroke(joint, with: .color(Color(look.mortar)), lineWidth: 1.5)
                    y += course
                    row += 1
                }
            }
        }
    }
}

struct Battlements: View {
    let look: TowerLook
    var body: some View {
        Canvas { ctx, size in
            var x = 0.0
            while x < size.width {
                ctx.fill(Path(CGRect(x: x, y: 0, width: 18, height: size.height)), with: .color(Color(look.stone)))
                x += 30
            }
            ctx.fill(Path(CGRect(x: 0, y: size.height - 8, width: size.width, height: 8)), with: .color(Color(look.mortar)))
        }
    }
}

// MARK: - Neon Circuit

/// Each post glows inside its own screen, tilted left or right; one live wire runs down the
/// edge with a tap into each screen, and gentle bursts of light travel down it.
struct CircuitFeed<Row: View>: View {
    let look: CircuitLook
    let cards: [Card]
    let words: LayoutWords
    var hasMore = true
    @ViewBuilder let row: (Card) -> Row
    let onEnd: () async -> Void
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 36) {
                ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                    row(card)
                        .padding(16)
                        // Only the screen's glass and frame lean; the words stay flat, so none are
                        // squeezed or cut off at an angle.
                        .background {
                            // A plain screen for the words, framed by one neon tube bent in smooth curves.
                            ZStack {
                                NeonFrame(radius: 10)
                                    .fill(BackdropText(on: look.backdrop).plate ? Color.pageBackground : Color(look.backdrop))
                                    .padding(3)
                                ConnectorOutline(shape: NeonFrame(radius: 10), look: NeonGlassLook(color: Color(look.screen)), width: 7)
                                    .rotation3DEffect(.degrees(look.lean(i)), axis: (x: 0, y: 1, z: 0), perspective: 0.5)
                            }
                            .accessibilityHidden(true)
                        }
                        // Text in the card's own scheme: light words on a dark screen, never the system's dark ones.
                        .environment(\.colorScheme, BackdropText(on: look.backdrop).light ? .dark : .light)
                        .padding(.leading, 18)
                        .padding(.trailing, 40)
                        .overlay(alignment: .trailing) {
                            // The tap from the live wire into this screen.
                            Rectangle().fill(Color(look.wire)).frame(width: 28, height: 2).padding(.trailing, 12).neonTube(Color(look.wire)).accessibilityHidden(true)
                        }
                        .task { if card.id == cards.last?.id { await onEnd() } }
                }
                if !hasMore, !cards.isEmpty {
                    VStack(spacing: 8) {
                        ConnectorOutline(shape: NeonFrame(radius: 4), look: NeonGlassLook(color: Color(look.wire)), width: 5).frame(width: 18, height: 18).accessibilityHidden(true)
                        Text(words.circuitEnd).font(.footnote).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true).backdropPlate(look.backdrop)
                    }
                    .padding(.trailing, 40)
                    .padding(.bottom, 160)
                }
            }
            .padding(.vertical, 24)
            .background(alignment: .trailing) {
                ZStack(alignment: .top) {
                    Rectangle().fill(Color(look.wire)).frame(width: 2).neonTube(Color(look.wire))
                    if !still { Spark(color: Color(look.burst)).offset(x: -18).frame(width: 40) }
                }
                .frame(width: 40)
                .padding(.trailing, 12)
                .accessibilityHidden(true)
            }
        }
        .background(Color(look.backdrop))
        .environment(\.colorScheme, BackdropText(on: look.backdrop).light ? .dark : .light)
    }
}

extension View {
    /// A plate behind text on a backdrop where neither light nor dark text reads well enough
    /// (`BackdropText`); nothing on the usual backdrops.
    func backdropPlate(_ backdrop: RGB?) -> some View {
        let plate = backdrop.map { BackdropText(on: $0).plate } ?? false
        return padding(plate ? 8 : 0).background { if plate { RoundedRectangle(cornerRadius: 10).fill(Color.pageBackground) } }
    }

    /// Text on a backdrop inside a view that has its own color scheme (the tower keeps the light
    /// one for its tablets): the text's own scheme, and a plate when it needs one.
    func onBackdrop(_ backdrop: RGB) -> some View {
        backdropPlate(backdrop).environment(\.colorScheme, BackdropText(on: backdrop).light ? .dark : .light)
    }
}

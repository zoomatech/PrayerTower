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

    var body: some View {
        switch theme.kind {
        case .vine: VineFeed(look: VineLook(theme), cards: cards, wording: wording, row: row, onEnd: onEnd, onOpen: onOpen)
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

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 44) {
                if look.vineStyle == .gate { GateTop(look: look).frame(height: 150).frame(maxWidth: .infinity) }
                ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                    VStack(alignment: .leading, spacing: 18) {
                        VineLeaf(look: look, wording: wording, depth: 0) { row(card) }
                        ForEach(card.leafComments ?? []) { c in
                            VineLeaf(look: look, wording: wording, depth: 1) { LeafCommentText(comment: c, look: look) }
                        }
                        if card.moreComments > 0 {
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
                    .foregroundStyle(Color(look.tipColor))
                    .padding(.leading, 44)
                    .padding(.bottom, 40)
            }
            .padding(.vertical, 20)
            .background(alignment: .topLeading) { Stalk(look: look).frame(width: 40).accessibilityHidden(true) }
        }
        .background(look.backdrop.map { Color($0) } ?? Color(.systemBackground))
        .environment(\.colorScheme, look.backdrop?.isDark == true ? .dark : .light)
    }
}

/// The stalk, drawn the whole height of the feed. Its style follows `vineStyle`.
struct Stalk: View {
    let look: VineLook
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
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
                // Straight glowing rods: a wide faint bloom, a halo and a thin white core.
                var rod = Path()
                rod.move(to: CGPoint(x: x, y: 0))
                rod.addLine(to: CGPoint(x: x, y: size.height))
                ctx.stroke(rod, with: .color(Color(look.stem).opacity(0.25)), lineWidth: w * 5)
                ctx.stroke(rod, with: .color(Color(look.stem).opacity(0.7)), lineWidth: w * 2)
                ctx.stroke(rod, with: .color(.white), lineWidth: max(1, w / 2))
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
        .shadow(color: look.stemGlow ? Color(look.stem).opacity(0.8) : .clear, radius: look.stemGlow ? 8 : 0)
        .overlay(alignment: .top) { if look.vineStyle == .neon && !still { Spark(color: Color(look.tendril)) } }
    }
}

/// A spark with a fading tail running down Neon Cinderella's rod, again and again.
struct Spark: View {
    let color: Color
    var body: some View {
        TimelineView(.animation) { t in
            GeometryReader { geo in
                let y = (t.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 4) / 4) * min(geo.size.height, 2400)
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
    @ViewBuilder let content: () -> Content

    var body: some View {
        let box = Color(look.leafBox(wording))
        content()
            .padding(depth == 0 ? 14 : 10)
            .background(box, in: .rect(cornerRadius: 12))
            .overlay {
                if look.vineStyle == .ink { RoundedRectangle(cornerRadius: 12).stroke(Color(look.ink ?? look.branch), lineWidth: 1.5) }
            }
            .padding(.horizontal, depth == 0 ? 18 : 14)
            .padding(.vertical, depth == 0 ? 40 : 26)
            .background { frame.accessibilityHidden(true) }
            .environment(\.colorScheme, .light)
            .padding(.leading, depth == 0 ? 36 : 64)
            .padding(.trailing, 8)
            .overlay(alignment: .leading) { twig.accessibilityHidden(true) }
    }

    /// What houses the box: a leaf, a neon frame, an arched doorway or a petal frame.
    @ViewBuilder private var frame: some View {
        switch look.vineStyle {
        case .neon:
            CutCorners().stroke(Color(look.stem), lineWidth: 2).neonTube(Color(look.stem))
        case .gate:
            ArchTop().stroke(Color(look.stem), lineWidth: 1.2).overlay(alignment: .top) {
                Image(systemName: "sparkle").font(.caption).foregroundStyle(Color(look.tendril)).offset(y: -6)
            }
        case .floral:
            Scallop().fill(Color(look.leaf).opacity(0.55))
        default:
            ZStack {
                LeafOutline(shape: look.leafShape).fill(Color(look.leaf))
                LeafVeins().stroke(Color(look.branch).opacity(0.45), lineWidth: 1)
                if look.vineStyle == .ink { LeafOutline(shape: look.leafShape).stroke(Color(look.ink ?? look.branch), lineWidth: 1.5) }
            }
        }
    }

    /// The short curved stem from the stalk to this leaf.
    private var twig: some View {
        Canvas { ctx, size in
            var p = Path()
            let reach = depth == 0 ? 40.0 : 68.0
            p.move(to: CGPoint(x: 20, y: size.height * 0.2))
            p.addQuadCurve(to: CGPoint(x: reach, y: size.height * 0.42), control: CGPoint(x: 22, y: size.height * 0.4))
            ctx.stroke(p, with: .color(Color(look.lit ? look.stem : look.branch)), style: .init(lineWidth: max(1.5, look.stemWidth / 3), lineCap: .round))
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
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            if look.vineStyle != .floral { Mark(shape: look.leafShape, color: Color(look.leaf), center: Color(look.tendril)) }
            VStack(alignment: .leading, spacing: 2) {
                Text(comment.author.displayName).font(.caption.bold())
                Text(comment.body).font(.callout)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Moonlit Gate's drawn gate at the top of the feed: two pillars, an arch, a ring of stars and a crescent moon.
struct GateTop: View {
    let look: VineLook
    var body: some View {
        Canvas { ctx, size in
            let line = GraphicsContext.Shading.color(Color(look.stem))
            let w = min(size.width - 40, 260.0), x0 = (size.width - w) / 2
            var arch = Path()
            arch.move(to: CGPoint(x: x0, y: size.height))
            arch.addLine(to: CGPoint(x: x0, y: size.height * 0.45))
            arch.addQuadCurve(to: CGPoint(x: x0 + w, y: size.height * 0.45), control: CGPoint(x: x0 + w / 2, y: -size.height * 0.15))
            arch.addLine(to: CGPoint(x: x0 + w, y: size.height))
            ctx.stroke(arch, with: line, lineWidth: 1.2)
            ctx.stroke(arch.offsetBy(dx: 0, dy: 8), with: line, lineWidth: 0.6)
            for i in 0..<9 {
                let a = Double.pi * (0.1 + 0.8 * Double(i) / 8)
                let pt = CGPoint(x: x0 + w / 2 - cos(a) * w * 0.38, y: size.height * 0.42 - sin(a) * size.height * 0.32)
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
                            // "2 / 9", and on the first post how to reach the next.
                            Text("\(i + 1) / \(cards.count)" + (i == 0 ? " · \(words.wallSwipe)" : ""))
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .accessibilityLabel(words.wallPosition(i + 1, of: cards.count))
                        }
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
        .environment(\.colorScheme, look.backdrop.isDark ? .dark : .light)
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
                    Text("🚩 " + LayoutWords(wording).towerTop).font(.headline).padding(.vertical, 24)
                }
            }
            .scrollTargetLayout()
            .padding(.vertical, 12)
        }
        .scrollPosition(id: $floor, anchor: .top)
        .safeAreaInset(edge: .bottom) {
            if let n = cards.firstIndex(where: { $0.id == floor }) ?? (cards.isEmpty ? nil : 0) {
                Text(LayoutWords(wording).towerFloor(n + 1, of: cards.count))
                    .font(.footnote.bold())
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(.regularMaterial, in: .capsule)
                    .padding(.bottom, 6)
            }
        }
        .background { StoneWalls(look: look).accessibilityHidden(true) }
        .background(Color(look.backdrop))
        .overlay(alignment: .trailing) {
            // The climber on a rope, rising as the member reads down the tower.
            let index = Double(cards.firstIndex { $0.id == floor } ?? 0)
            VStack(spacing: 0) {
                Rectangle().fill(Color(look.mortar)).frame(width: 2, height: max(20, 200 - index * 24))
                Text(look.climber).font(.title)
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
                        .background(Color(look.backdrop).opacity(0.92), in: .rect(cornerRadius: 10))
                        .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color(look.screen), lineWidth: 2).neonTube(Color(look.screen)).accessibilityHidden(true) }
                        .rotation3DEffect(.degrees(look.lean(i)), axis: (x: 0, y: 1, z: 0), perspective: 0.5)
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
                        Circle().stroke(Color(look.wire), lineWidth: 2).frame(width: 18, height: 18).neonTube(Color(look.wire)).accessibilityHidden(true)
                        Text(words.circuitEnd).font(.footnote).multilineTextAlignment(.center)
                    }
                    .padding(.trailing, 40)
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
        .environment(\.colorScheme, .dark)
    }
}

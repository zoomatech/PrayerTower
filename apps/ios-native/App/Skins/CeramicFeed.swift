import PrayerTowerKit
import SwiftUI

// Ceramic Figurines (apps/mobile/src/layouts/ceramic.tsx), Steve 2026-10-31, the "elegant retired lady version":
//   - Each post is a pastel, unglazed ceramic plaque with an etched edge, set in a shadow box, standing on a platform.
//   - Angel figurines are workmen hauling each platform up toward heaven with fancy ropes and shiny white pulleys.
//   - When a post is centred, its angel stops hauling, turns and presents it like a game-show host.
//   - A still statue points at every third post; now and then an angel flies to the centred post;
//     a ceramic turtle walks slowly across behind the posts; clouds drift in the sky above some posts.
//   - Comments hang under the platform on ceramic placards tied together. Closed, only the first comment's first
//     line shows, the rest stacked behind it. A tap flops them all down; a tap on one folds them back up.
//   - The first reply hangs showing under every comment that has replies; a tap flops the rest down, a tap on a
//     reply folds them. Replies get no Reply button (Steve: overnesting is hard to follow).
//   - Members pick their own figurines. The feed scrolls only up and down. Reduce Motion stills everything.

private enum CeramicDraw {
    static let figW: CGFloat = 46
    static let figH: CGFloat = 77
    static let ropeIn: CGFloat = 38
    static let boxIn: CGFloat = 50
    static let platformIn: CGFloat = 26
    static let wheel: CGFloat = 13
    static let rope = Color(RGB(hex: "#D9AF88")!)
    static let ropeLight = Color(RGB(hex: "#F6E7D3")!)
    static let pulleyLine = Color(RGB(hex: "#B9AEB6")!)

    /// The ropes for a row `w` wide (`ropeGeometry()` in ceramic.tsx).
    struct Ropes {
        let cx: CGFloat, angelX: CGFloat, pointX: CGFloat, handX: CGFloat, handY: CGFloat
        let haulFrom: CGFloat, loadX: CGFloat, tailX: CGFloat, ropeL: CGFloat, ropeR: CGFloat
    }

    static func ropes(left: Bool, w: CGFloat) -> Ropes {
        let cx: CGFloat = w / 2
        let angelX: CGFloat = left ? 4 : w - 4 - figW
        let handX: CGFloat = left ? angelX + figW * 0.82 : angelX + figW * 0.18
        return Ropes(cx: cx, angelX: angelX, pointX: left ? w - 4 - figW : 4, handX: handX, handY: 22 + figH * 0.38,
                     haulFrom: left ? cx - wheel : cx + wheel, loadX: left ? cx + wheel - 1 : cx - wheel + 1,
                     tailX: left ? handX - 6 : handX + 6, ropeL: ropeIn + 2, ropeR: w - ropeIn - 2)
    }
}

struct CeramicFeed<Row: View>: View {
    let look: CeramicLook
    let cards: [Card]
    let wording: Wording
    let hooks: FeedHooks
    @ViewBuilder let row: (Card) -> Row
    @AppStorage(Ceramic.choiceKey) private var choiceRaw = "mix"
    @State private var centred: String?
    @State private var picking = false
    @State private var flight: CeramicFlight?
    @State private var flights = 0
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        let words = Words(wording)
        let choice = Ceramic.Figure(rawValue: choiceRaw)
        GeometryReader { geo in
            let lane: CGFloat = min(geo.size.width, 560)
            ZStack {
                if !still { CeramicTurtle(width: geo.size.width).frame(maxHeight: .infinity, alignment: .bottom).padding(.bottom, 90) }
                ScrollView(.vertical) {
                    LazyVStack(spacing: 22) {
                        pickButton(words, choice)
                        ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                            CeramicPost(card: card, index: i, width: lane, look: look, choice: choice,
                                        presenting: !still && centred == card.id, words: words, hooks: hooks, row: row)
                                .id(card.id)
                                .loadsMore(after: card, in: cards, hooks)
                        }
                        if !hooks.hasMore, !cards.isEmpty {
                            Text(words("ceramic.end"))
                                .font(.system(size: 15, design: .serif).italic())
                                .foregroundStyle(Color(Ceramic.muted))
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 24)
                                .padding(.bottom, 40)
                        }
                    }
                    .scrollTargetLayout()
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                }
                .scrollPosition(id: $centred, anchor: .center)
                if let flight, !still {
                    CeramicFlyer(flight: flight, size: geo.size) { self.flight = nil }
                        .id(flight.id)
                        .allowsHitTesting(false)
                }
            }
        }
        .background(Color(look.backdrop))
        .environment(\.colorScheme, .light)
        .sheet(isPresented: $picking) { CeramicPicker(choiceRaw: $choiceRaw, words: words) }
        .onChange(of: centred) { old, new in
            // Now and then (every other change of the centred post) an angel flies to it from the post that left.
            guard !still, let old, let new, old != new,
                  let from = cards.firstIndex(where: { $0.id == old }), let to = cards.firstIndex(where: { $0.id == new }) else { return }
            flights += 1
            if flights % 2 == 1 { flight = CeramicFlight(fromTop: to > from, left: Ceramic.angelOnLeft(to)) }
        }
    }

    private func pickButton(_ words: Words, _ choice: Ceramic.Figure?) -> some View {
        Button { picking = true } label: {
            Text(words("ceramic.pick", ["name": words("ceramic.looks.\(choice?.rawValue ?? "mix")")]))
                .font(.system(size: 14, weight: .semibold, design: .serif))
                .foregroundStyle(Color(look.ink))
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(Color(look.placard), in: .capsule)
                .overlay(Capsule().stroke(Color(look.recess), lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("ceramic-pick")
    }
}

// MARK: - One post

private struct CeramicPost<Row: View>: View {
    let card: Card
    let index: Int
    let width: CGFloat
    let look: CeramicLook
    let choice: Ceramic.Figure?
    let presenting: Bool
    let words: Words
    let hooks: FeedHooks
    let row: (Card) -> Row
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        let left = Ceramic.angelOnLeft(index)
        let g = CeramicDraw.ropes(left: left, w: width)
        VStack(spacing: 0) {
            CeramicSky(index: index, width: width, left: left, ropes: g, look: look, choice: choice, presenting: presenting)
                .frame(width: width, height: Ceramic.top)
                .accessibilityHidden(true)
            shadowBox(g)
            platform
            CeramicPlacards(card: card, look: look, words: words, hooks: hooks)
                .padding(.horizontal, CeramicDraw.platformIn + 14)
        }
        .frame(width: width)
        .frame(maxWidth: .infinity)
    }

    /// The plaque in its shadow box, hung between the two side ropes.
    private func shadowBox(_ g: CeramicDraw.Ropes) -> some View {
        let tint = Ceramic.tint(index)
        return row(card)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(tint), in: .rect(cornerRadius: 10))
            // The etched line just inside the plaque's edge.
            .overlay(RoundedRectangle(cornerRadius: 7).inset(by: 4).stroke(Color(look.ink).opacity(0.22), lineWidth: 1).accessibilityHidden(true))
            .padding(7)
            .background(Color(look.recess), in: .rect(cornerRadius: 13))
            .padding(6)
            .background(Color(look.frame), in: .rect(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(look.ink).opacity(0.12), lineWidth: 1))
            .shadow(color: Color(RGB(hex: "#503C46")!).opacity(0.22), radius: 9, x: 0, y: 5)
            .padding(.horizontal, CeramicDraw.boxIn)
            .background {
                // The two side ropes running from the bridle down past the box to the platform.
                ZStack(alignment: .topLeading) {
                    sideRope.offset(x: g.ropeL - 2)
                    sideRope.offset(x: g.ropeR - 2)
                }
                .frame(width: width, alignment: .topLeading)
                .accessibilityHidden(true)
            }
    }

    private var sideRope: some View {
        Rectangle().fill(CeramicDraw.rope).frame(width: 4)
            .overlay(alignment: .leading) { Rectangle().fill(CeramicDraw.ropeLight).frame(width: 1.5) }
            .clipShape(.capsule)
    }

    private var platform: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Color(look.platform).opacity(0.8)).frame(height: 6)
            UnevenRoundedRectangle(bottomLeadingRadius: 12, bottomTrailingRadius: 12)
                .fill(Color(look.platform))
                .frame(height: 16)
                .shadow(color: Color(RGB(hex: "#503C46")!).opacity(0.22), radius: 10, x: 0, y: 6)
        }
        .padding(.horizontal, CeramicDraw.platformIn)
        .accessibilityHidden(true)
    }
}

/// The band of sky above a platform: an occasional cloud, the white pulley with its spinning spokes,
/// the ropes, the hauling (or presenting) angel and, at every third post, a still pointing statue.
private struct CeramicSky: View {
    let index: Int
    let width: CGFloat
    let left: Bool
    let ropes: CeramicDraw.Ropes
    let look: CeramicLook
    let choice: Ceramic.Figure?
    let presenting: Bool
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        let g = ropes
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: still || presenting)) { tl in
            let t: Double = tl.date.timeIntervalSinceReferenceDate
            let pull: CGFloat = (still || presenting) ? 0 : CGFloat(sin(t * 2.2)) * 3
            ZStack(alignment: .topLeading) {
                Canvas { ctx, _ in
                    if index % 3 != 2 {
                        let cloudX: CGFloat = index % 2 == 0 ? width - 120 : 8
                        cloud(&ctx, x: cloudX + CGFloat(sin(t / 9 + Double(index))) * 6, y: 6)
                    }
                    // Pulley mount, then the hauling rope, its tasselled tail, the load rope and the bridle.
                    ctx.fill(Path(roundedRect: CGRect(x: g.cx - 4, y: 12, width: 8, height: 14), cornerRadius: 2), with: .color(.white))
                    ctx.stroke(Path(roundedRect: CGRect(x: g.cx - 4, y: 12, width: 8, height: 14), cornerRadius: 2), with: .color(CeramicDraw.pulleyLine), lineWidth: 1)
                    var haul = Path()
                    haul.move(to: CGPoint(x: g.haulFrom, y: 27))
                    haul.addLine(to: CGPoint(x: g.handX, y: g.handY + pull))
                    haul.addLine(to: CGPoint(x: g.tailX, y: g.handY + 3.5 + pull))
                    let sway: CGFloat = left ? -7 : 7, drop: CGFloat = left ? -3 : 3
                    haul.addQuadCurve(to: CGPoint(x: g.tailX + drop, y: g.handY + 26 + pull), control: CGPoint(x: g.tailX + sway, y: g.handY + 14 + pull))
                    rope(&ctx, haul)
                    var tassel = Path()
                    tassel.move(to: CGPoint(x: g.tailX + drop, y: g.handY + 25 + pull))
                    tassel.addLine(to: CGPoint(x: g.tailX + drop - 3.5, y: g.handY + 34 + pull))
                    tassel.addLine(to: CGPoint(x: g.tailX + drop + 3.5, y: g.handY + 34 + pull))
                    tassel.closeSubpath()
                    ctx.fill(tassel, with: .color(Color(RGB(hex: "#E6CFA0")!)))
                    var load = Path()
                    load.move(to: CGPoint(x: g.loadX, y: 27))
                    load.addLine(to: CGPoint(x: g.loadX, y: 84))
                    rope(&ctx, load)
                    ctx.stroke(Path(ellipseIn: CGRect(x: g.loadX - 4, y: 84, width: 8, height: 8)), with: .color(Color(RGB(hex: "#C9A66B")!)), lineWidth: 2)
                    var bridle = Path()
                    bridle.move(to: CGPoint(x: g.loadX, y: 92)); bridle.addLine(to: CGPoint(x: g.ropeL, y: Ceramic.top))
                    bridle.move(to: CGPoint(x: g.loadX, y: 92)); bridle.addLine(to: CGPoint(x: g.ropeR, y: Ceramic.top))
                    rope(&ctx, bridle)
                    // The shiny white wheel with a soft highlight.
                    let wheel = Path(ellipseIn: CGRect(x: g.cx - CeramicDraw.wheel, y: 27 - CeramicDraw.wheel, width: CeramicDraw.wheel * 2, height: CeramicDraw.wheel * 2))
                    ctx.fill(wheel, with: .color(.white))
                    ctx.stroke(wheel, with: .color(CeramicDraw.pulleyLine), lineWidth: 1.2)
                    ctx.fill(Path(ellipseIn: CGRect(x: g.cx - 8, y: 18, width: 7, height: 4)), with: .color(Color(RGB(hex: "#F4F1F6")!)))
                    // Spokes turn while the angel hauls.
                    let turn: Double = (still || presenting) ? 0 : t * 1.6
                    for k in 0..<6 {
                        let a: Double = turn + Double(k) * .pi / 3
                        var s = Path()
                        s.move(to: CGPoint(x: g.cx, y: 27))
                        s.addLine(to: CGPoint(x: g.cx + CGFloat(cos(a)) * 9, y: 27 + CGFloat(sin(a)) * 9))
                        ctx.stroke(s, with: .color(CeramicDraw.pulleyLine), lineWidth: 1)
                    }
                    ctx.fill(Path(ellipseIn: CGRect(x: g.cx - 2.5, y: 24.5, width: 5, height: 5)), with: .color(Color(RGB(hex: "#E6CFA0")!)))
                }
                CeramicFigurine(figure: Ceramic.figure(choice, index: index, slot: 0), pose: presenting ? .present : .pull, flip: presenting ? left : !left)
                    .frame(width: CeramicDraw.figW, height: CeramicDraw.figH)
                    .rotationEffect(.degrees(Double(pull) * (left ? -1 : 1)), anchor: .bottom)
                    .offset(x: g.angelX, y: 22)
                    .animation(still ? nil : .spring(duration: 0.8), value: presenting)
                    .accessibilityIdentifier(presenting ? "ceramic-presenting" : "ceramic-angel")
                if Ceramic.pointer(at: index) {
                    CeramicFigurine(figure: Ceramic.figure(choice, index: index, slot: 1), pose: .point, flip: !left)
                        .frame(width: CeramicDraw.figW, height: CeramicDraw.figH)
                        .offset(x: g.pointX, y: 30)
                }
            }
        }
    }

    private func rope(_ ctx: inout GraphicsContext, _ p: Path) {
        ctx.stroke(p, with: .color(CeramicDraw.rope), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
        ctx.stroke(p, with: .color(CeramicDraw.ropeLight), style: StrokeStyle(lineWidth: 1, lineCap: .round, lineJoin: .round, dash: [3, 3]))
    }

    private func cloud(_ ctx: inout GraphicsContext, x: CGFloat, y: CGFloat) {
        var p = Path()
        for (dx, dy, r) in [(16.0, 26.0, 13.0), (36.0, 16.0, 17.0), (60.0, 18.0, 15.0), (82.0, 27.0, 12.0)] as [(CGFloat, CGFloat, CGFloat)] {
            p.addEllipse(in: CGRect(x: x + dx - r, y: y + dy - r, width: r * 2, height: r * 2))
        }
        p.addRoundedRect(in: CGRect(x: x + 4, y: y + 22, width: 92, height: 18), cornerSize: CGSize(width: 9, height: 9))
        ctx.fill(p, with: .color(.white.opacity(0.85)))
    }
}

// MARK: - The figurines

/// A little unglazed statuette: a big head, a small body, rosy cheeks and angel wings, on a ceramic base.
struct CeramicFigurine: View {
    enum Pose { case pull, present, point, sit }
    let figure: Ceramic.Figure
    let pose: Pose
    var flip = false

    private var dress: (Color, Color) {
        switch figure {
        case .angel: (Color(RGB(hex: "#D3DFEC")!), Color(RGB(hex: "#95ABC4")!))
        case .garden: (Color(RGB(hex: "#D3E6D6")!), Color(RGB(hex: "#93B39A")!))
        case .shepherd: (Color(RGB(hex: "#E6D6B9")!), Color(RGB(hex: "#B9A37A")!))
        case .choir: (Color(RGB(hex: "#DCCFEA")!), Color(RGB(hex: "#A794C2")!))
        case .dove: (Color(RGB(hex: "#F1D7D3")!), Color(RGB(hex: "#C99F98")!))
        }
    }

    var body: some View {
        Canvas { ctx, size in
            ctx.scaleBy(x: size.width / 60, y: size.height / 100)
            if flip {
                ctx.translateBy(x: 60, y: 0)
                ctx.scaleBy(x: -1, y: 1)
            }
            let skin = Color(RGB(hex: "#F7E6D8")!), skinLine = Color(RGB(hex: "#B8957F")!), eye = Color(RGB(hex: "#45363B")!)
            let wing = Color(RGB(hex: "#FBF8F4")!), wingLine = Color(RGB(hex: "#A89788")!)
            let (fill, line) = dress
            func shape(_ p: Path, _ f: Color, _ l: Color, _ w: CGFloat = 0.9) {
                ctx.fill(p, with: .color(f))
                ctx.stroke(p, with: .color(l), lineWidth: w)
            }
            // Base.
            shape(Path(roundedRect: CGRect(x: 8, y: 94, width: 44, height: 4.5), cornerRadius: 1.5), Color(RGB(hex: "#DCCFC4")!), wingLine, 0.7)
            // Wings, behind.
            for (cx, rot) in [(19.0, -0.5), (41.0, 0.5)] as [(CGFloat, CGFloat)] {
                var w = Path(ellipseIn: CGRect(x: -7, y: -13, width: 14, height: 26))
                w = w.applying(CGAffineTransform(rotationAngle: rot)).applying(CGAffineTransform(translationX: cx, y: 58))
                shape(w, wing, wingLine)
            }
            // Robe.
            var robe = Path()
            robe.move(to: CGPoint(x: 22, y: 50)); robe.addLine(to: CGPoint(x: 38, y: 50))
            robe.addQuadCurve(to: CGPoint(x: 46, y: 94), control: CGPoint(x: 44, y: 70))
            robe.addLine(to: CGPoint(x: 14, y: 94))
            robe.addQuadCurve(to: CGPoint(x: 22, y: 50), control: CGPoint(x: 16, y: 70))
            robe.closeSubpath()
            shape(robe, fill, line)
            // Arms.
            let arm = StrokeStyle(lineWidth: 5, lineCap: .round)
            var a = Path()
            switch pose {
            case .pull:
                a.move(to: CGPoint(x: 36, y: 56)); a.addLine(to: CGPoint(x: 49, y: 39))
                a.move(to: CGPoint(x: 26, y: 57)); a.addLine(to: CGPoint(x: 45, y: 44))
            case .present:
                a.move(to: CGPoint(x: 36, y: 56)); a.addLine(to: CGPoint(x: 55, y: 50))
                a.move(to: CGPoint(x: 25, y: 57)); a.addLine(to: CGPoint(x: 27, y: 68))
            case .point:
                a.move(to: CGPoint(x: 36, y: 56)); a.addLine(to: CGPoint(x: 54, y: 46))
                a.move(to: CGPoint(x: 25, y: 57)); a.addLine(to: CGPoint(x: 30, y: 68))
            case .sit:
                a.move(to: CGPoint(x: 25, y: 57)); a.addLine(to: CGPoint(x: 30, y: 68))
                a.move(to: CGPoint(x: 35, y: 57)); a.addLine(to: CGPoint(x: 30, y: 68))
            }
            ctx.stroke(a, with: .color(line), style: StrokeStyle(lineWidth: 6.5, lineCap: .round))
            ctx.stroke(a, with: .color(fill), style: arm)
            // Each style's little touch.
            switch figure {
            case .shepherd:
                var crook = Path()
                crook.move(to: CGPoint(x: 12, y: 92)); crook.addLine(to: CGPoint(x: 12, y: 50))
                crook.addQuadCurve(to: CGPoint(x: 6, y: 48), control: CGPoint(x: 10, y: 43))
                ctx.stroke(crook, with: .color(Color(RGB(hex: "#9C8466")!)), style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
            case .choir:
                if pose == .sit { shape(Path(roundedRect: CGRect(x: 24, y: 64, width: 12, height: 10), cornerRadius: 1), Color(RGB(hex: "#CDBDDC")!), Color(RGB(hex: "#8E78A6")!), 0.7) }
            case .dove:
                shape(Path(ellipseIn: CGRect(x: 40, y: 84, width: 11, height: 7)), .white, wingLine, 0.7)
            case .garden:
                for x in stride(from: 20.0, through: 40.0, by: 5.0) {
                    shape(Path(ellipseIn: CGRect(x: x - 2.2, y: 19, width: 4.4, height: 4.4)), Color(RGB(hex: "#F3C9D3")!), Color(RGB(hex: "#C98E9C")!), 0.5)
                }
            case .angel:
                ctx.stroke(Path(ellipseIn: CGRect(x: 20, y: 13, width: 20, height: 6)), with: .color(Color(RGB(hex: "#E2C98F")!)), lineWidth: 1.6)
            }
            // Head: big and round, closed happy eyes, rosy cheeks.
            shape(Path(ellipseIn: CGRect(x: 15, y: 20, width: 30, height: 31)), skin, skinLine)
            var hair = Path()
            hair.addArc(center: CGPoint(x: 30, y: 33), radius: 15, startAngle: .degrees(195), endAngle: .degrees(345), clockwise: false)
            hair.closeSubpath()
            shape(hair, Color(RGB(hex: "#C8A27E")!), Color(RGB(hex: "#9C7A5C")!), 0.7)
            for x in [24.0, 36.0] as [CGFloat] {
                var e = Path()
                e.move(to: CGPoint(x: x - 2.4, y: 37)); e.addQuadCurve(to: CGPoint(x: x + 2.4, y: 37), control: CGPoint(x: x, y: 39.5))
                ctx.stroke(e, with: .color(eye), style: StrokeStyle(lineWidth: 1, lineCap: .round))
                ctx.fill(Path(ellipseIn: CGRect(x: x - 3.5, y: 40, width: 5, height: 3)), with: .color(Color(RGB(hex: "#F1B9B4")!).opacity(0.85)))
            }
            var smile = Path()
            smile.move(to: CGPoint(x: 28, y: 44)); smile.addQuadCurve(to: CGPoint(x: 32, y: 44), control: CGPoint(x: 30, y: 46))
            ctx.stroke(smile, with: .color(eye), style: StrokeStyle(lineWidth: 0.9, lineCap: .round))
        }
        .accessibilityHidden(true)
    }
}

// MARK: - Comments on ceramic placards

private struct Flop: ViewModifier {
    let angle: Double
    func body(content: Content) -> some View {
        content.rotation3DEffect(.degrees(angle), axis: (x: 1, y: 0, z: 0), anchor: .top, perspective: 0.6).opacity(angle < -80 ? 0 : 1)
    }
}

extension AnyTransition {
    /// A placard swinging down on its ties from flat, and back up when it folds.
    fileprivate static var flop: AnyTransition { .modifier(active: Flop(angle: -100), identity: Flop(angle: 0)) }
}

private struct CeramicPlacards: View {
    let card: Card
    let look: CeramicLook
    let words: Words
    let hooks: FeedHooks
    @State private var all: [Beanstalk.Note]?
    @State private var open = false
    @State private var openReplies: Set<String> = []
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        let notes: [Beanstalk.Note] = all ?? (card.leafComments ?? []).map(Beanstalk.Note.init)
        let tree = Beanstalk.tree(notes)
        let total: Int = all != nil ? tree.top.count : max(tree.top.count, card.counts.comments)
        VStack(spacing: 0) {
            if let first = tree.top.first {
                if open {
                    ForEach(Array(tree.top.prefix(Ceramic.placardsShown).enumerated()), id: \.element.id) { _, note in
                        VStack(spacing: 0) {
                            ties(6)
                            comment(note, kids: tree.kids)
                        }
                        .transition(.flop)
                    }
                    if total > Ceramic.placardsShown, let openPost = hooks.open {
                        ties(6)
                        Button { openPost(card) } label: {
                            Text(words("ceramic.more", ["n": String(total - Ceramic.placardsShown)]))
                                .font(.system(size: 14, weight: .semibold, design: .serif))
                                .foregroundStyle(Color(look.ink))
                                .padding(.horizontal, 16).padding(.vertical, 8)
                                .background(Color(look.platform), in: .capsule)
                        }
                        .buttonStyle(.plain)
                        .transition(.flop)
                    }
                } else {
                    ties(10)
                    closed(first, total: total)
                }
            }
        }
        .task(id: card.id) {
            guard all == nil, card.counts.comments > 0, let load = hooks.loadComments else { return }
            all = await load(card).map(Beanstalk.Note.init)
        }
    }

    private func toggle() {
        if still { open.toggle() } else { withAnimation(.spring(duration: 0.55, bounce: 0.25)) { open.toggle() } }
        if !open { openReplies = [] }
    }

    private func toggleReplies(_ id: String) {
        let change = { if openReplies.contains(id) { openReplies.remove(id) } else { openReplies.insert(id) } }
        if still { change() } else { withAnimation(.spring(duration: 0.5, bounce: 0.25)) { change() } }
    }

    /// The two short ropes that tie a placard to the one above it.
    private func ties(_ h: CGFloat) -> some View {
        HStack {
            Rectangle().fill(CeramicDraw.rope).frame(width: 3, height: h)
            Spacer()
            Rectangle().fill(CeramicDraw.rope).frame(width: 3, height: h)
        }
        .padding(.horizontal, 26)
        .accessibilityHidden(true)
    }

    /// Closed: one placard showing the first comment's first line, the others stacked behind it.
    private func closed(_ first: Beanstalk.Note, total: Int) -> some View {
        Button(action: toggle) {
            HStack(spacing: 8) {
                (Text(first.author).bold() + Text(" · " + first.body))
                    .font(.system(size: 16, design: .serif))
                    .foregroundStyle(Color(look.ink))
                    .lineLimit(1)
                Spacer(minLength: 4)
                if total > 1 {
                    Text("+\(total - 1)").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(Ceramic.muted))
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 11)
            .background(Color(look.placard), in: .rect(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 7).inset(by: 4).stroke(Color(look.ink).opacity(0.18), lineWidth: 1))
            .background(alignment: .bottom) {
                if total > 1 {
                    ZStack(alignment: .bottom) {
                        if total > 2 { RoundedRectangle(cornerRadius: 10).fill(Color(look.recess)).padding(.horizontal, 16).offset(y: 12) }
                        RoundedRectangle(cornerRadius: 10).fill(Color(look.platform)).padding(.horizontal, 8).offset(y: 6)
                    }
                    .accessibilityHidden(true)
                }
            }
            .shadow(color: Color(RGB(hex: "#46323C")!).opacity(0.2), radius: 5, x: 0, y: 3)
        }
        .buttonStyle(.plain)
        .accessibilityHint(words("ceramic.showComments", count: total))
        .accessibilityIdentifier("ceramic-stack-\(card.id)")
        .padding(.bottom, total > 1 ? 14 : 0)
    }

    /// One open comment: its placard (a tap folds them all), Reply, then its first reply or all its replies.
    private func comment(_ note: Beanstalk.Note, kids: [String: [Beanstalk.Note]]) -> some View {
        let replies = kids[note.id] ?? []
        return VStack(alignment: .leading, spacing: 0) {
            Button(action: toggle) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(note.author).font(.system(size: 14, weight: .semibold, design: .serif)).foregroundStyle(Color(Ceramic.muted))
                    Text(note.body).font(.system(size: 16, design: .serif)).foregroundStyle(Color(look.ink))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityHint(words("ceramic.foldComments", ["name": note.author]))
            .accessibilityIdentifier("ceramic-comment-\(note.id)")
            if let openPost = hooks.open {
                // Only a top-level comment gets Reply; replies never do.
                Button(words("post.reply")) { openPost(card) }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color(look.ink))
                    .padding(.horizontal, 12).padding(.vertical, 5)
                    .background(Color(look.platform), in: .capsule)
                    .buttonStyle(.plain)
                    .padding(.top, 8)
            }
            if !replies.isEmpty { replyStack(note, replies, kids: kids).padding(.top, 10) }
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .background(Color(look.placard), in: .rect(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 7).inset(by: 4).stroke(Color(look.ink).opacity(0.18), lineWidth: 1).allowsHitTesting(false))
        .shadow(color: Color(RGB(hex: "#46323C")!).opacity(0.2), radius: 5, x: 0, y: 3)
    }

    private func replyStack(_ parent: Beanstalk.Note, _ replies: [Beanstalk.Note], kids: [String: [Beanstalk.Note]]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if openReplies.contains(parent.id) {
                ForEach(replies) { r in
                    Button { toggleReplies(parent.id) } label: { replyFace(r, extra: nil, kids: kids[r.id] ?? []) }
                        .buttonStyle(.plain)
                        .accessibilityHint(words("ceramic.foldReplies", ["name": r.author]))
                        .accessibilityIdentifier("ceramic-reply-\(r.id)")
                        .transition(.flop)
                }
            } else if let first = replies.first {
                // The first reply always hangs showing; a tap flops the rest down.
                Button { toggleReplies(parent.id) } label: { replyFace(first, extra: replies.count > 1 ? replies.count - 1 : nil, kids: []) }
                    .buttonStyle(.plain)
                    .accessibilityHint(words("ceramic.showReplies", count: replies.count))
                    .accessibilityIdentifier("ceramic-first-\(parent.id)")
            }
        }
    }

    /// A reply's lilac placard; its own replies show inline under it. No Reply button.
    private func replyFace(_ r: Beanstalk.Note, extra: Int?, kids: [Beanstalk.Note]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                (Text(r.author).bold() + Text(" · " + r.body))
                    .font(.system(size: 15, design: .serif))
                    .foregroundStyle(Color(look.ink))
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                if let extra { Text("+\(extra)").font(.system(size: 13, weight: .semibold)).foregroundStyle(Color(Ceramic.muted)) }
            }
            ForEach(kids) { k in
                (Text(k.author).bold() + Text(" · " + k.body))
                    .font(.system(size: 14, design: .serif))
                    .foregroundStyle(Color(Ceramic.muted))
                    .padding(.leading, 10)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(Color(look.reply), in: .rect(cornerRadius: 9))
        .background(alignment: .bottom) {
            if extra != nil {
                RoundedRectangle(cornerRadius: 9).fill(Color(RGB(hex: "#D9CFE6")!)).padding(.horizontal, 8).offset(y: 5).accessibilityHidden(true)
            }
        }
        .padding(.leading, 12)
        .padding(.bottom, extra != nil ? 6 : 0)
    }
}

// MARK: - The turtle, the flying angel and the figurine picker

/// A ceramic turtle walking slowly across behind the posts, again and again.
private struct CeramicTurtle: View {
    let width: CGFloat

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 20)) { tl in
            let cycle: Double = 70
            let p: Double = tl.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: cycle) / cycle
            let walk: CGFloat = CGFloat(min(p / 0.55, 1))
            let step: CGFloat = CGFloat(sin(tl.date.timeIntervalSinceReferenceDate * 3)) * 1.5
            Canvas { ctx, _ in
                let shell = Color(RGB(hex: "#CFE0D2")!), line = Color(RGB(hex: "#8FAE96")!), limb = Color(RGB(hex: "#E9DCCB")!)
                for (x, lift) in [(14.0, step), (40.0, -step)] as [(CGFloat, CGFloat)] {
                    ctx.fill(Path(roundedRect: CGRect(x: x, y: 24 + lift, width: 8, height: 10), cornerRadius: 3), with: .color(limb))
                }
                ctx.fill(Path(ellipseIn: CGRect(x: 48, y: 14, width: 14, height: 12)), with: .color(limb))
                ctx.fill(Path(ellipseIn: CGRect(x: 57, y: 18, width: 2, height: 2)), with: .color(Color(RGB(hex: "#45363B")!)))
                var dome = Path()
                dome.addArc(center: CGPoint(x: 30, y: 28), radius: 20, startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false)
                dome.closeSubpath()
                ctx.fill(dome, with: .color(shell))
                ctx.stroke(dome, with: .color(line), lineWidth: 1)
                for cx in [22.0, 30.0, 38.0] as [CGFloat] {
                    ctx.stroke(Path(ellipseIn: CGRect(x: cx - 3.5, y: 15, width: 7, height: 7)), with: .color(line), lineWidth: 0.8)
                }
            }
            .frame(width: 64, height: 36)
            .offset(x: -80 + (width + 90) * walk)
            .frame(maxWidth: .infinity, alignment: .leading)
            .opacity(p < 0.56 ? 1 : 0)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct CeramicFlight: Identifiable, Equatable {
    let id = UUID()
    let fromTop: Bool
    let left: Bool
}

/// An angel flying in from the post that just left the screen to the centred one.
private struct CeramicFlyer: View {
    let flight: CeramicFlight
    let size: CGSize
    let done: () -> Void
    @State private var there = false

    var body: some View {
        let x0: CGFloat = flight.left ? 28 : size.width - 28
        let x1: CGFloat = flight.left ? 90 : size.width - 90
        let y0: CGFloat = flight.fromTop ? -50 : size.height + 50
        CeramicFigurine(figure: .angel, pose: .present, flip: !flight.left)
            .frame(width: 40, height: 67)
            .position(x: there ? x1 : x0, y: there ? size.height * 0.42 : y0)
            .opacity(there ? 0 : 1)
            .onAppear { withAnimation(.easeInOut(duration: 2.4)) { there = true } }
            .task {
                try? await Task.sleep(for: .seconds(2.5))
                done()
            }
            .accessibilityHidden(true)
    }
}

/// Members choose the figurines that decorate the sides of their feed: one style, or all five mixed.
private struct CeramicPicker: View {
    @Binding var choiceRaw: String
    let words: Words
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    option("mix", figure: .dove)
                    ForEach(Ceramic.Figure.allCases) { f in option(f.rawValue, figure: f) }
                } footer: { Text(words("ceramic.pickSub")) }
            }
            .navigationTitle(words("ceramic.pickTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(words("ceramic.done")) { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func option(_ raw: String, figure: Ceramic.Figure) -> some View {
        Button { choiceRaw = raw } label: {
            HStack(spacing: 14) {
                CeramicFigurine(figure: figure, pose: .sit).frame(width: 36, height: 60)
                Text(words("ceramic.looks.\(raw)")).foregroundStyle(.primary)
                Spacer()
                if choiceRaw == raw { Image(systemName: "checkmark").foregroundStyle(.tint) }
            }
        }
        .accessibilityAddTraits(choiceRaw == raw ? .isSelected : [])
        .accessibilityIdentifier("ceramic-look-\(raw)")
    }
}

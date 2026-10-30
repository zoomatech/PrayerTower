import PrayerTowerKit
import SwiftUI

// The Beanstalk (Steve, 2026-10-30), drawn to match the Claude Design video, the same as the
// Expo app (apps/mobile/src/layouts/beanstalk.tsx): a braided stalk of two twisting strands down
// the middle; each post in a frame wound with a leafy vine and a flower at its top; above each post
// its comments hang off the stalk as real leaves, three at a time, with ‹ 1–3 of N › to swap in
// the next three, which unfurl. Tapping a leaf with replies sprouts smaller reply leaves (three
// levels, the first three at each); a leaf whose words are cut off grows into one big straight
// leaf with the whole comment and its replies (close with the X or Esc). As each post scrolls
// into view its stalk grows up from the frame and its leaves unfurl. Reduce Motion shows it all
// at once. Fruit hangs on the frame once someone has gifted the poster tokens.

private enum Bean {
    static let backdrop = Color(RGB(hex: "#E9DFBF")!)
    static let cream = Color(RGB(hex: "#FCF4DC")!)
    static let ink = Color(RGB(hex: "#22301A")!)
    static let frameInk = Color(RGB(hex: "#2A1E14")!)
    static let strandDark = Color(RGB(hex: "#3F8A2C")!)
    static let strandLight = Color(RGB(hex: "#86C25A")!)
    static let leaf = Color(RGB(hex: "#A9D27B")!)
    static let leafPale = Color(RGB(hex: "#CFE6A6")!)
    static let leafBright = Color(RGB(hex: "#8CC657")!)
    static let locket = Color(RGB(hex: "#C9A227")!)
    static let locketFace = Color(RGB(hex: "#EDB09A")!)
    static let vein = Color(RGB(hex: "#6E9F47")!)
    static let petal = Color(RGB(hex: "#F2C14E")!)
    static let heart = Color(RGB(hex: "#C0392B")!)
    static let link = Color(RGB(hex: "#23407F")!)
    static let text = Color(RGB.commentText)
    static let button = Color(RGB(hex: "#D7EBB4")!)
}

struct BeanstalkFeed<Row: View>: View {
    let look: VineLook
    let cards: [Card]
    let wording: Wording
    @ViewBuilder let row: (Card) -> Row
    let onEnd: () async -> Void
    var loadComments: ((Card) async -> [Comment])?

    var body: some View {
        let words = Words(wording)
        ScrollViewReader { proxy in
            VStack(spacing: 0) {
                banner(words) { withAnimation { proxy.scrollTo("beanstalk-top", anchor: .top) } }
                GeometryReader { geo in
                    let lane = min(geo.size.width - 24, 760)
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            Color.clear.frame(height: 1).id("beanstalk-top")
                            ForEach(cards) { card in
                                BeanSection(card: card, lane: lane, stemWidth: look.stemWidth, words: words, row: row, load: loadComments)
                                    .task { if card.id == cards.last?.id { await onEnd() } }
                            }
                            Text(Skin.tip(look, wording))
                                .font(.footnote)
                                .foregroundStyle(Bean.text)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 24)
                                .padding(.vertical, 40)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .background(Bean.backdrop)
        .environment(\.colorScheme, .light)
    }

    private func banner(_ words: Words, climb: @escaping () -> Void) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "leaf.fill").foregroundStyle(Bean.strandDark).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text(words("beanstalk.title")).font(.system(size: 26, weight: .bold, design: .serif)).foregroundStyle(Bean.frameInk)
                    .accessibilityAddTraits(.isHeader)
                Text(words("beanstalk.subtitle")).font(.system(size: 13, design: .serif)).foregroundStyle(Bean.frameInk.opacity(0.85))
            }
            Spacer()
            Button(action: climb) {
                Text(words("beanstalk.climb")).font(.system(size: 15, weight: .bold, design: .serif)).foregroundStyle(Bean.frameInk)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Bean.button, in: .capsule)
                    .overlay(Capsule().stroke(Bean.frameInk, lineWidth: 2))
            }
            .buttonStyle(.plain)
            .accessibilityHint(words("beanstalk.climbHint"))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Bean.cream)
        .overlay(alignment: .bottom) { Rectangle().fill(Bean.frameInk).frame(height: 4) }
    }
}

/// One post: its cluster of leaves climbing the stalk, the ‹ › control and the framed post.
private struct BeanSection<Row: View>: View {
    let card: Card
    let lane: Double
    let stemWidth: Double
    let words: Words
    let row: (Card) -> Row
    let load: ((Card) async -> [Comment])?
    @State private var all: [Beanstalk.Note]?
    @State private var page = 0
    @State private var open: Set<String> = []
    @State private var reading: Beanstalk.Note?
    @State private var grown = false
    @State private var fresh = true
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        let notes = all ?? (card.leafComments ?? []).map(Beanstalk.Note.init)
        let tree = Beanstalk.tree(notes)
        let total = all != nil ? tree.top.count : max(tree.top.count, card.counts.comments)
        let rows = Beanstalk.rows(page: Array(tree.top.dropFirst(page * Beanstalk.perPage).prefix(Beanstalk.perPage)), kids: tree.kids, open: open)
        let shown = grown || still
        VStack(spacing: 0) {
            // Nearest the post at the bottom: the cluster climbs up the stalk.
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated().reversed()), id: \.element.id) { i, r in
                    BeanLeafRow(row: r, lane: lane, replies: tree.kids[r.id]?.count ?? 0, words: words, show: shown,
                                delay: fresh ? 0.5 + Double(i) * 0.16 : Double(i) * 0.06) { note, cut in tap(note, cut, tree.kids) }
                }
            }
            if total > Beanstalk.perPage { cycle(total: total) }
            framed
        }
        .padding(.top, 26)
        .frame(width: lane)
        .background(alignment: .bottom) { BraidStalk(stemWidth: stemWidth, grown: shown).accessibilityHidden(true) }
        .onAppear { if !grown { withAnimation(still ? nil : .easeOut(duration: 0.9)) { grown = true } } }
        .task(id: grown) {
            guard grown, all == nil, card.counts.comments > 0, let load else { return }
            all = await load(card).map(Beanstalk.Note.init)
        }
        .sheet(item: $reading) { note in BeanReader(note: note, kids: tree.kids, words: words) { reading = nil } }
    }

    private func tap(_ n: Beanstalk.Note, _ cut: Bool, _ kids: [String: [Beanstalk.Note]]) {
        fresh = false
        if cut { reading = n; return }
        var next = open
        if next.contains(n.id) {
            // Closing a leaf folds its replies' replies away too.
            var stack = [n.id]
            while let id = stack.popLast() {
                next.remove(id)
                stack += (kids[id] ?? []).map(\.id)
            }
        } else {
            next.insert(n.id)
        }
        withAnimation(still ? nil : .spring(response: 0.5, dampingFraction: 0.75)) { open = next }
    }

    private func cycle(total: Int) -> some View {
        let last = (total + Beanstalk.perPage - 1) / Beanstalk.perPage - 1
        let from = page * Beanstalk.perPage + 1
        let to = min(total, from + Beanstalk.perPage - 1)
        func go(_ p: Int) { fresh = false; open = []; page = p }
        return HStack(spacing: 8) {
            Button { go(page - 1) } label: { cycleKey("‹", corner: .topLeading) }
                .buttonStyle(.plain).disabled(page <= 0).opacity(page <= 0 ? 0.4 : 1)
                .accessibilityLabel(words("beanstalk.prev"))
            Text(words("beanstalk.range", ["from": String(from), "to": String(to), "total": String(total)]))
                .font(.system(size: 15, weight: .bold, design: .serif)).foregroundStyle(Bean.frameInk)
                .padding(.horizontal, 14).padding(.vertical, 5)
                .background(Bean.cream, in: .capsule)
                .overlay(Capsule().stroke(Bean.frameInk, lineWidth: 2.5))
            Button { go(page + 1) } label: { cycleKey("›", corner: .topTrailing) }
                .buttonStyle(.plain).disabled(page >= last).opacity(page >= last ? 0.4 : 1)
                .accessibilityLabel(words("beanstalk.next"))
        }
        .padding(.top, 6)
        .padding(.bottom, 8)
        .opacity(grown || still ? 1 : 0)
    }

    private func cycleKey(_ arrow: String, corner: UnitPoint) -> some View {
        let shape = UnevenRoundedRectangle(topLeadingRadius: corner == .topLeading ? 4 : 18, bottomLeadingRadius: 18, bottomTrailingRadius: 18, topTrailingRadius: corner == .topTrailing ? 4 : 18)
        return Text(arrow).font(.system(size: 22, weight: .heavy)).foregroundStyle(Bean.frameInk)
            .frame(width: 40, height: 36)
            .background(Bean.button, in: shape)
            .overlay(shape.stroke(Bean.frameInk, lineWidth: 2.5))
    }

    private var framed: some View {
        row(card)
            .padding(12)
            .padding(.top, 18)
            .background(Bean.cream, in: .rect(cornerRadius: 22))
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(Bean.frameInk, lineWidth: 3))
            // The dark drop shadow under the post, as in the video.
            .background(RoundedRectangle(cornerRadius: 22).fill(Bean.frameInk).offset(x: 6, y: 6))
            .padding(14)
            .overlay { FrameVine().accessibilityHidden(true) }
            // The poster in an oval locket over the top left corner; fruit over the top right one.
            .overlay(alignment: .topLeading) { Locket(name: card.author.displayName).offset(x: -10, y: -20) }
            .overlay(alignment: .topTrailing) {
                if card.gifted == true { VineFruit(label: words("vine.fruit"), size: 44).offset(x: 6, y: -10) }
            }
            .frame(maxWidth: 600)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
    }
}

/// The poster's initial in an oval gold locket hanging from a little loop.
private struct Locket: View {
    let name: String
    var body: some View {
        VStack(spacing: -3) {
            Circle().stroke(Bean.locket, lineWidth: 2).frame(width: 9, height: 9)
                .background(Circle().stroke(Bean.ink, lineWidth: 4))
            ZStack {
                Ellipse().fill(Bean.locket).overlay(Ellipse().stroke(Bean.ink, lineWidth: 2))
                Ellipse().fill(Bean.locketFace).overlay(Ellipse().stroke(Bean.ink, lineWidth: 1.5)).padding(5)
                Text(String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased())
                    .font(.system(size: 22, weight: .bold, design: .serif)).foregroundStyle(Bean.frameInk)
            }
            .frame(width: 46, height: 52)
        }
        .accessibilityHidden(true)
    }
}

/// The braided stalk through one section, grown up from the bottom when first seen.
private struct BraidStalk: View {
    let stemWidth: Double
    let grown: Bool

    var body: some View {
        Canvas { ctx, size in
            let h = Double(size.height), cx = Double(size.width) / 2
            let amp = max(4, stemWidth * 0.42), w = max(4, stemWidth * 0.62)
            let turns = max(1, (h / 120).rounded())
            func strand(_ phase: Double) -> Path {
                var p = Path()
                var y = 0.0
                p.move(to: CGPoint(x: cx + amp * sin(phase), y: 0))
                while y < h {
                    y = min(h, y + 5)
                    let angle: Double = y / h * turns * 2 * Double.pi + phase
                    p.addLine(to: CGPoint(x: cx + amp * sin(angle), y: y))
                }
                return p
            }
            let a = strand(0), b = strand(.pi)
            ctx.stroke(b, with: .color(Bean.ink), style: .init(lineWidth: w + 3, lineCap: .round))
            ctx.stroke(b, with: .color(Bean.strandDark), style: .init(lineWidth: w, lineCap: .round))
            ctx.stroke(a, with: .color(Bean.ink), style: .init(lineWidth: w + 3, lineCap: .round))
            ctx.stroke(a, with: .color(Bean.strandLight), style: .init(lineWidth: w, lineCap: .round))
        }
        .mask(alignment: .bottom) {
            GeometryReader { g in
                Rectangle().frame(height: grown ? g.size.height : 0).frame(maxHeight: .infinity, alignment: .bottom)
            }
        }
        .allowsHitTesting(false)
    }
}

/// A comment leaf: rounded base on the stem, a pointed tip that droops, a midrib and side veins.
/// Drawn pointing right; `flip` mirrors it for the left side of the stalk.
private struct BeanLeafShape: Shape {
    let flip: Bool
    var veins = false
    func path(in r: CGRect) -> Path {
        let W = Double(r.width), H = Double(r.height), X0 = Double(r.minX), Y0 = Double(r.minY)
        func P(_ x: Double, _ y: Double) -> CGPoint {
            let px: Double = flip ? W - x * W : x * W
            return CGPoint(x: X0 + px, y: Y0 + y * H)
        }
        var p = Path()
        if veins {
            p.move(to: P(0.06, 0.5))
            p.addQuadCurve(to: P(1, 0.64), control: P(0.55, 0.44))
            for t: Double in [0.2, 0.36, 0.52, 0.68, 0.82] {
                let u: Double = 1 - t
                let x: Double = u * u * 0.06 + 2 * u * t * 0.55 + t * t
                let y: Double = u * u * 0.5 + 2 * u * t * 0.44 + t * t * 0.64
                let reach: Double = sin(Double.pi * min(1, t * 1.15)) * 0.36
                p.move(to: P(x, y)); p.addQuadCurve(to: P(x + 0.13, y - reach), control: P(x + 0.05, y - reach * 0.5))
                p.move(to: P(x, y)); p.addQuadCurve(to: P(x + 0.13, y + reach), control: P(x + 0.05, y + reach * 0.5))
            }
            return p
        }
        p.move(to: P(0.06, 0.5))
        p.addCurve(to: P(0.8, 0.24), control1: P(0.1, 0.06), control2: P(0.55, -0.04))
        p.addCurve(to: P(1, 0.64), control1: P(0.92, 0.36), control2: P(0.98, 0.5))
        p.addCurve(to: P(0.45, 0.95), control1: P(0.9, 0.8), control2: P(0.74, 0.98))
        p.addCurve(to: P(0.06, 0.5), control1: P(0.2, 0.92), control2: P(0.03, 0.76))
        p.closeSubpath()
        return p
    }
}

private struct BeanLeafRow: View {
    let row: Beanstalk.Row
    let lane: Double
    let replies: Int
    let words: Words
    let show: Bool
    let delay: Double
    let onTap: (Beanstalk.Note, Bool) -> Void
    @State private var open = false
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        let scale: Double = [1, 0.76, 0.6][row.level]
        let W: Double = min(290, lane / 2 - 8) * scale
        let H: Double = W * 0.5
        let font: Double = row.level == 0 ? (W > 220 ? 14 : 12.5) : (row.level == 1 ? 11.5 : 10.5)
        let lines = row.level == 0 ? 2 : 1
        let fit = Beanstalk.fit(row.note.body, max: Beanstalk.chars(width: W, font: font, lines: lines))
        let label = fit.cut ? words("beanstalk.readMore") : replies > 0 ? words("beanstalk.replies", count: replies) : ""
        let actionable = fit.cut || (replies > 0 && row.level < Beanstalk.maxLevel)
        let out: Double = row.right ? 1 : -1
        let reach: Double = 20 * Double(row.level)
        let rowH: Double = H * 0.78 + 4
        let baseX: Double = lane / 2 + out * reach
        let stemFrom = CGPoint(x: lane / 2 + out * (reach - 14), y: rowH + 6)
        let stemBend = CGPoint(x: lane / 2 + out * (reach - 12), y: rowH * 0.7)
        let leafX: Double = row.right ? baseX - 2 : baseX - W + 2
        let anchor: UnitPoint = row.right ? .leading : .trailing
        let tilt: Double = 9 * out, furl: Double = -40 * out
        let textShift: Double = row.right ? W * 0.04 : -W * 0.04
        ZStack(alignment: .topLeading) {
            if row.level > 0 {
                // Its own stem, off the leaf it answers.
                Path { p in
                    p.move(to: stemFrom)
                    p.addCurve(to: CGPoint(x: baseX, y: rowH / 2), control1: stemBend, control2: CGPoint(x: baseX, y: rowH * 0.7))
                }
                .stroke(Bean.strandDark, style: .init(lineWidth: 2.5, lineCap: .round))
                .accessibilityHidden(true)
            }
            Button { onTap(row.note, fit.cut) } label: {
                ZStack {
                    Path { p in p.move(to: CGPoint(x: row.right ? 0 : W, y: H / 2)); p.addLine(to: CGPoint(x: row.right ? W * 0.09 : W * 0.91, y: H / 2)) }
                        .stroke(Bean.ink, style: .init(lineWidth: 4, lineCap: .round))
                    BeanLeafShape(flip: !row.right).fill(row.level == 0 && !row.right ? Bean.leafPale : Bean.leaf)
                    BeanLeafShape(flip: !row.right).stroke(Bean.ink, lineWidth: 2.2)
                    BeanLeafShape(flip: !row.right, veins: true).stroke(Bean.vein, lineWidth: 1.2)
                    VStack(spacing: 0) {
                        Text(row.note.author).font(.system(size: font, weight: .bold, design: .serif)).lineLimit(1)
                        Text(fit.text).font(.system(size: font, design: .serif)).lineLimit(lines).multilineTextAlignment(.center)
                        if !label.isEmpty {
                            Text(label).font(.system(size: font * 0.85, weight: .bold, design: .serif)).italic().foregroundStyle(Bean.link)
                        }
                    }
                    .foregroundStyle(Bean.text)
                    .frame(width: W * 0.68)
                    .offset(x: textShift)
                }
                .frame(width: W, height: H)
            }
            .buttonStyle(.plain)
            .disabled(!actionable)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(row.note.author): \(row.note.body)")
            .accessibilityHint(fit.cut ? words("beanstalk.readHint") : actionable ? words("beanstalk.repliesHint") : "")
            .accessibilityAddTraits(actionable ? .isButton : [])
            // It unfurls from its stem.
            .rotationEffect(.degrees(open ? tilt : furl), anchor: anchor)
            .scaleEffect(open ? 1 : 0.15, anchor: anchor)
            .opacity(open ? 1 : 0)
            .offset(x: leafX, y: (rowH - H) / 2)
        }
        .frame(width: lane, height: rowH, alignment: .topLeading)
        .task(id: show) {
            guard show, !open else { return }
            withAnimation(still ? nil : .spring(response: 0.6, dampingFraction: 0.7).delay(delay)) { open = true }
        }
    }
}

/// The vine wound round a post's frame: two strands, small leaves, curls and a flower at the top.
private struct FrameVine: View {
    var body: some View {
        Canvas { ctx, size in
            let pad: Double = 14, r: Double = 22
            let w = Double(size.width), h = Double(size.height)
            let edge = Self.edge(x: pad, y: pad, w: w - pad * 2, h: h - pad * 2, r: r, step: 4)
            func strand(_ sign: Double) -> Path {
                var p = Path()
                for (i, e) in edge.enumerated() {
                    let wave: Double = sin(e.s / 64 * 2 * Double.pi)
                    let off: Double = sign * 2.6 * wave
                    let pt = CGPoint(x: e.x + e.nx * off, y: e.y + e.ny * off)
                    if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
                }
                p.closeSubpath()
                return p
            }
            var leaves = Path(), ribs = Path(), curls = Path()
            for (i, e) in edge.enumerated() {
                // None right by the flower at the top middle.
                if e.s < 16 || edge.count - i < 4 { continue }
                if i % 11 == 5 {
                    let turn: Double = i % 22 == 5 ? 0.6 : -0.6
                    let a: Double = atan2(e.ny, e.nx) + turn
                    let x: Double = e.x + e.nx * 2, y: Double = e.y + e.ny * 2, c: Double = cos(a), s: Double = sin(a)
                    func pt(_ u: Double, _ v: Double) -> CGPoint { CGPoint(x: x + u * c - v * s, y: y + u * s + v * c) }
                    leaves.move(to: pt(0, 0))
                    leaves.addCurve(to: pt(22, 0), control1: pt(4.4, -6.5), control2: pt(15, -6.2))
                    leaves.addCurve(to: pt(0, 0), control1: pt(15, 6.2), control2: pt(4.4, 6.5))
                    leaves.closeSubpath()
                    ribs.move(to: pt(0, 0))
                    ribs.addLine(to: pt(18, 0))
                }
                if i % 44 == 27 {
                    let a: Double = atan2(e.ny, e.nx) + 0.4
                    let x: Double = e.x + e.nx * 7 + cos(a) * 6, y: Double = e.y + e.ny * 7 + sin(a) * 6
                    curls.move(to: CGPoint(x: x - cos(a) * 6, y: y - sin(a) * 6))
                    var t = 0.0
                    while t <= 3.6 * Double.pi {
                        let rr: Double = 6 * (1 - t / (4.2 * Double.pi))
                        let b: Double = a + t + Double.pi
                        curls.addLine(to: CGPoint(x: x + rr * cos(b), y: y + rr * sin(b)))
                        t += 0.3
                    }
                }
            }
            ctx.stroke(curls, with: .color(Bean.strandDark), style: .init(lineWidth: 2.2, lineCap: .round))
            ctx.fill(leaves, with: .color(Bean.leafBright))
            ctx.stroke(leaves, with: .color(Bean.ink), lineWidth: 1.4)
            ctx.stroke(ribs, with: .color(Bean.strandDark), lineWidth: 1)
            ctx.stroke(strand(-1), with: .color(Bean.ink), style: .init(lineWidth: 7, lineJoin: .round))
            ctx.stroke(strand(-1), with: .color(Bean.strandDark), style: .init(lineWidth: 4.5, lineJoin: .round))
            ctx.stroke(strand(1), with: .color(Bean.ink), style: .init(lineWidth: 5.5, lineJoin: .round))
            ctx.stroke(strand(1), with: .color(Bean.strandLight), style: .init(lineWidth: 3, lineJoin: .round))
            // The flower at the top middle.
            let fx: Double = w / 2, fy: Double = pad
            for k in 0..<5 {
                let a: Double = Double(k) * 2 * Double.pi / 5 - Double.pi / 2
                let px: Double = fx + cos(a) * 8 - 5, py: Double = fy + sin(a) * 8 - 5
                let petal = Path(ellipseIn: CGRect(x: px, y: py, width: 10, height: 10))
                ctx.fill(petal, with: .color(Bean.petal))
                ctx.stroke(petal, with: .color(Bean.ink), lineWidth: 1.2)
            }
            let heart = Path(ellipseIn: CGRect(x: fx - 3.6, y: fy - 3.6, width: 7.2, height: 7.2))
            ctx.fill(heart, with: .color(Bean.heart))
            ctx.stroke(heart, with: .color(Bean.ink), lineWidth: 1)
        }
        .allowsHitTesting(false)
    }

    struct Edge { let x, y, nx, ny, s: Double }

    /// Points every `step` round a rounded rectangle, clockwise from the top middle (roundedRectEdge in beanstalk.tsx).
    static func edge(x x0: Double, y y0: Double, w: Double, h: Double, r rad: Double, step: Double) -> [Edge] {
        typealias Seg = (len: Double, at: (Double) -> (Double, Double, Double, Double))
        func line(_ ax: Double, _ ay: Double, _ bx: Double, _ by: Double, _ nx: Double, _ ny: Double) -> Seg {
            (hypot(bx - ax, by - ay), { t in (ax + (bx - ax) * t, ay + (by - ay) * t, nx, ny) })
        }
        func arc(_ cx: Double, _ cy: Double, _ a0: Double) -> Seg {
            (Double.pi * rad / 2, { (t: Double) in let a: Double = a0 + t * Double.pi / 2; return (cx + rad * cos(a), cy + rad * sin(a), cos(a), sin(a)) })
        }
        let L = x0, T = y0, R = x0 + w, B = y0 + h, mid = x0 + w / 2
        let segs: [Seg] = [
            line(mid, T, R - rad, T, 0, -1), arc(R - rad, T + rad, -.pi / 2),
            line(R, T + rad, R, B - rad, 1, 0), arc(R - rad, B - rad, 0),
            line(R - rad, B, L + rad, B, 0, 1), arc(L + rad, B - rad, .pi / 2),
            line(L, B - rad, L, T + rad, -1, 0), arc(L + rad, T + rad, .pi),
            line(L + rad, T, mid, T, 0, -1),
        ]
        let total = segs.reduce(0) { $0 + $1.len }
        var out: [Edge] = []
        var s = 0.0
        while s < total {
            var rest = s, i = 0
            while i < segs.count - 1 && rest > segs[i].len { rest -= segs[i].len; i += 1 }
            let (x, y, nx, ny) = segs[i].at(segs[i].len > 0 ? rest / segs[i].len : 0)
            out.append(Edge(x: x, y: y, nx: nx, ny: ny, s: s))
            s += step
        }
        return out
    }
}

/// One long comment grown into a big straight leaf, with its replies and theirs.
private struct BeanReader: View {
    let note: Beanstalk.Note
    let kids: [String: [Beanstalk.Note]]
    let words: Words
    let close: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            BigLeaf().fill(Bean.leafPale).overlay(BigLeaf().stroke(Bean.ink, lineWidth: 3)).accessibilityHidden(true)
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    Text(note.author).font(.system(size: 17, weight: .bold, design: .serif))
                    Text(note.body).font(.system(size: 15, design: .serif))
                    replies(note.id, level: 1)
                }
                .foregroundStyle(Bean.text)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 90)
            .padding(.top, 150).padding(.bottom, 110)
            Button(action: close) {
                Image(systemName: "xmark").font(.headline.bold()).foregroundStyle(Bean.frameInk)
                    .frame(width: 40, height: 40)
                    .background(Bean.cream, in: .circle)
                    .overlay(Circle().stroke(Bean.frameInk, lineWidth: 2.5))
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.cancelAction)
            .accessibilityLabel(words("common.close"))
            .padding(.top, 50)
            .padding(.trailing, 50)
        }
        .frame(maxWidth: 520, maxHeight: 720)
        .padding(16)
        .presentationBackground(Color.black.opacity(0.55))
        .environment(\.colorScheme, .light)
    }

    private func replies(_ id: String, level: Int) -> AnyView {
        AnyView(ForEach(kids[id] ?? []) { r in
            VStack(alignment: .leading, spacing: 2) {
                Text(r.author).font(.system(size: 15, weight: .bold, design: .serif))
                Text(r.body).font(.system(size: 15, design: .serif))
                if level < Beanstalk.maxLevel { replies(r.id, level: level + 1) }
            }
            .padding(.leading, 8)
            .overlay(alignment: .leading) { Rectangle().fill(Bean.strandDark).frame(width: 3) }
            .padding(.leading, Double(level - 1) * 14)
        })
    }
}

/// The reader's big straight leaf: pointed at top and bottom, widest in the middle.
private struct BigLeaf: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.midX, y: r.minY))
        p.addCurve(to: CGPoint(x: r.midX, y: r.maxY), control1: CGPoint(x: r.minX + r.width * 1.02, y: r.minY + r.height * 0.12), control2: CGPoint(x: r.minX + r.width * 1.02, y: r.minY + r.height * 0.86))
        p.addCurve(to: CGPoint(x: r.midX, y: r.minY), control1: CGPoint(x: r.minX - r.width * 0.02, y: r.minY + r.height * 0.86), control2: CGPoint(x: r.minX - r.width * 0.02, y: r.minY + r.height * 0.12))
        p.closeSubpath()
        return p
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
            ctx.stroke(leaf, with: .color(Bean.ink), lineWidth: 1.2)
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

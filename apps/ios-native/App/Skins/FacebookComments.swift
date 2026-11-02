import PrayerTowerKit
import SwiftUI

/// A skin's colors for the Facebook-style comments.
struct FacebookInk {
    /// Names and words.
    var text: Color
    /// Buttons and "View all N replies".
    var muted: Color
    /// "(+ x more)".
    var link: Color
    /// The thread lines joining replies to their comment.
    var thread: Color
    /// A picture's circle (initials until the member adds a photo).
    var avatar: Color
    /// Names in the skin's own face, if it has one.
    var nameFont: Font? = nil
}

/// One line of a comment, fading out toward its end (Steve, 2026-11-02).
struct FadingLine: View {
    let name: String
    let body_: String
    let color: Color
    var nameFont: Font? = nil

    init(name: String, body: String, color: Color, nameFont: Font? = nil) {
        self.name = name
        self.body_ = body
        self.color = color
        self.nameFont = nameFont
    }

    var body: some View {
        (Text("\(name)  ").font(nameFont ?? .subheadline.bold()) + Text(body_.replacingOccurrences(of: "\n", with: " ")).font(.subheadline))
            .foregroundStyle(color)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
            .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black.opacity(0.85), location: 0.45), .init(color: .clear, location: 1)], startPoint: .leading, endPoint: .trailing))
            .accessibilityHidden(true)
    }
}

/// A post's comments laid out the way Facebook lays them out (Steve, 2026-11-02; Kit FacebookThread,
/// apps/mobile/src/components/fb-comments.tsx). Closed: the top comment's first line fading out,
/// then "(+ x more)". Open: each comment with its picture on the left, name and words beside it and
/// its buttons under them; replies indented under the words with a smaller picture, joined by a
/// thread line curving in from under the comment's picture. The first reply shows, "View all N
/// replies" brings the rest. A tap on a comment folds them closed.
struct FacebookComments: View {
    let card: Card
    let notes: [Beanstalk.Note]
    let total: Int
    let ink: FacebookInk
    let words: Words
    /// Opens the post, to reply or to see comments not loaded yet.
    var open: ((Card) -> Void)?
    @State private var shownTo = 0
    @Environment(\.accessibilityReduceMotion) private var still

    private var motion: Animation { still ? .easeInOut(duration: 0.15) : .spring(duration: 0.4, bounce: 0.1) }

    var body: some View {
        let tree = Beanstalk.tree(notes)
        if let first = tree.top.first {
            let hidden = FacebookThread.hidden(notes, total: total)
            if shownTo == 0, hidden > 0 {
                closed(first, hidden: hidden, opens: min(FacebookThread.page, tree.top.count))
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    let shown = Array(tree.top.prefix(max(1, shownTo)))
                    ForEach(shown) { note in
                        FacebookRow(card: card, note: note, level: 1, kids: tree.kids, ink: ink, words: words, open: open) {
                            withAnimation(motion) { shownTo = 0 }
                        }
                    }
                    if shown.count < tree.top.count || FacebookThread.count(notes, total: total) > notes.count {
                        Button {
                            if shown.count < tree.top.count {
                                withAnimation(motion) { shownTo = min(shown.count + FacebookThread.page, tree.top.count) }
                            } else {
                                open?(card)
                            }
                        } label: {
                            Text(words("fb.viewMore")).font(.footnote.bold()).foregroundStyle(ink.muted).frame(minHeight: 32)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .transition(.opacity)
            }
        }
    }

    private func closed(_ first: Beanstalk.Note, hidden: Int, opens: Int) -> some View {
        let more = words("fb.more", ["n": "\(hidden)"])
        return Button {
            withAnimation(motion) { shownTo = max(1, opens) }
        } label: {
            HStack(spacing: 8) {
                FacebookAvatar(name: first.author, size: FacebookThread.avatar[1], ink: ink)
                FadingLine(name: first.author, body: first.body, color: ink.text, nameFont: ink.nameFont)
                Text(more).font(.subheadline.bold()).foregroundStyle(ink.link).fixedSize()
            }
            .frame(minHeight: 44)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(first.author): \(first.body). \(more)")
        .accessibilityHint(words("fb.open"))
        .accessibilityAddTraits(.isButton)
    }
}

/// A comment's picture: a circle with the member's initials.
struct FacebookAvatar: View {
    let name: String
    let size: Double
    let ink: FacebookInk

    var body: some View {
        let initials = name.split(separator: " ").prefix(2).compactMap { $0.first.map { String($0).uppercased() } }.joined()
        Circle().fill(ink.avatar)
            .frame(width: size, height: size)
            .overlay {
                // A text style, so it follows the reader's text size, shrunk to fit the circle.
                Text(initials).font(.caption.bold()).foregroundStyle(ink.text)
                    .lineLimit(1).minimumScaleFactor(0.3).padding(size * 0.15)
            }
            .accessibilityHidden(true)
    }
}

/// One comment at `level` (1 to 3), with its replies under its words.
private struct FacebookRow: View {
    let card: Card
    let note: Beanstalk.Note
    let level: Int
    let kids: [String: [Beanstalk.Note]]
    let ink: FacebookInk
    let words: Words
    var open: ((Card) -> Void)?
    let fold: () -> Void
    @State private var all = false
    @State private var lastHeight: Double = 0

    private static let gap: Double = 8
    private static let line: Double = 1.5

    var body: some View {
        let replies = FacebookThread.replies(to: note.id, level: level, in: kids)
        let shown = all ? replies : Array(replies.prefix(1))
        let rest = replies.count - shown.count
        let size = FacebookThread.avatar[level - 1]
        let childSize = FacebookThread.avatar[min(level, FacebookThread.avatar.count - 1)]
        let reach = size / 2 + Self.gap
        HStack(alignment: .top, spacing: Self.gap) {
            VStack(spacing: 2) {
                FacebookAvatar(name: note.author, size: size, ink: ink)
                // The thread line, down from under the picture to the last reply's elbow.
                if !replies.isEmpty {
                    Rectangle().fill(ink.thread).frame(width: Self.line).frame(maxHeight: .infinity)
                        .padding(.bottom, lastHeight)
                        .accessibilityHidden(true)
                }
            }
            .frame(width: size)
            VStack(alignment: .leading, spacing: 0) {
                Button(action: fold) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(note.author).font(ink.nameFont ?? .subheadline.bold())
                        Text(note.body).font(.body)
                    }
                    .foregroundStyle(ink.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityHint(words("fb.fold"))
                // Steve: sub-comments get no Reply button (overnesting is hard to follow).
                if FacebookThread.canReply(level: level), let open {
                    Button { open(card) } label: {
                        Text(words("post.reply")).font(.footnote.bold()).foregroundStyle(ink.muted).frame(minHeight: 32)
                    }
                    .buttonStyle(.plain)
                }
                let items = shown.count + (rest > 0 ? 1 : 0)
                ForEach(Array(shown.enumerated()), id: \.element.id) { i, r in
                    child(isLast: i == items - 1, elbow: 6 + childSize / 2, reach: reach) {
                        FacebookRow(card: card, note: r, level: level + 1, kids: kids, ink: ink, words: words, open: open, fold: fold)
                    }
                }
                if rest > 0 {
                    child(isLast: true, elbow: 22, reach: reach) {
                        Button { withAnimation { all = true } } label: {
                            Text(words("fb.viewAll", count: replies.count)).font(.footnote.bold()).foregroundStyle(ink.muted).frame(minHeight: 32)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    /// A reply (or "View all") under the words, with its elbow curving in from the thread line.
    private func child(isLast: Bool, elbow: Double, reach: Double, @ViewBuilder _ content: () -> some View) -> some View {
        content()
            .padding(.top, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .topLeading) {
                Elbow(radius: 10)
                    .stroke(ink.thread, lineWidth: Self.line)
                    .frame(width: reach - 2, height: elbow)
                    .offset(x: -reach)
                    .accessibilityHidden(true)
            }
            .onGeometryChange(for: Double.self) { Double($0.size.height) } action: { h in if isLast { lastHeight = h } }
    }
}

/// Down the left edge, then round the corner along the bottom.
private struct Elbow: Shape {
    let radius: Double

    func path(in r: CGRect) -> Path {
        var p = Path()
        let k = min(radius, r.height, r.width)
        p.move(to: CGPoint(x: r.minX, y: r.minY))
        p.addLine(to: CGPoint(x: r.minX, y: r.maxY - k))
        p.addQuadCurve(to: CGPoint(x: r.minX + k, y: r.maxY), control: CGPoint(x: r.minX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        return p
    }
}

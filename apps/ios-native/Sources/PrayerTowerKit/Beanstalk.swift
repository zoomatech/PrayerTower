import Foundation

/// The Beanstalk skin's comments, the same rules as the Expo app (apps/mobile/src/layouts/beanstalk.tsx):
/// leaves hang three at a time, newest first; an open leaf sprouts its first three replies, and a
/// reply's replies one size smaller, three levels in all. Long words are cut with "..".
public enum Beanstalk {
    public static let perPage = 3
    /// Comment, reply, reply to a reply: the third level is the last.
    public static let maxLevel = 2

    /// A comment on a leaf, from the post's comments or the feed's newest few.
    public struct Note: Sendable, Equatable, Identifiable {
        public let id: String
        public let parentId: String?
        public let body: String
        public let author: String
        public let createdAt: String

        public init(id: String, parentId: String?, body: String, author: String, createdAt: String) {
            self.id = id
            self.parentId = parentId
            self.body = body
            self.author = author
            self.createdAt = createdAt
        }
        public init(_ c: Comment) { self.init(id: c.id, parentId: c.parentId, body: c.body, author: c.author.displayName, createdAt: c.createdAt) }
        public init(_ c: LeafComment) { self.init(id: c.id, parentId: nil, body: c.body, author: c.author.displayName, createdAt: c.createdAt) }
    }

    /// One leaf in a cluster: how deep it is and which side of the stalk it hangs on.
    public struct Row: Sendable, Equatable, Identifiable {
        public let note: Note
        public let level: Int
        public let right: Bool
        public var id: String { note.id }
    }

    /// Top-level comments newest first, and each comment's replies in order.
    public static func tree(_ all: [Note]) -> (top: [Note], kids: [String: [Note]]) {
        let top = all.filter { $0.parentId == nil }.sorted { $0.createdAt > $1.createdAt }
        var kids: [String: [Note]] = [:]
        for n in all { if let p = n.parentId { kids[p, default: []].append(n) } }
        return (top, kids)
    }

    /// The rows of one cluster, nearest the post first; each open leaf's first three replies follow it.
    public static func rows(page: [Note], kids: [String: [Note]], open: Set<String>) -> [Row] {
        var out: [Row] = []
        func add(_ n: Note, _ level: Int, _ right: Bool) {
            out.append(Row(note: n, level: level, right: right))
            guard level < maxLevel, open.contains(n.id) else { return }
            for r in (kids[n.id] ?? []).prefix(perPage) { add(r, level + 1, right) }
        }
        for (i, n) in page.enumerated() { add(n, 0, i % 2 == 1) }
        return out
    }

    /// Characters that fit on a leaf of width `width` at `font` points, over `lines` lines.
    public static func chars(width: Double, font: Double, lines: Int) -> Int {
        max(12, Int((width * 0.66) / (font * 0.5)) * lines)
    }

    /// Cuts text to fit, at a word if it can, with "..". Says whether it was cut.
    public static func fit(_ text: String, max: Int) -> (text: String, cut: Bool) {
        let t = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        guard t.count > max else { return (t, false) }
        var head = String(t.prefix(max - 2))
        if let space = head.lastIndex(of: " "), head.distance(from: head.startIndex, to: space) > Int(Double(max) * 0.6) {
            head = String(head[..<space])
        }
        while let last = head.last, " ,.;:".contains(last) { head.removeLast() }
        return (head + "..", true)
    }
}

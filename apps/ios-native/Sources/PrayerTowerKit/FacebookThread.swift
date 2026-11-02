// Comments laid out the way Facebook lays them out (Steve, 2026-11-02), the same as
// apps/mobile/src/components/fb-comments.tsx: closed, the top comment's first line fades out
// before "(+ x more)"; open, replies sit indented under their comment, the first one showing and
// "View all N replies" for the rest, at most 3 levels deep (deeper replies line up at the 3rd).
// Only top-level comments get a Reply button.
import Foundation

public enum FacebookThread {
    /// Replies stop at the 3rd level (Steve).
    public static let levels = 3
    /// Top-level comments shown at a time once open; "View more comments" shows the next ones.
    public static let page = 10
    /// Picture sizes for a comment, a reply and a reply to a reply.
    public static let avatar: [Double] = [32, 24, 20]

    /// How many comments a post has in all, replies counted: the feed's count or what has loaded, whichever is more.
    public static func count(_ notes: [Beanstalk.Note], total: Int) -> Int { max(total, notes.count) }

    /// How many comments "(+ x more)" counts: every one but the top comment showing.
    public static func hidden(_ notes: [Beanstalk.Note], total: Int) -> Int { max(0, count(notes, total: total) - 1) }

    /// The replies under `id`, a comment at `level` (1 to 3): its own replies, or at level 2 every
    /// reply further down in order, so the 3rd level takes them all; none under the 3rd.
    public static func replies(to id: String, level: Int, in kids: [String: [Beanstalk.Note]]) -> [Beanstalk.Note] {
        guard level < levels else { return [] }
        guard level == levels - 1 else { return kids[id] ?? [] }
        var out: [Beanstalk.Note] = []
        func walk(_ p: String) { for r in kids[p] ?? [] { out.append(r); walk(r.id) } }
        walk(id)
        return out
    }

    /// Every reply under `id`, at any depth.
    public static func descendants(of id: String, in kids: [String: [Beanstalk.Note]]) -> Int {
        (kids[id] ?? []).reduce(0) { $0 + 1 + descendants(of: $1.id, in: kids) }
    }

    /// Whether a comment at `level` gets a Reply button: only top-level ones (Steve: overnesting is hard to follow).
    public static func canReply(level: Int) -> Bool { level == 1 }
}

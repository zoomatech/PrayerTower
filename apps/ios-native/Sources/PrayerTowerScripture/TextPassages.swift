import Foundation

// The library's other collections (the King James Apocrypha, the ancient writings, the oldest texts, the world
// classics) sliced the way the Bible is for its meaning and cascade searches (owner, 5 November 2026: "Add the same
// special overlapping search ingestion of the ancient texts just like was created for the bible search ... If Verses
// dont work use paragraphs and do the same overlapping trick").

/// A passage of a collection as the server's collection file holds it, in reading order: a verse where the work numbers
/// its verses, else a paragraph.
public struct TextPassage: Codable, Hashable, Sendable {
    public let workId: String
    public let ref: String
    public let text: String

    public init(workId: String, ref: String, text: String) {
        self.workId = workId
        self.ref = ref
        self.text = text
    }
}

/// A collection's passages, with a version that changes when its words do, so that an index made from older words is
/// made again.
public struct TextCollection: Sendable {
    public let id: String
    public let title: String
    public let passages: [TextPassage]
    public let version: String

    public init(id: String, title: String, passages: [TextPassage]) {
        self.id = id
        self.title = title
        self.passages = passages
        // FNV-1a over every passage, the same on every device (Swift's own hashes change from run to run).
        var hash: UInt64 = 0xcbf2_9ce4_8422_2325
        for p in passages {
            for byte in (p.workId + "\u{1}" + p.ref + "\u{1}" + p.text + "\u{2}").utf8 {
                hash = (hash ^ UInt64(byte)) &* 0x0000_0100_0000_01b3
            }
        }
        version = String(hash, radix: 16)
    }

    private struct File: Decodable {
        struct Work: Decodable { let id: String; let rights: String }
        let id: String
        let title: String
        let works: [Work]
        let passages: [TextPassage]
    }

    /// The server's collection file (`GET /library/texts/:id`, already unzipped); only public-domain works are kept,
    /// as the server keeps them.
    public init(data: Data) throws {
        let file = try JSONDecoder().decode(File.self, from: data)
        let kept = Set(file.works.filter { $0.rights == "public_domain" }.map(\.id))
        self.init(id: file.id, title: file.title, passages: file.passages.filter { kept.contains($0.workId) })
    }
}

public enum TextGroups {
    /// A paragraph slice grows to about the length of six Bible verses (the KJV's six-verse groups average about 800
    /// characters), and never past six paragraphs.
    public static let paragraphLength = 800
    public static let paragraphsMost = 6

    /// Every passage sliced into overlapping groups, as the Bible's chapters are (`PassageGroups`), never crossing a
    /// work's end:
    /// - a work whose references number its verses ("The Book of Tobit 4:15", "Chapter 1 (The Twin-Verses), verse 6") is
    ///   split by `PassageGroups` itself: six verses every three, never crossing a chapter;
    /// - any other work is split by paragraph: each slice at least two paragraphs, more until it is about six verses
    ///   long, the next starting halfway through it, so that each slice overlaps the next as the Bible's do.
    /// A group's book is its work, its chapter the run of passages it is cut from, and its verses the first and last of
    /// its passages, counted from 1 across the whole collection: passages[firstVerse - 1 ... lastVerse - 1].
    public static func groups(_ passages: [TextPassage]) -> [PassageGroup] {
        var groups: [PassageGroup] = []
        var start = 0
        var run = 0
        while start < passages.count {
            var end = start
            while end < passages.count, passages[end].workId == passages[start].workId { end += 1 }
            let work = start..<end
            if let sections = chapters(Array(passages[work])) {
                // Each chapter a run of its own, its verses numbered by where they are in the collection.
                var verses: [BibleVerse] = []
                var last: String?
                for (i, section) in zip(work, sections) {
                    if section != last { run += 1; last = section }
                    verses.append(BibleVerse(book: passages[i].workId, chapter: run, verse: i + 1, text: passages[i].text))
                }
                groups += PassageGroups.groups(verses)
            } else {
                run += 1
                groups += paragraphs(passages, work, run: run)
            }
            start = end
        }
        return groups
    }

    /// Each passage's chapter, when the work numbers its verses: nine in ten of its references end in a number, and
    /// nine in ten name a verse no other does. A reference without a number is a chapter of its own (Sirach's
    /// prologue). Nil for a work of paragraphs: the Tao Te Ching's "Chapter 1" names several.
    static func chapters(_ work: [TextPassage]) -> [String]? {
        var sections: [String] = []
        var numbered: [String] = []
        for p in work {
            let ref = p.ref.trimmingCharacters(in: .whitespaces)
            let digits = ref.reversed().prefix { $0.isASCII && $0.isNumber }.count
            if digits > 0, digits < ref.count {
                sections.append(String(ref.dropLast(digits)))
                numbered.append(ref)
            } else {
                sections.append(ref)
            }
        }
        let enough = Double(work.count) * 0.9
        guard work.count > 1, Double(numbered.count) >= enough, Double(Set(numbered).count) >= enough else { return nil }
        return sections
    }

    static func paragraphs(_ passages: [TextPassage], _ work: Range<Int>, run: Int) -> [PassageGroup] {
        var groups: [PassageGroup] = []
        var s = work.lowerBound
        while true {
            var e = s + 1
            var length = passages[s].text.count
            while e < work.upperBound, e - s < 2 || (length < paragraphLength && e - s < paragraphsMost) {
                length += passages[e].text.count
                e += 1
            }
            groups.append(PassageGroup(book: passages[s].workId, chapter: run, firstVerse: s + 1, lastVerse: e,
                                       text: passages[s..<e].map(\.text).joined(separator: " ")))
            if e >= work.upperBound { break }
            s = max(s + 1, s + (e - s) / 2)
        }
        return groups
    }
}

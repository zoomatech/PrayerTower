import Foundation

// Ported unchanged from Winstons Syndicate (Packages/ZoomaComicScript/Sources/ZoomaComicScript/VerseFill.swift).

/// A verse reference as written in a caption: "Romans 6:23a", "John 3:16-17", "Psalm 23:1".
public struct VerseReference: Equatable, Sendable {
    /// The book as the Bible texts name it, e.g. "Psalms", "1 John".
    public var book: String
    public var chapter: Int
    public var firstVerse: Int
    public var lastVerse: Int

    /// A verse identity as the writer reads it: one psalm is "Psalm", not the book's name "Psalms" (owner, 28 October
    /// 2026: "A psalm is singular you ass. "Psalms" is what illiterates say.").
    public static func written(_ id: String) -> String {
        id.hasPrefix("Psalms ") ? "Psalm " + id.dropFirst("Psalms ".count) : id
    }

    /// The verse identities, "Book chapter:verse", one for each verse in the reference.
    public var ids: [String] { (firstVerse...lastVerse).map { "\(book) \(chapter):\($0)" } }

    /// Names the KJV texts use, keyed in lower case; a few common spellings are added.
    static let books: [String: String] = {
        let names = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
                     "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
                     "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon",
                     "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
                     "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah",
                     "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
                     "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
                     "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
                     "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"]
        var table = Dictionary(uniqueKeysWithValues: names.map { ($0.lowercased(), $0) })
        table["psalm"] = "Psalms"
        table["song of songs"] = "Song of Solomon"
        table["revelations"] = "Revelation"
        return table
    }()

    /// Reads "Book chapter:verse", with an optional "-verse" range and a trailing part letter ("23a"),
    /// which is kept in the caption as written; the whole verse is quoted.
    public init?(_ written: String) {
        let text = written.trimmingCharacters(in: .whitespaces)
        guard let space = text.lastIndex(of: " "),
              let book = Self.books[text[..<space].trimmingCharacters(in: .whitespaces).lowercased()]
        else { return nil }
        let place = text[text.index(after: space)...].split(separator: ":", omittingEmptySubsequences: false)
        guard place.count == 2, let chapter = Int(place[0]), chapter > 0 else { return nil }
        let verses = place[1].split(separator: "-", omittingEmptySubsequences: false)
        func number(_ s: Substring) -> Int? {
            var digits = s
            if let last = digits.last, last == "a" || last == "b" || last == "c" { digits = digits.dropLast() }
            return Int(digits).flatMap { $0 > 0 ? $0 : nil }
        }
        guard (1...2).contains(verses.count), let first = number(verses[0]) else { return nil }
        let last = verses.count == 2 ? number(verses[1]) : first
        guard let last, last >= first else { return nil }
        self.book = book
        self.chapter = chapter
        self.firstVerse = first
        self.lastVerse = last
    }
}

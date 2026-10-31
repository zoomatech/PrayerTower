import Foundation

// Ported from Winstons Syndicate (Packages/ZoomaBibleSearch/Sources/ZoomaBiblePassages: BibleText.swift and
// PassageGroups.swift), unchanged but for the NRSV, which is left out.

/// The translations searched, each a CSV with the columns Book,Chapter,Verse,Text: the five public-domain ones Winstons
/// Syndicate downloads (scrollmapper's bible_databases). Winstons Syndicate's sixth, the NRSV, is made on Steve's Mac
/// from a copyrighted copy and is never part of Prayer Tower.
public enum BibleTranslation: String, CaseIterable, Codable, Sendable {
    case kjv = "KJV", asv = "ASV", bbe = "BBE", bsb = "BSB", ylt = "YLT"

    /// Where its CSV is downloaded from.
    public var address: URL? {
        URL(string: "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/csv/\(rawValue).csv")!
    }
}

/// A verse of any translation; the same as the bundled KJV's verses.
public typealias BibleVerse = ScriptureVerse

public enum BibleText {
    /// The verses of a translation's CSV, in its order. A verse with no text (a translation that leaves it out) is
    /// skipped.
    public static func verses(csv: String) -> [BibleVerse] {
        var verses: [BibleVerse] = []
        var columns: [Int]?
        for row in rows(csv) {
            guard let at = columns else {
                let names = row.map { $0.trimmingCharacters(in: CharacterSet.whitespaces.union(CharacterSet(charactersIn: "\u{FEFF}"))) }
                let found = ["Book", "Chapter", "Verse", "Text"].compactMap { names.firstIndex(of: $0) }
                guard found.count == 4 else { return [] }
                columns = found
                continue
            }
            let (book, chapter, verse, text) = (at[0], at[1], at[2], at[3])
            guard row.count > max(book, chapter, verse, text), let c = Int(row[chapter]), let v = Int(row[verse]) else { continue }
            let words = row[text].trimmingCharacters(in: .whitespacesAndNewlines)
            guard !words.isEmpty else { continue }
            verses.append(BibleVerse(book: bookName(row[book]), chapter: c, verse: v, text: words))
        }
        return verses
    }

    /// The CSV's names made the app's: "I Samuel" is "1 Samuel", "III John" is "3 John", "Revelation of John" is
    /// "Revelation".
    public static func bookName(_ written: String) -> String {
        let name = written.trimmingCharacters(in: .whitespaces)
        if name == "Revelation of John" { return "Revelation" }
        for (numeral, number) in [("III ", "3 "), ("II ", "2 "), ("I ", "1 ")] where name.hasPrefix(numeral) {
            return number + name.dropFirst(numeral.count)
        }
        return name
    }

    /// The rows of a CSV: fields split at commas, a quoted field may hold commas, line breaks and doubled quotes.
    static func rows(_ csv: String) -> [[String]] {
        var rows: [[String]] = []
        var row: [String] = []
        var field = ""
        var quoted = false
        var iterator = csv.unicodeScalars.makeIterator()
        var pending: Unicode.Scalar?
        func next() -> Unicode.Scalar? {
            if let p = pending { pending = nil; return p }
            return iterator.next()
        }
        while let c = next() {
            if quoted {
                if c == "\"" {
                    if let after = next() {
                        if after == "\"" { field.unicodeScalars.append("\"") } else { quoted = false; pending = after }
                    } else { quoted = false }
                } else {
                    field.unicodeScalars.append(c)
                }
            } else if c == "\"" && field.isEmpty {
                quoted = true
            } else if c == "," {
                row.append(field); field = ""
            } else if c == "\n" || c == "\r" {
                if c == "\r", let after = next(), after != "\n" { pending = after }
                row.append(field); field = ""
                if !(row.count == 1 && row[0].isEmpty) { rows.append(row) }
                row = []
            } else {
                field.unicodeScalars.append(c)
            }
        }
        if !field.isEmpty || !row.isEmpty { row.append(field); rows.append(row) }
        return rows
    }
}


/// Consecutive verses of one chapter, searched as one: remembered stories span several verses (owner, 28 October
/// 2026: "Do NOT index single verses: remembered stories span several verses (e.g. the prodigal son, Luke 15:11-32)").
public struct PassageGroup: Codable, Hashable, Sendable {
    public let book: String
    public let chapter: Int
    public let firstVerse: Int
    public let lastVerse: Int
    public let text: String

    public init(book: String, chapter: Int, firstVerse: Int, lastVerse: Int, text: String) {
        self.book = book
        self.chapter = chapter
        self.firstVerse = firstVerse
        self.lastVerse = lastVerse
        self.text = text
    }

    /// "Luke 15:11-16", or "Obadiah 1:21" for one verse.
    public var reference: String {
        "\(book) \(chapter):\(firstVerse)" + (lastVerse == firstVerse ? "" : "-\(lastVerse)")
    }
}

public enum PassageGroups {
    /// Verses in a group.
    public static let size = 6
    /// A group starts this many verses after the one before, so that each overlaps the next by half
    /// (the owner's test, run_chunking.py: "6-verse windows, stride 3 (within a chapter)").
    public static let stride = 3

    /// Every chapter split into overlapping groups of six verses, never crossing a chapter's end. The last group of a
    /// chapter ends on its last verse; a chapter shorter than six verses is one group.
    public static func groups(_ verses: [BibleVerse]) -> [PassageGroup] {
        var groups: [PassageGroup] = []
        var start = 0
        while start < verses.count {
            var end = start
            while end < verses.count, verses[end].book == verses[start].book, verses[end].chapter == verses[start].chapter { end += 1 }
            let chapter = Array(verses[start..<end])
            var starts = Array(Swift.stride(from: 0, through: max(chapter.count - size, 0), by: stride))
            if let last = starts.last, last + size < chapter.count { starts.append(chapter.count - size) }
            for s in starts {
                let window = chapter[s..<min(s + size, chapter.count)]
                groups.append(PassageGroup(book: window.first!.book, chapter: window.first!.chapter,
                                           firstVerse: window.first!.verse, lastVerse: window.last!.verse,
                                           text: window.map(\.text).joined(separator: " ")))
            }
            start = end
        }
        return groups
    }
}

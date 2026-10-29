import Foundation

// The King James Bible on the device, for the searches ported from Winstons Syndicate
// (Packages/SyndicateCore/Sources/ZoomaReference/VerseSearch.swift). The word search runs on the server
// (GET /library/search); the relationship and fuzzy searches need Apple frameworks and run here.

public struct ScriptureVerse: Codable, Equatable, Identifiable, Sendable {
    public let book: String
    public let chapter: Int
    public let verse: Int
    public let text: String
    public var id: String { "\(book) \(chapter):\(verse)" }
    public init(book: String, chapter: Int, verse: Int, text: String) {
        self.book = book
        self.chapter = chapter
        self.verse = verse
        self.text = text
    }
}

/// Local, immutable verses (KJV, Project Gutenberg eBook #10, public domain), loaded once.
public final class VerseLibrary: @unchecked Sendable {
    private struct Archive: Decodable { let format_version: Int; let verses: [ScriptureVerse] }
    public let verses: [ScriptureVerse]
    /// Each verse's lowercased words, for the relationship search's quick checks.
    let words: [Set<String>]
    var tokenCache: [String: Any] = [:]
    let lock = NSLock()

    public enum ReadError: LocalizedError {
        case missingResource, invalidIndex
        public var errorDescription: String? { "The local verse index could not be loaded." }
    }

    private static let bundled: Result<VerseLibrary, Error> = Result {
        guard let url = Bundle.module.url(forResource: "KJV", withExtension: "json", subdirectory: "Resources") else { throw ReadError.missingResource }
        return try VerseLibrary(data: Data(contentsOf: url))
    }
    public static func loadBundled() throws -> VerseLibrary { try bundled.get() }

    public init(data: Data) throws {
        let archive = try JSONDecoder().decode(Archive.self, from: data)
        guard archive.format_version == 1, !archive.verses.isEmpty,
              Set(archive.verses.map(\.id)).count == archive.verses.count,
              archive.verses.allSatisfy({ !$0.book.isEmpty && $0.chapter > 0 && $0.verse > 0 && !$0.text.isEmpty }) else { throw ReadError.invalidIndex }
        verses = archive.verses
        words = archive.verses.map { Set(ScriptureWords.words($0.text)) }
    }
}

enum ScriptureWords {
    static func words(_ text: String) -> [String] {
        text.lowercased().components(separatedBy: CharacterSet.letters.inverted).filter { !$0.isEmpty }
    }

    /// RelationLanguage.irregular in Winstons Syndicate.
    static let irregular: [String: String] = {
        let families = ["slay slew slain slays slaying", "weep wept weeps weeping", "come came comes coming", "go went gone goes going",
                        "give gave given gives giving", "say said says saying", "speak spoke spoken speaks speaking", "teach taught teaches teaching",
                        "lead led leads leading", "see saw seen sees seeing", "write wrote written writes writing", "know knew known knows knowing",
                        "eat ate eaten eats eating", "drink drank drunk drinks drinking", "take took taken takes taking", "bring brought brings bringing",
                        "be am is are was were been being art wast wert", "have has had having hath hast", "do does did done doing doth dost", "will wilt", "shall shalt", "make made makes making",
                        "run ran runs running", "rise rose risen rises rising", "fall fell fallen falls falling", "forgive forgave forgiven forgives forgiving",
                        "send sent sends sending", "begin began begun begins beginning", "find found finds finding", "leave left leaves leaving",
                        "hear heard hears hearing", "hold held holds holding", "keep kept keeps keeping", "fight fought fights fighting",
                        "buy bought buys buying", "sell sold sells selling", "die died dies dying", "lie lay lain lies lying"]
        var map: [String: String] = [:]
        for family in families { let forms = family.split(separator: " ").map(String.init); for form in forms { map[form] = forms[0] } }
        return map
    }()
}

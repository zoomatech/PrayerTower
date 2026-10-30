#if canImport(NaturalLanguage)
import Foundation

// The hybrid Bible search, ported unchanged from Winstons Syndicate (Packages/ZoomaBibleSearch/Sources/ZoomaBibleHybrid/
// HybridBibleSearch.swift), with one addition (Steve, 30 October 2026): a second meaning search, Apple's sentence
// embedding over the same six-verse groups, taking its turn after EmbeddingGemma's. Apple platforms only: the word
// search's relationship part reads the phrase with Apple's NaturalLanguage tagger (RelationQuery.swift).

/// The hybrid Bible search, for every Bible search in Winston's Syndicate and Comic Script (owner, 29 October 2026:
/// "implement the hybridized comic script bible search then into the program for all of winstons syndicate, including
/// the comic script writer"; "Yeah no switch, mac only, no need to involve claude and the risk of hallucinations";
/// "esp when between the two we get 70+ right"). Three searches on the device, taking turns, a verse found by more than one
/// given once:
/// - by meaning: the fuzzy search (FR-285);
/// - the owner's cascade text search over the same six-verse groups (`CascadeIndex`);
/// - the word and relationship search (FR-284, FR-286).
/// Every verse is the KJV's on the device; no AI is asked (measured 29 October 2026 on the owner's 77 questions: the three
/// together 70, meaning alone 64). A reference typed ("John 3:16") gives its verses.
public struct HybridBibleSearch: Sendable {
    /// Which search found a verse first.
    public enum Finder: Sendable, Equatable { case meaning, appleMeaning, cascade, words }

    public struct Found: Sendable, Equatable {
        public let verse: ScriptureVerse
        public let finder: Finder
        /// Why it is shown, in words for the writer.
        public var explanation: String {
            switch finder {
            case .meaning: "Found by meaning on this device"
            case .appleMeaning: "Found by meaning (Apple) on this device"
            case .cascade: "Found by its words on this device"
            case .words: "Found by the word search on this device"
            }
        }
    }

    public let library: VerseLibrary
    public let fuzzy: FuzzyBibleSearch
    /// Prayer Tower's second meaning search, Apple's sentence embedding over the same groups (Steve, 30 October 2026);
    /// nil leaves Winstons Syndicate's three.
    public let apple: FuzzyBibleSearch?
    /// Where each verse stands in the KJV's order.
    private let position: [String: Int]
    /// How many verses each search gives.
    static let each = 5

    public init(library: VerseLibrary, fuzzy: FuzzyBibleSearch, apple: FuzzyBibleSearch? = nil) {
        self.library = library
        self.fuzzy = fuzzy
        self.apple = apple
        position = Dictionary(library.verses.enumerated().map { ($1.id, $0) }, uniquingKeysWith: { first, _ in first })
    }

    /// The verses that fit what was typed: the first of each search, then the second of each, and so on, in the order
    /// meaning (EmbeddingGemma), meaning (Apple), cascade, word search; a verse found by more than one is given once, as
    /// its first finder's.
    public func search(_ typed: String) async -> [Found] {
        let text = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return [] }
        if VerseReference(text) != nil { return words(text).map { Found(verse: $0, finder: .words) } }
        let lists: [(Finder, [ScriptureVerse])] = [
            (.meaning, await verses(of: (try? await fuzzy.search(text, count: Self.each * 3)) ?? [], nearest: text)),
            (.appleMeaning, await verses(of: (try? await apple?.search(text, count: Self.each * 3)) ?? [], nearest: text)),
            (.cascade, await verses(of: await fuzzy.cascadeSearch(text, count: Self.each * 3), nearest: text)),
            (.words, Array(words(text).prefix(Self.each))),
        ]
        var found: [Found] = []
        for rank in 0..<Self.each {
            for (finder, verses) in lists where rank < verses.count && !found.contains(where: { $0.verse.id == verses[rank].id }) {
                found.append(Found(verse: verses[rank], finder: finder))
            }
        }
        return found
    }

    /// One verse from each of the first five passages, the verse of it nearest the phrase, each verse once (overlapping
    /// passages can give the same verse, so more passages are asked for than the five).
    func verses(of matches: [PassageMatch], nearest text: String) async -> [ScriptureVerse] {
        var chosen: [ScriptureVerse] = []
        for match in matches where chosen.count < Self.each {
            let group = match.group
            let verses = (group.firstVerse...group.lastVerse).compactMap { position["\(group.book) \(group.chapter):\($0)"] }
                .map { library.verses[$0] }
            guard let best = await nearest(text, verses) else { continue }
            if !chosen.contains(where: { $0.id == best.id }) { chosen.append(best) }
        }
        return chosen
    }

    /// The verse of a passage nearest the phrase by the fuzzy search's model; its first verse before that is set up.
    func nearest(_ text: String, _ verses: [ScriptureVerse]) async -> ScriptureVerse? {
        guard verses.count > 1 else { return verses.first }
        let scores = (try? await fuzzy.scores(text, verses.map(\.text))) ?? []
        return scores.indices.max { scores[$0] < scores[$1] }.map { verses[$0] } ?? verses.first
    }

    /// The word search: a reference ("John 3:16-17") gives those verses; otherwise the passages holding every word
    /// come first (the KJV's own forms and synonyms counted, so "Who do people say that I am?" finds "Whom do men say
    /// that I am?"), then what the relationship search finds for a subject and action ("God loved the world"), then
    /// the passages holding most of the words (owner, 28 October 2026: "do both").
    public func words(_ search: String) -> [ScriptureVerse] {
        let text = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return [] }
        if let reference = VerseReference(text) {
            let wanted = Set(reference.ids)
            return library.verses.filter { wanted.contains($0.id) }
        }
        let passages = library.passageSearch(text)
        var related: [ScriptureVerse] = []
        if let query = try? RelationQuery.parse(text) {
            for scope in [VerseSearchScope.relationship, .related] {
                let hits = library.search(query, scope: scope)
                if !hits.isEmpty { related = hits.map(\.verse); break }
            }
        }
        var given = Set<String>()
        return (passages.filter(\.complete).map(\.verse) + related + passages.filter { !$0.complete }.map(\.verse))
            .filter { given.insert($0.id).inserted }
    }
}
#endif

#if canImport(Darwin)
import Foundation

// The hybrid Bible search (HybridBibleSearch) over the library's other collections, all at once: the Apocrypha, the
// ancient writings, the oldest texts and the world classics, sliced as the Bible is (`TextGroups`). Apple platforms only, as the
// meaning search's setup is.

/// Three searches on the device, taking turns as the Bible's do, a passage found by more than one given once:
/// - by meaning: EmbeddingGemma over every collection's slices, made with the model the Bible's setup chose;
/// - the owner's cascade text search over the same slices (`CascadeIndex`): the whole phrase, every essential word, any,
///   then every word's stem;
/// - the passage word search (`VerseLibrary.passageSearch`) over all the collections' passages together: each passage
///   with its neighbours in its work, the KJV's word forms and the Moby Thesaurus's synonyms.
/// Until the meaning index is made, the cascade and the word search answer alone. No AI is asked.
public struct HybridTextSearch: Sendable {
    /// Which search found a passage first.
    public enum Finder: Sendable, Equatable { case meaning, cascade, words }

    public struct Found: Sendable, Equatable {
        /// The collection the passage is in, and where it is there.
        public let collection: String
        public let index: Int
        public let passage: TextPassage
        public let finder: Finder
        /// Why it is shown, in the words the Bible's search uses.
        public var explanation: String {
            switch finder {
            case .meaning: "Found by meaning on this device"
            case .cascade: "Found by its words on this device"
            case .words: "Found by the word search on this device"
            }
        }
    }

    public let collections: [TextCollection]
    public let fuzzy: FuzzyBibleSearch
    /// Every collection's passages one after another, for the word search: each its work as the book, its place here as
    /// the verse.
    let library: VerseLibrary
    /// Where each collection's passages start among them all.
    let start: [String: Int]
    /// Which collection each passage is in, and where.
    let place: [(collection: Int, index: Int)]
    /// How many passages each search gives.
    static let each = 5

    public init(collections: [TextCollection], fuzzy: FuzzyBibleSearch) {
        self.collections = collections
        self.fuzzy = fuzzy
        var start: [String: Int] = [:]
        var place: [(collection: Int, index: Int)] = []
        for (c, collection) in collections.enumerated() {
            start[collection.id] = place.count
            place += collection.passages.indices.map { (c, $0) }
        }
        self.start = start
        self.place = place
        library = VerseLibrary(verses: place.enumerated().map { i, at in
            let p = collections[at.collection].passages[at.index]
            return ScriptureVerse(book: p.workId, chapter: 1, verse: i + 1, text: p.text)
        })
    }

    public init(collection: TextCollection, fuzzy: FuzzyBibleSearch) {
        self.init(collections: [collection], fuzzy: fuzzy)
    }

    /// The passage at a place among them all.
    public func passage(_ i: Int) -> TextPassage { collections[place[i].collection].passages[place[i].index] }

    /// The passages that fit what was typed: the first of each search, then the second of each, and so on, in the order
    /// meaning, cascade, word search; a passage found by more than one is given once, as its first finder's.
    public func search(_ typed: String) async -> [Found] {
        let text = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return [] }
        let lists: [(Finder, [Int])] = [
            (.meaning, await passages(of: (try? await fuzzy.search(text, in: collections, count: Self.each * 3)) ?? [], nearest: text)),
            (.cascade, await passages(of: await fuzzy.cascadeSearch(text, in: collections, count: Self.each * 3), nearest: text)),
            (.words, Array(words(text).prefix(Self.each))),
        ]
        var found: [Found] = []
        var given = Set<Int>()
        for rank in 0..<Self.each {
            for (finder, indexes) in lists where rank < indexes.count && !given.contains(indexes[rank]) {
                given.insert(indexes[rank])
                let at = place[indexes[rank]]
                found.append(Found(collection: collections[at.collection].id, index: at.index, passage: passage(indexes[rank]), finder: finder))
            }
        }
        return found
    }

    /// One passage from each of the first five slices, the passage of it nearest the phrase, each passage once
    /// (overlapping slices can give the same passage, so more are asked for than the five), as places among them all.
    public func passages(of matches: [PassageMatch], nearest text: String) async -> [Int] {
        var chosen: [Int] = []
        for match in matches where chosen.count < Self.each {
            let group = match.group
            guard let first = start[match.name] else { continue }
            let indexes = ((group.firstVerse - 1)..<group.lastVerse).map { first + $0 }.filter { place.indices.contains($0) }
            guard let best = await nearest(text, indexes) else { continue }
            if !chosen.contains(best) { chosen.append(best) }
        }
        return chosen
    }

    /// The passage of a slice nearest the phrase by the meaning search's model; its first passage before that is set up.
    func nearest(_ text: String, _ indexes: [Int]) async -> Int? {
        guard indexes.count > 1 else { return indexes.first }
        let scores = (try? await fuzzy.scores(text, indexes.map { passage($0).text })) ?? []
        return scores.indices.max { scores[$0] < scores[$1] }.map { indexes[$0] } ?? indexes.first
    }

    /// The word search: the passages holding every word first (the KJV's own forms and synonyms counted), then those
    /// holding most of the words; as places among them all.
    public func words(_ search: String) -> [Int] {
        let hits = library.passageSearch(search)
        return (hits.filter(\.complete) + hits.filter { !$0.complete }).map { $0.verse.verse - 1 }
    }
}
#endif

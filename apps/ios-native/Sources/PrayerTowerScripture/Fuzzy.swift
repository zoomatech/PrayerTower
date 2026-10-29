import Foundation
#if canImport(NaturalLanguage)
import NaturalLanguage
#endif

// Fuzzy "remembered story" search, ported from Winstons Syndicate (Packages/ZoomaBibleSearch): no language model.
// Every chapter is split into overlapping groups of six verses that never cross a chapter's end; each group is embedded
// once; a phrase is embedded exactly as typed and the groups nearest it by cosine similarity are returned.
// Winstons Syndicate embeds with EmbeddingGemma 300M through ONNX Runtime (a 168 MB download, macOS only). Here the
// embedder is Apple's built-in English sentence embedding (NaturalLanguage), which needs no download; any other
// `SentenceEmbedder` (for example EmbeddingGemma, later) can be swapped in.

/// Consecutive verses of one chapter, searched as one (remembered stories span several verses).
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
    /// A group starts this many verses after the one before, so that each overlaps the next by half.
    public static let stride = 3

    /// Every chapter split into overlapping groups of six verses, never crossing a chapter's end. The last group of a
    /// chapter ends on its last verse; a chapter shorter than six verses is one group.
    public static func groups(_ verses: [ScriptureVerse]) -> [PassageGroup] {
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

/// Turns text into a vector. Returns nil for text it cannot embed.
public protocol SentenceEmbedder: Sendable {
    /// The name the index is kept under; a different embedder makes a new index.
    var name: String { get }
    func vector(_ text: String) -> [Float]?
}

/// The groups with a unit-length vector for each.
public struct FuzzyIndex: Sendable {
    public let groups: [PassageGroup]
    public let dimensions: Int
    /// Unit-length vectors, one after another, `dimensions` numbers each, in the groups' order.
    let vectors: [Float]

    public init(groups: [PassageGroup], vectors: [[Float]]) {
        precondition(groups.count == vectors.count && !vectors.isEmpty)
        self.groups = groups
        dimensions = vectors[0].count
        self.vectors = vectors.flatMap(FuzzyIndex.unit)
    }

    init(groups: [PassageGroup], dimensions: Int, flat: [Float]) {
        self.groups = groups
        self.dimensions = dimensions
        vectors = flat
    }

    /// The vector made unit length, so that a dot product is the cosine similarity.
    public static func unit(_ vector: [Float]) -> [Float] {
        let length = vector.reduce(0) { $0 + $1 * $1 }.squareRoot()
        return length > 0 ? vector.map { $0 / length } : vector
    }

    /// The groups nearest the query by cosine similarity, best first.
    public func nearest(_ query: [Float], count: Int = 5) -> [FuzzyMatch] {
        guard query.count == dimensions else { return [] }
        let unit = Self.unit(query)
        var scored: [(Int, Float)] = []
        scored.reserveCapacity(groups.count)
        vectors.withUnsafeBufferPointer { all in
            for i in groups.indices {
                var dot: Float = 0
                let base = i * dimensions
                for d in 0..<dimensions { dot += all[base + d] * unit[d] }
                scored.append((i, dot))
            }
        }
        scored.sort { $0.1 != $1.1 ? $0.1 > $1.1 : groups[$0.0].reference < groups[$1.0].reference }
        return scored.prefix(count).map { FuzzyMatch(group: groups[$0.0], score: $0.1) }
    }

    // MARK: Kept on the device

    struct Contents: Codable {
        let embedder: String
        let dimensions: Int
        let groups: [PassageGroup]
    }

    /// Writes the groups, then the vectors; an index is whole only when both are there and agree.
    public func save(in folder: URL, embedder: String) throws {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try JSONEncoder().encode(Contents(embedder: embedder, dimensions: dimensions, groups: groups))
            .write(to: folder.appendingPathComponent("KJV.groups.json"), options: .atomic)
        try vectors.withUnsafeBufferPointer { Data(buffer: $0) }.write(to: folder.appendingPathComponent("KJV.vectors"), options: .atomic)
    }

    /// The index in the folder, if it is whole and was made by the embedder named.
    public static func load(from folder: URL, embedder: String) -> FuzzyIndex? {
        guard let data = try? Data(contentsOf: folder.appendingPathComponent("KJV.groups.json")),
              let contents = try? JSONDecoder().decode(Contents.self, from: data),
              contents.embedder == embedder, contents.dimensions > 0,
              let raw = try? Data(contentsOf: folder.appendingPathComponent("KJV.vectors")),
              raw.count == contents.groups.count * contents.dimensions * MemoryLayout<Float>.size else { return nil }
        let flat = raw.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
        return FuzzyIndex(groups: contents.groups, dimensions: contents.dimensions, flat: flat)
    }
}

/// A group found for a phrase, and how near it came.
public struct FuzzyMatch: Equatable, Sendable {
    public let group: PassageGroup
    public let score: Float
    public var reference: String { group.reference }
}

/// The fuzzy search: made ready once (a minute or so the first time; the index is kept in Caches afterwards).
public actor FuzzyScripture {
    public enum State: Equatable, Sendable {
        case notReady
        /// "Indexing 1200 of 10500 passages".
        case preparing(done: Int, of: Int)
        case ready
        case failed(String)
    }

    public private(set) var state: State = .notReady
    private var index: FuzzyIndex?
    private let embedder: any SentenceEmbedder
    private let folder: URL

    public init(embedder: any SentenceEmbedder, folder: URL) {
        self.embedder = embedder
        self.folder = folder
    }

    /// Loads the kept index, or makes it from the verses and keeps it.
    public func prepare(_ library: VerseLibrary, report: @escaping @Sendable (State) -> Void = { _ in }) async {
        if case .ready = state { return }
        if case .preparing = state { return }
        if let kept = FuzzyIndex.load(from: folder, embedder: embedder.name) {
            index = kept
            set(.ready, report)
            return
        }
        let groups = PassageGroups.groups(library.verses)
        var kept: [PassageGroup] = []
        var vectors: [[Float]] = []
        for (i, group) in groups.enumerated() {
            if let v = embedder.vector(group.text), !v.isEmpty, vectors.first.map({ $0.count == v.count }) ?? true {
                kept.append(group)
                vectors.append(v)
            }
            if i % 200 == 0 {
                set(.preparing(done: i, of: groups.count), report)
                await Task.yield()
            }
        }
        guard !vectors.isEmpty else { return set(.failed("No passages could be indexed on this device."), report) }
        let made = FuzzyIndex(groups: kept, vectors: vectors)
        try? made.save(in: folder, embedder: embedder.name)
        index = made
        set(.ready, report)
    }

    /// The nearest passages for the phrase, as typed; none until ready.
    public func search(_ phrase: String, count: Int = 5) -> [FuzzyMatch] {
        guard let index, !phrase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, let query = embedder.vector(phrase) else { return [] }
        return index.nearest(query, count: count)
    }

    private func set(_ new: State, _ report: @Sendable (State) -> Void) {
        state = new
        report(new)
    }
}

#if canImport(NaturalLanguage)
/// Apple's built-in English sentence embedding: on the device, no download, no language model.
public final class AppleSentenceEmbedder: SentenceEmbedder, @unchecked Sendable {
    public let name: String
    private let embedding: NLEmbedding
    private let lock = NSLock()

    public init?() {
        guard let embedding = NLEmbedding.sentenceEmbedding(for: .english) else { return nil }
        self.embedding = embedding
        name = "apple-sentence-en-r\(embedding.revision)-d\(embedding.dimension)"
    }

    public func vector(_ text: String) -> [Float]? {
        // NLEmbedding is not documented as thread-safe, so one call at a time.
        lock.lock(); defer { lock.unlock() }
        return embedding.vector(for: text).map { $0.map(Float.init) }
    }
}
#endif

import Foundation

// Word study, highlights and notes, and offline texts, as the Expo app's word-study.tsx and my-notes.tsx
// (docs/LIBRARY_SEARCH.md). All three are off unless an admin turns them on. Word study is offered only where the
// King James Bible is; notes are private unless shared with one of the member's circles; offline copies are
// only of the collections the member's community is offered.

/// A King James verse word by word; tagged words carry Strong's numbers (H… Hebrew, G… Greek).
public struct WordVerse: Codable, Sendable, Equatable {
    public struct Word: Codable, Sendable, Equatable {
        public let text: String
        public let strongs: [String]
    }
    public struct Root: Codable, Sendable, Equatable {
        public let lemma: String
        public let translit: String
    }
    public let ref: String
    public let citation: String
    public let key: String
    public let words: [Word]
    public let roots: [String: Root]

    /// What a screen reader says for a tagged word: "beginning: rêʼshîyth (H7225)".
    public func spoken(_ word: Word) -> String {
        "\(word.text): " + word.strongs.map { "\(roots[$0]?.translit ?? "") (\($0))" }.joined(separator: ", ")
    }
}

/// One Strong's number: the word, what it means, and verses that use it, a page at a time.
public struct WordEntry: Codable, Sendable, Equatable {
    public struct Use: Codable, Sendable, Equatable, Identifiable {
        public let ref: String
        public let text: String
        /// How the King James renders the word in this verse.
        public let `as`: [String]
        public let citation: String
        public let key: String
        public var id: String { ref }
    }
    public let id: String
    /// Hebrew | Greek
    public let language: String
    public let lemma: String
    public let translit: String
    public let pron: String
    public let derivation: String
    public let definition: String
    public let kjv: String
    public let total: Int
    public var verses: [Use]
}

/// A member's highlight and/or note on a passage.
public struct LibraryNote: Codable, Sendable, Equatable, Identifiable {
    public struct Circle: Codable, Sendable, Equatable {
        public let id: String
        public let name: String
        public init(id: String, name: String) {
            self.id = id
            self.name = name
        }
    }
    public let id: String
    public let collection: String
    public let workId: String
    public let ref: String
    public let key: String
    public let quote: String
    public let citation: String
    /// yellow | green | blue | pink
    public let color: String?
    public let note: String?
    public let circle: Circle?
    public let updatedAt: String
    /// Set on notes shared in a circle: who wrote it, and whether it was this member.
    public var author: String? = nil
    public var mine: Bool? = nil
}

public struct LibraryNotes: Codable, Sendable, Equatable {
    public let notes: [LibraryNote]
}

/// Saving a mark. Unlike other patches, a nil here clears the field (the server keeps fields left out).
public struct LibraryNoteInput: Encodable, Sendable, Equatable {
    public var collection: String
    public var key: String
    public var color: String?
    public var note: String?
    public var circleId: String?
    public init(collection: String, key: String, color: String?, note: String?, circleId: String?) {
        self.collection = collection
        self.key = key
        self.color = color
        self.note = note
        self.circleId = circleId
    }
    enum CodingKeys: String, CodingKey { case collection, key, color, note, circleId }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(collection, forKey: .collection)
        try c.encode(key, forKey: .key)
        try c.encode(color, forKey: .color)
        let text = note?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        try c.encode(text.isEmpty ? nil : text, forKey: .note)
        // A colour alone is never shared.
        try c.encode(text.isEmpty ? nil : circleId, forKey: .circleId)
    }
}

public enum NoteColors {
    public static let all = ["yellow", "green", "blue", "pink"]
}

struct SavedNote: Decodable { let note: LibraryNote? }

/// What can be downloaded for offline reading.
public struct OfflineCollections: Decodable, Sendable, Equatable {
    public struct Item: Codable, Sendable, Equatable, Identifiable {
        public let id: String
        public let title: String
        public let faith: Bool
        /// Changes whenever the collection is rebuilt; a copy with another version is out of date.
        public let version: String
        public let bytes: Int
        public let passages: Int
    }
    public let enabled: Bool
    public let collections: [Item]
    enum CodingKeys: String, CodingKey { case enabled, collections }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try c.decode(Bool.self, forKey: .enabled)
        collections = try c.decodeIfPresent([Item].self, forKey: .collections) ?? []
    }
}

/// A downloaded collection, as the server builds it (data/library/<id>.json.gz).
public struct OfflineCollectionFile: Codable, Sendable {
    public struct Work: Codable, Sendable {
        public let id: String
        public let title: String
        public let author: String
    }
    public struct Passage: Codable, Sendable {
        public let workId: String
        public let ref: String
        public let text: String
    }
    public let id: String
    public let title: String
    public let source: String
    public let works: [Work]
    public let passages: [Passage]

    /// The same credit the server gives a passage.
    public func citation(_ p: Passage, work: Work) -> String {
        if id == Library.bible { return "\(p.ref) (King James Bible)" }
        if id == "apocrypha-kjv" { return "\(p.ref) (King James Apocrypha)" }
        let place = !p.ref.isEmpty && p.ref != work.title ? "\(work.title), \(p.ref)" : work.title
        return work.author.isEmpty ? place : "\(place) (\(work.author))"
    }

    /// A plain search with no signal: passages holding every word first, then most words, in text order.
    /// Simpler than the server's (no old forms or synonyms), and says so on screen.
    public func search(_ q: String, limit: Int = 50) -> (total: Int, hits: [LibraryHit]) {
        let words = OfflineCollectionFile.words(q)
        guard !words.isEmpty else { return (0, []) }
        let byId = Dictionary(works.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        var found: [(score: Int, index: Int)] = []
        for (i, p) in passages.enumerated() {
            let have = Set(OfflineCollectionFile.words(p.text))
            let score = words.filter { have.contains($0) }.count
            if score * 2 >= words.count, score > 0 { found.append((score, i)) }
        }
        found.sort { $0.score != $1.score ? $0.score > $1.score : $0.index < $1.index }
        let hits = found.prefix(limit).compactMap { f -> LibraryHit? in
            let p = passages[f.index]
            guard let w = byId[p.workId] else { return nil }
            return LibraryHit(ref: p.ref, text: p.text, complete: f.score == words.count, work: .init(id: w.id, title: w.title, author: w.author), citation: citation(p, work: w))
        }
        return (found.count, hits)
    }

    static func words(_ s: String) -> [String] {
        s.lowercased().split { !$0.isLetter && !$0.isNumber }.map(String.init)
    }
}

/// Downloaded collections, kept in Application Support so they stay until the member removes them.
public struct OfflineLibrary: Sendable {
    public struct Kept: Codable, Sendable, Equatable {
        public let id: String
        public let title: String
        public let version: String
        public let bytes: Int
    }
    public let folder: URL

    public init(folder: URL? = nil) {
        self.folder = folder ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("OfflineTexts", isDirectory: true)
    }

    private var index: URL { folder.appendingPathComponent("kept.json") }
    private func file(_ id: String) -> URL { folder.appendingPathComponent("\(id).json") }

    public func kept() -> [Kept] {
        guard let data = try? Data(contentsOf: index) else { return [] }
        return (try? JSONDecoder().decode([Kept].self, from: data)) ?? []
    }

    /// Keeps a downloaded collection (the server's JSON, already unzipped) after checking it reads.
    public func keep(_ item: OfflineCollections.Item, data: Data) throws {
        _ = try JSONDecoder().decode(OfflineCollectionFile.self, from: data)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try data.write(to: file(item.id), options: .atomic)
        var list = kept().filter { $0.id != item.id }
        list.append(Kept(id: item.id, title: item.title, version: item.version, bytes: data.count))
        try JSONEncoder().encode(list).write(to: index, options: .atomic)
    }

    public func remove(_ id: String) throws {
        try? FileManager.default.removeItem(at: file(id))
        try JSONEncoder().encode(kept().filter { $0.id != id }).write(to: index, options: .atomic)
    }

    public func open(_ id: String) -> OfflineCollectionFile? {
        guard kept().contains(where: { $0.id == id }), let data = try? Data(contentsOf: file(id)) else { return nil }
        return try? JSONDecoder().decode(OfflineCollectionFile.self, from: data)
    }
}

extension APIClient {
    public func wordVerse(_ ref: String) async throws -> WordVerse { try await get("/library/words", query: ["ref": ref]) }
    public func wordEntry(_ id: String, offset: Int = 0, limit: Int = Library.page) async throws -> WordEntry {
        try await get("/library/words/\(id)", query: ["offset": String(offset), "limit": String(limit)])
    }
    public func libraryNotes(collection: String? = nil) async throws -> [LibraryNote] {
        try await (get("/library/notes", query: collection.map { ["collection": $0] } ?? [:]) as LibraryNotes).notes
    }
    /// Saves a mark; nil when clearing both colour and note removed it.
    public func saveLibraryNote(_ input: LibraryNoteInput) async throws -> LibraryNote? {
        try await (send(body(request("PUT", "/library/notes"), input)) as SavedNote).note
    }
    public func deleteLibraryNote(_ id: String) async throws {
        let _: [String: Bool] = try await send(request("DELETE", "/library/notes/\(id)"))
    }
    public func circleLibraryNotes(_ circleId: String) async throws -> [LibraryNote] {
        try await (get("/library/notes/circle/\(circleId)") as LibraryNotes).notes
    }
    public func offlineCollections() async throws -> OfflineCollections { try await get("/library/offline") }
    /// The collection's file. URLSession unzips it (it comes with Content-Encoding: gzip).
    public func downloadCollection(_ id: String) async throws -> Data {
        var r = try await request("GET", "/library/offline/\(id)")
        r.timeoutInterval = 120
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: r)
        } catch {
            throw OfflineError.from(error)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if !(200..<300).contains(status) { let _: [String: String] = try decode(data, status: status) }
        return data
    }
}

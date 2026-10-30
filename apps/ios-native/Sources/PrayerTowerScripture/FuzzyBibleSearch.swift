#if canImport(Darwin)
import Foundation

// Fuzzy Bible search with no language model, ported from Winstons Syndicate (Packages/ZoomaBibleSearch/Sources/
// ZoomaBibleSearch: EmbeddingModel.swift and FuzzyBibleSearch.swift): the same models at the same revisions with their
// cards' prompts, the same downloads, groups, index and searches. Apple platforms only (the downloads and the app's
// ONNX Runtime); the groups, index and scoring it uses are platform-neutral and tested on Linux too.

/// An embedding model run on the device: App/OnnxEmbedder.swift (Winstons Syndicate's OnnxEmbedder).
public protocol PassageEmbedder: Sendable {
    /// The phrase searched for, exactly as typed, after the model's query prompt.
    func query(_ phrase: String) throws -> [Float]
    /// Each group's text after the model's document prompt.
    func documents(_ texts: [String]) throws -> [[Float]]
}

/// An embedding model's ONNX copy on Hugging Face, at a fixed revision, with the prompts its model card gives.
public struct EmbeddingModel: Sendable, Equatable {
    /// The name its index is kept under.
    public let key: String
    public let repository: String
    public let revision: String
    /// The ONNX graph, its weights beside it, and the tokenizer's files, as paths in the repository.
    public let onnx: String
    public let files: [String]
    /// Put before the phrase searched for, and before each group's text, as the model card says.
    public let queryPrompt: String
    public let documentPrompt: String

    /// EmbeddingGemma 300M, 4-bit (owner, 28 October 2026: "Best: EmbeddingGemma 300M, browser/ONNX copy:
    /// onnx-community/embeddinggemma-300m-ONNX (about 168 MB at q4 ...)"). Its card: "task: search result | query: "
    /// for a query, "title: none | text: " for a document.
    public static let embeddingGemma = EmbeddingModel(
        key: "embeddinggemma-300m-q4",
        repository: "onnx-community/embeddinggemma-300m-ONNX",
        revision: "5090578d9565bb06545b4552f76e6bc2c93e4a66",
        onnx: "onnx/model_q4.onnx",
        files: ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "added_tokens.json",
                "onnx/model_q4.onnx", "onnx/model_q4.onnx_data"],
        queryPrompt: "task: search result | query: ",
        documentPrompt: "title: none | text: ")

    /// IBM granite small English r2 (47M), 4-bit, the smaller fallback (owner: "Smaller fallback:
    /// ibm-granite/granite-embedding-small-english-r2 (47M), ONNX: onnx-community/granite-embedding-small-english-r2-ONNX").
    /// Its card gives no prompt: queries and passages are encoded as they are.
    public static let graniteSmall = EmbeddingModel(
        key: "granite-embedding-small-english-r2-q4",
        repository: "onnx-community/granite-embedding-small-english-r2-ONNX",
        revision: "1dc7835ba0cb9c76a3618d0bf0c427c97671b3c8",
        onnx: "onnx/model_q4.onnx",
        files: ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json",
                "onnx/model_q4.onnx", "onnx/model_q4.onnx_data"],
        queryPrompt: "",
        documentPrompt: "")

    /// Best first.
    public static let all = [embeddingGemma, graniteSmall]

    /// Apple's built-in English sentence embedding (NaturalLanguage), Prayer Tower's second meaning search beside
    /// EmbeddingGemma (Steve, 30 October 2026: "The apple fallback isnt a fallback - ITs PART OF THE NECEssary hybrid
    /// search"). Nothing to download; `AppleSentenceEmbedder` runs it.
    public static let appleSentence = EmbeddingModel(
        key: "apple-sentence-en", repository: "apple/NaturalLanguage", revision: "", onnx: "", files: [],
        queryPrompt: "", documentPrompt: "")

    public func address(_ file: String) -> URL {
        URL(string: "https://huggingface.co/\(repository)/resolve/\(revision)/\(file)")!
    }
}

/// Fuzzy search of the Bible with no language model (owner, 28 October 2026). At setup, once: the five translations'
/// texts and the embedding model are downloaded into the folder, every translation is split into overlapping groups of
/// six verses and each group is embedded. At search time the phrase is embedded exactly as typed, never rewritten, and
/// the nearest groups by cosine similarity are returned, merged across translations by reference, best score kept.
public actor FuzzyBibleSearch {
    public enum State: Equatable, Sendable {
        case notReady
        /// What is being done: "Downloading BSB", "Indexing KJV: 1200 of 9586 groups".
        case preparing(String)
        /// Searching with the model named.
        case ready(String)
        case failed(String)
    }

    public private(set) var state: State = .notReady
    public let folder: URL
    /// Loads a model from the folder its files were downloaded to (App/OnnxEmbedder.swift: ONNX Runtime).
    private let load: @Sendable (EmbeddingModel, URL) async throws -> any PassageEmbedder
    private var embedder: (any PassageEmbedder)?
    private var indexes: [PassageIndex] = []
    /// Groups embedded together.
    static let batch = 16

    public init(folder: URL, load: @escaping @Sendable (EmbeddingModel, URL) async throws -> any PassageEmbedder = { _, _ in throw NoEmbedder() }) {
        self.folder = folder
        self.load = load
    }

    public struct NoEmbedder: Error, CustomStringConvertible {
        public init() {}
        public var description: String { "no embedding model on this device" }
    }

    /// The setup: EmbeddingGemma first, and the smaller model if EmbeddingGemma cannot be had or run. What is already in
    /// the folder is kept: a second setup only loads it.
    public func prepare(models: [EmbeddingModel] = EmbeddingModel.all, report: @escaping @Sendable (State) -> Void = { _ in }) async {
        if case .preparing = state { return }
        if case .ready = state { return }
        var problems: [String] = []
        for model in models {
            do {
                try await prepare(model, report: report)
                set(.ready(model.repository), report)
                return
            } catch {
                problems.append("\(model.repository): \(error)")
            }
        }
        set(.failed(problems.joined(separator: "; ")), report)
    }

    /// Each translation's cascade text search, made from its groups the first time it is asked.
    private var cascades: [CascadeIndex] = []

    /// The top groups for the phrase, as typed, by the owner's hybrid (`PassageSearch.blended`): 0.7 meaning, 0.3 the
    /// cascade text search; none until the setup is done.
    public func blendedSearch(_ phrase: String, count: Int = 5) throws -> [PassageMatch] {
        guard let embedder, !indexes.isEmpty, !phrase.isEmpty else { return [] }
        if cascades.count != indexes.count { cascades = indexes.map { CascadeIndex($0.groups.map(\.text)) } }
        return PassageSearch.blended(try embedder.query(phrase), phrase, in: Array(zip(indexes, cascades)), count: count)
    }

    /// The top groups for the phrase, as typed, by the owner's cascade text search alone (`PassageSearch.cascade`);
    /// none until the index is loaded.
    public func cascadeSearch(_ phrase: String, count: Int = 5) -> [PassageMatch] {
        guard !indexes.isEmpty, !phrase.isEmpty else { return [] }
        if cascades.count != indexes.count { cascades = indexes.map { CascadeIndex($0.groups.map(\.text)) } }
        return PassageSearch.cascade(phrase, in: Array(zip(indexes, cascades)), count: count)
    }

    /// Whether the folder holds the model's files and its index for every translation that can be downloaded, so that a
    /// setup there only loads and writes nothing (the app's own Resources are read-only). One made on the device is used
    /// when its index is there.
    public static func isComplete(_ folder: URL, model: EmbeddingModel) -> Bool {
        let modelFolder = folder.appending(path: "models").appending(path: model.repository)
        let indexFolder = folder.appending(path: "index").appending(path: model.key)
        let paths = model.files.map { modelFolder.appending(path: $0).path }
            + BibleTranslation.allCases.filter { $0.address != nil }.flatMap { translation in
                ["groups.json", "vectors"].map { indexFolder.appending(path: "\(translation.rawValue).\($0)").path }
            }
        return paths.allSatisfy { FileManager.default.fileExists(atPath: $0) }
    }

    /// The top groups for the phrase, as typed; none until the setup is done.
    public func search(_ phrase: String, count: Int = 5) throws -> [PassageMatch] {
        guard let embedder, !indexes.isEmpty, !phrase.isEmpty else { return [] }
        return PassageSearch.nearest(try embedder.query(phrase), in: indexes, count: count)
    }

    /// How near each text is to the phrase, as typed, by cosine similarity: used to choose the one verse of a passage
    /// found that comes nearest. Empty until the setup is done.
    public func scores(_ phrase: String, _ texts: [String]) throws -> [Float] {
        guard let embedder, !texts.isEmpty else { return [] }
        let query = PassageIndex.unit(try embedder.query(phrase))
        return try embedder.documents(texts).map { vector in zip(query, PassageIndex.unit(vector)).reduce(0) { $0 + $1.0 * $1.1 } }
    }

    private func set(_ new: State, _ report: @Sendable (State) -> Void) {
        state = new
        report(new)
    }

    private func prepare(_ model: EmbeddingModel, report: @escaping @Sendable (State) -> Void) async throws {
        let modelFolder = folder.appending(path: "models").appending(path: model.repository)
        for file in model.files {
            let target = modelFolder.appending(path: file)
            if !FileManager.default.fileExists(atPath: target.path) {
                set(.preparing("Downloading \(model.repository) \(file)"), report)
                try await Self.download(model.address(file), to: target)
            }
        }
        let embedder = try await load(model, modelFolder)
        let indexFolder = folder.appending(path: "index").appending(path: model.key)
        var made: [PassageIndex] = []
        for translation in BibleTranslation.allCases {
            if let kept = PassageIndex.load(translation, from: indexFolder, model: model.key) {
                made.append(kept)
                continue
            }
            let text = folder.appending(path: "texts").appending(path: "\(translation.rawValue).csv")
            if !FileManager.default.fileExists(atPath: text.path) {
                // A translation with no address is left out until its text is there.
                guard let address = translation.address else { continue }
                set(.preparing("Downloading \(translation.rawValue)"), report)
                try await Self.download(address, to: text)
            }
            let groups = PassageGroups.groups(BibleText.verses(csv: try String(contentsOf: text, encoding: .utf8)))
            guard !groups.isEmpty else { throw SetupError.noVerses(translation.rawValue) }
            // Longest first, so that each batch holds texts of about one length.
            let order = groups.indices.sorted { groups[$0].text.count > groups[$1].text.count }
            var vectors = [[Float]](repeating: [], count: groups.count)
            for start in Swift.stride(from: 0, to: order.count, by: Self.batch) {
                let some = Array(order[start..<min(start + Self.batch, order.count)])
                for (i, vector) in zip(some, try embedder.documents(some.map { groups[$0].text })) { vectors[i] = vector }
                set(.preparing("Indexing \(translation.rawValue): \(min(start + Self.batch, order.count)) of \(groups.count) groups"), report)
                await Task.yield()
            }
            let index = PassageIndex(translation: translation, groups: groups, vectors: vectors)
            try index.save(in: indexFolder, model: model.key)
            made.append(index)
        }
        self.embedder = embedder
        indexes = made
    }

    /// The header its downloads carry.
    static let userAgent = "PrayerTower (https://github.com/zoomatech/PrayerTower)"

    private static func download(_ address: URL, to target: URL) async throws {
        var request = URLRequest(url: address)
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        let (file, response) = try await URLSession.shared.download(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw SetupError.download(address.absoluteString, (response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? FileManager.default.removeItem(at: target)
        try FileManager.default.moveItem(at: file, to: target)
    }

    enum SetupError: Error, CustomStringConvertible {
        case download(String, Int), noVerses(String)
        var description: String {
            switch self {
            case .download(let address, let status): "\(address) answered \(status)"
            case .noVerses(let name): "\(name) held no verses"
            }
        }
    }
}
#if canImport(NaturalLanguage)
import NaturalLanguage

/// Apple's built-in English sentence embedding, on the device with no download: the hybrid's second meaning search.
public final class AppleSentenceEmbedder: PassageEmbedder, @unchecked Sendable {
    private let embedding: NLEmbedding
    // NLEmbedding is not documented as thread-safe, so one call at a time.
    private let lock = NSLock()

    public init?() {
        guard let embedding = NLEmbedding.sentenceEmbedding(for: .english) else { return nil }
        self.embedding = embedding
    }

    public func query(_ phrase: String) throws -> [Float] { vector(phrase) }

    public func documents(_ texts: [String]) throws -> [[Float]] { texts.map(vector) }

    /// The text's vector; zeros, which match nothing, where Apple's embedding gives none.
    private func vector(_ text: String) -> [Float] {
        lock.lock(); defer { lock.unlock() }
        if let v = embedding.vector(for: text) { return v.map(Float.init) }
        return [Float](repeating: 0, count: embedding.dimension)
    }
}
#endif
#endif

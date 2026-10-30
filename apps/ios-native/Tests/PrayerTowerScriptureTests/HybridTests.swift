#if canImport(NaturalLanguage)
import Foundation
import Testing
@testable import PrayerTowerScripture

// Ported unchanged from Winstons Syndicate (Packages/ZoomaBibleSearch/Tests/ZoomaBibleHybridTests/HybridTests.swift).

struct HybridSearchTests {
    // No index in the folder: the meaning and cascade searches give nothing, the word search answers alone.
    let search = HybridBibleSearch(library: try! VerseLibrary.loadBundled(),
                                   fuzzy: FuzzyBibleSearch(folder: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)))

    @Test func beforeTheIndexIsLoadedTheWordSearchAnswersAlone() async {
        let found = await search.search("God so loved the world")
        #expect(!found.isEmpty && found.allSatisfy { $0.finder == .words })
        #expect(found.count <= 5)
        #expect(Set(found.map(\.verse.id)).count == found.count)
    }

    @Test func aReferenceGivesItsVerses() async {
        let found = await search.search("John 3:16-17")
        #expect(found.map(\.verse.id) == ["John 3:16", "John 3:17"])
    }
}
/// Prayer Tower's addition: Apple's sentence embedding as a second meaning search, over the same six-verse groups.
struct AppleMeaningTests {
    @Test func appleMeaningTakesItsTurnAfterGemmaWithEachVerseOnce() async throws {
        guard let embedder = AppleSentenceEmbedder() else { return }
        let library = try VerseLibrary.loadBundled()
        // A few chapters' groups as every translation's index, so that the setup only loads them and downloads nothing.
        let chapters: Set = ["Genesis 6", "Genesis 7", "Exodus 20", "Luke 15", "Judges 4"]
        let groups = PassageGroups.groups(library.verses.filter { chapters.contains("\($0.book) \($0.chapter)") })
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let indexFolder = folder.appendingPathComponent("index").appendingPathComponent(EmbeddingModel.appleSentence.key)
        let vectors = try embedder.documents(groups.map(\.text))
        for translation in BibleTranslation.allCases {
            try PassageIndex(translation: translation, groups: groups, vectors: vectors).save(in: indexFolder, model: EmbeddingModel.appleSentence.key)
        }
        let apple = FuzzyBibleSearch(folder: folder) { _, _ in embedder }
        await apple.prepare(models: [.appleSentence])
        #expect(await apple.state == .ready(EmbeddingModel.appleSentence.repository))

        // Gemma has no index here, so the Apple meaning search and the word search answer, taking turns.
        let gemma = FuzzyBibleSearch(folder: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let hybrid = HybridBibleSearch(library: library, fuzzy: gemma, apple: apple)
        let found = await hybrid.search("the man who built an ark of gopher wood before the flood")
        #expect(found.first?.finder == .appleMeaning)
        #expect(found.contains { $0.finder == .appleMeaning && $0.verse.book == "Genesis" && [6, 7].contains($0.verse.chapter) })
        #expect(found.contains { $0.finder == .words })
        #expect(Set(found.map(\.verse.id)).count == found.count)
        #expect(found.first?.explanation == "Found by meaning (Apple) on this device")
    }
}
#endif

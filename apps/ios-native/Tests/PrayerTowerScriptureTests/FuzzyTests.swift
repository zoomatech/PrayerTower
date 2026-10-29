import Foundation
import Testing
@testable import PrayerTowerScripture

/// Counts letters a, e, i, o, u: enough to tell texts apart in a test, with no model.
struct VowelEmbedder: SentenceEmbedder {
    let name = "vowels"
    func vector(_ text: String) -> [Float]? {
        let t = text.lowercased()
        return "aeiou".map { v in Float(t.filter { $0 == v }.count) + 0.01 }
    }
}

@Suite struct ScriptureTests {
    func chapter(_ book: String, _ number: Int, verses: Int) -> [ScriptureVerse] {
        (1...verses).map { ScriptureVerse(book: book, chapter: number, verse: $0, text: "v\($0)") }
    }

    @Test func bundledKingJamesHasEveryVerse() throws {
        let library = try VerseLibrary.loadBundled()
        #expect(library.verses.count == 31_102)
        #expect(Set(library.verses.map(\.book)).count == 66)
        #expect(library.verses.first { $0.id == "John 11:35" }?.text == "Jesus wept.")
    }

    @Test func sixVersesEveryThreeAndTheLastEndsTheChapter() {
        let groups = PassageGroups.groups(chapter("Luke", 15, verses: 14))
        #expect(groups.map(\.reference) == ["Luke 15:1-6", "Luke 15:4-9", "Luke 15:7-12", "Luke 15:9-14"])
        #expect(groups[0].text == "v1 v2 v3 v4 v5 v6")
    }

    @Test func neverCrossesAChapterAndAShortChapterIsOneGroup() {
        let groups = PassageGroups.groups(chapter("Psalms", 117, verses: 2) + chapter("Psalms", 118, verses: 6))
        #expect(groups.map(\.reference) == ["Psalms 117:1-2", "Psalms 118:1-6"])
        #expect(PassageGroups.groups(chapter("Obadiah", 1, verses: 1)).map(\.reference) == ["Obadiah 1:1"])
    }

    @Test func nearestByCosineAndKeptOnTheDevice() throws {
        let a = PassageGroup(book: "Genesis", chapter: 11, firstVerse: 1, lastVerse: 6, text: "a")
        let c = PassageGroup(book: "Exodus", chapter: 20, firstVerse: 1, lastVerse: 6, text: "c")
        let index = FuzzyIndex(groups: [a, c], vectors: [[3, 4], [0, 2]])
        let top = index.nearest([0.6, 0.8])
        #expect(top.map(\.reference) == ["Genesis 11:1-6", "Exodus 20:1-6"])
        #expect(abs(top[0].score - 1) < 0.001 && abs(top[1].score - 0.8) < 0.001)
        #expect(index.nearest([1, 0, 0]).isEmpty)

        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        try index.save(in: folder, embedder: "test")
        let read = try #require(FuzzyIndex.load(from: folder, embedder: "test"))
        #expect(read.groups == [a, c])
        #expect(FuzzyIndex.load(from: folder, embedder: "another") == nil)
        #expect(read.nearest([0.6, 0.8]) == top)
    }

    @Test func preparesOnceThenSearches() async throws {
        let rows = ["aaaa", "aaab", "eeee", "eeef", "oooo", "ooop", "uuuu"]
        let records = rows.enumerated().map { ["book": "Test", "chapter": $0.offset + 1, "verse": 1, "text": $0.element] as [String: Any] }
        let library = try VerseLibrary(data: JSONSerialization.data(withJSONObject: ["format_version": 1, "verses": records]))
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let fuzzy = FuzzyScripture(embedder: VowelEmbedder(), folder: folder)
        #expect(await fuzzy.search("eee").isEmpty)
        await fuzzy.prepare(library)
        #expect(await fuzzy.state == .ready)
        // "eeef" counts as three e's, the same as "eee", so it comes first; "eeee" next.
        #expect(await fuzzy.search("eee", count: 2).map(\.reference) == ["Test 4:1", "Test 3:1"])
        // A second search object reads the kept index instead of embedding again.
        #expect(FuzzyIndex.load(from: folder, embedder: "vowels")?.groups.count == rows.count)
    }
}

#if canImport(NaturalLanguage)
@Suite struct AppleEmbedderTests {
    @Test func findsAPassageForAPhrase() async throws {
        guard let embedder = AppleSentenceEmbedder() else { return }
        let library = try VerseLibrary.loadBundled()
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let fuzzy = FuzzyScripture(embedder: embedder, folder: folder)
        await fuzzy.prepare(library)
        #expect(await fuzzy.state == .ready)
        #expect(await fuzzy.search("Who built the ark?").count == 5)
    }
}
#endif

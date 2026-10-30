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
#endif

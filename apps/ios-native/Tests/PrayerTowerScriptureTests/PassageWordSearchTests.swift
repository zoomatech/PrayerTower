import Foundation
import Testing
@testable import PrayerTowerScripture

// Ported unchanged from Winstons Syndicate (Packages/SyndicateCore/Tests/ZoomaReferenceTests/RelationSearchTests.swift:
// the passage search's tests).

struct PassageWordSearchTests {
    @Test func passageSearchFindsMisrememberedPhrases() throws {
        let library = try VerseLibrary.loadBundled()
        let asked = library.passageSearch("Who do people say that I am?")
        #expect(asked.first?.verse.id == "Mark 8:27")
        #expect(Array(asked.prefix(3).map(\.verse.id)) == ["Mark 8:27", "Matthew 16:13", "Luke 9:18"])
        #expect(asked.first?.complete == true)
        #expect(library.passageSearch("the lord is my shepherd").first?.verse.id == "Psalms 23:1")
        #expect(library.passageSearch("for god so loved the world").first?.verse.id == "John 3:16")
        let free = library.passageSearch("the truth will set you free")
        #expect(free.first?.verse.id == "John 8:32")
        #expect(free.first?.complete == false)
    }
    @Test func passageSearchCountsSynonyms() throws {
        // Owner, 28 October 2026: "make sure it checks for synonyms in a word search. rod = staff". Aaron's rod that
        // budded (Numbers 17:8) holds "rod", not "staff".
        let library = try VerseLibrary.loadBundled()
        #expect(PassageWords.synonymStems("staff").contains(PassageWords.stem("rod")))
        #expect(PassageWords.synonymStems("rods").contains(PassageWords.stem("staff")))
        let budded = library.passageSearch("the staff that budded")
        #expect(budded.first.map { ["Numbers 17:8", "Hebrews 9:4"].contains($0.verse.id) } == true)
        #expect(budded.first?.complete == false)
    }
    @Test func passageSearchJoinsNeighbouringVersesAndGivesOneVersePerPassage() throws {
        let data = Data(#"{"format_version":1,"verses":[{"book":"Test","chapter":1,"verse":1,"text":"The shepherd went out."},{"book":"Test","chapter":1,"verse":2,"text":"He sought the lost sheep."},{"book":"Other","chapter":1,"verse":1,"text":"A lamp unto my feet."}]}"#.utf8)
        let library = try VerseLibrary(data: data)
        let hits = library.passageSearch("shepherd sheep")
        #expect(hits.count == 1)
        #expect(hits.first?.complete == true)
        #expect(library.passageSearch("shepherd lamp").allSatisfy { !$0.complete })
    }
}

#if canImport(NaturalLanguage)
// From Winstons Syndicate (ZoomaReference/RelationSearchTests.swift), less its passage-search tests: that search runs on the server here.
import Foundation
import Testing
@testable import PrayerTowerScripture

@Suite struct RelationSearchTests {
    @Test(arguments: [("David Slew", "David", "slay"), ("Jesus Wept", "Jesus", "weep"), ("God loving the world", "God", "love"), ("Jesus forgave sinners", "Jesus", "forgive")])
    func parsesSubjectsAndIrregularActions(_ value: (String, String, String)) throws {
        let query = try RelationQuery.parse(value.0)
        #expect(query.subject == value.1); #expect(query.action == value.2)
    }
    @Test func bundledSourceContainsAllVersesAndOriginalWording() throws {
        let library = try VerseLibrary.loadBundled()
        #expect(library.verses.count == 31_102)
        #expect(Set(library.verses.map(\.book)).count == 66)
        #expect(library.verses.first { $0.id == "John 11:35" }?.text == "Jesus wept.")
        let query = try RelationQuery.parse("Jesus Wept")
        #expect(library.search(query, scope: .relationship).contains { $0.verse.id == "John 11:35" })
        let david = try RelationQuery.parse("David Slew")
        #expect(library.search(david, scope: .relationship).contains { $0.verse.id == "1 Samuel 17:50" })
    }
    @Test func tenseRelatedActionsAndDirectionAreKeptDistinct() throws {
        let data = Data(#"{"format_version":1,"verses":[{"book":"Test","chapter":1,"verse":1,"text":"David slew Goliath."},{"book":"Test","chapter":1,"verse":2,"text":"David killed Goliath."},{"book":"Test","chapter":1,"verse":3,"text":"Goliath slew David."},{"book":"Test","chapter":1,"verse":4,"text":"David said, Goliath slew Saul."}]}"#.utf8)
        let library = try VerseLibrary(data: data)
        let query = try RelationQuery.parse("David slays Goliath")
        #expect(library.search(query, scope: .relationship).map(\.verse.verse) == [1])
        let related = library.search(query, scope: .related)
        #expect(related.map(\.verse.verse) == [1, 2])
        #expect(related.last?.expanded == true)
        #expect(related.last?.explanation.contains("related action") == true)
    }
    @Test func placeQueriesFindBothNamesWithoutRequiringTheAction() throws {
        let q = try RelationQuery.parse("Jesus Came unto Galilee")
        #expect(q.subject == "Jesus"); #expect(q.action == "come"); #expect(q.object == "Galilee"); #expect(q.objectIsPlace)
        let library = try VerseLibrary.loadBundled()
        let hits = library.search(q, scope: .subjectPlace)
        #expect(!hits.isEmpty)
        let automatic = library.search(q, scope: .automatic)
        #expect(automatic == library.search(q, scope: .relationship))
        #expect(automatic.contains { $0.verse.id == "Mark 1:14" })
        #expect(!automatic.contains { $0.verse.id == "Matthew 3:13" })
        #expect(!automatic.contains { $0.verse.id == "Matthew 15:29" || $0.verse.id == "Mark 7:31" })
        #expect(hits.allSatisfy { $0.verse.text.localizedCaseInsensitiveContains("Jesus") && $0.verse.text.localizedCaseInsensitiveContains("Galilee") })
    }
    @Test func loveAsANounIsNotLovingAsAnActionAndBroaderObjectsAreLabelled() throws {
        let library = try VerseLibrary.loadBundled()
        let query = try RelationQuery.parse("God loved the world")
        let exact = library.search(query, scope: .relationship)
        #expect(exact.contains { $0.verse.id == "John 3:16" })
        let broad = library.search(query, scope: .subjectAction)
        #expect(broad.count >= exact.count)
        #expect(!broad.contains { $0.verse.id == "1 John 4:8" })
    }
    @Test func browsingStopsAtTheEnds() throws {
        let query = try RelationQuery.parse("Jesus Wept")
        let hits = try VerseLibrary.loadBundled().search(query, scope: .relationship)
        var browser = VerseBrowseSession(query: query, hits: hits)
        browser.move(-1); #expect(browser.position == 0)
        browser.move(10000); #expect(browser.position == hits.count - 1); #expect(!browser.canNext)
        browser.move(-10000); #expect(!browser.canPrevious)
    }
    @Test func broaderActionAndObjectMatchesExplainBothExpansions() throws {
        let data = Data(#"{"format_version":1,"verses":[{"book":"Test","chapter":1,"verse":1,"text":"Jesus cherished the child."},{"book":"Test","chapter":1,"verse":2,"text":"Peter loved the son."}]}"#.utf8)
        let library = try VerseLibrary(data: data)
        let query = try RelationQuery.parse("Jesus loved the son")
        #expect(library.search(query, scope: .relationship).isEmpty)
        let hits = library.search(query, scope: .related)
        #expect(hits.count == 1)
        #expect(hits.first?.explanation.contains("related action") == true)
        #expect(hits.first?.explanation.contains("related object") == true)
        #expect(library.search(try RelationQuery.parse("Jesus loved Galilee"), scope: .related).isEmpty)
    }

    @Test func movementKeepsOriginAndDestinationDistinctEvenForRelatedVerbs() throws {
        let rows = ["Jesus came from Galilee.", "Jesus came into Galilee.", "Peter came into Galilee.",
                    "Jesus went into Galilee.", "Jesus came from Nazareth of Galilee.", "Jesus came from Jerusalem to Galilee."]
        let records = rows.enumerated().map { ["book": "Test", "chapter": 1, "verse": $0.offset + 1, "text": $0.element] as [String: Any] }
        let data = try JSONSerialization.data(withJSONObject: ["format_version": 1, "verses": records])
        let library = try VerseLibrary(data: data)
        let query = try RelationQuery.parse("Jesus Came unto Galilee")
        #expect(query.objectRole == .to)
        #expect(library.search(query, scope: .automatic).map(\.verse.verse) == [2, 6])
        #expect(library.search(query, scope: .related).map(\.verse.verse) == [2, 6, 4])
        #expect(library.search(query, scope: .subjectPlace).map(\.verse.verse) == [1, 2, 4, 5, 6])
        let leaving = try RelationQuery.parse("Jesus came from Galilee")
        #expect(library.search(leaving, scope: .relationship).map(\.verse.verse) == [1])
    }

    @Test func introductoryClausesAndArchaicAuxiliariesKeepTheirSubjects() throws {
        let rows = ["After John was put in prison, Jesus came into Galilee.",
                    "David hath slain Goliath.", "God doth love the world.",
                    "Goliath slew David and killed Saul."]
        let records = rows.enumerated().map { ["book": "Test", "chapter": 1, "verse": $0.offset + 1, "text": $0.element] as [String: Any] }
        let library = try VerseLibrary(data: JSONSerialization.data(withJSONObject: ["format_version": 1, "verses": records]))
        #expect(library.search(try RelationQuery.parse("Jesus came unto Galilee"), scope: .automatic).map(\.verse.verse) == [1])
        #expect(library.search(try RelationQuery.parse("David slew"), scope: .automatic).map(\.verse.verse) == [2])
        #expect(library.search(try RelationQuery.parse("God loved the world"), scope: .automatic).map(\.verse.verse) == [3])
        #expect(library.search(try RelationQuery.parse("David killed Saul"), scope: .automatic).isEmpty)
    }

    @Test func namesInsideAnotherObjectsNameAreNotItsHead() throws {
        let rows = ["Jesus came unto the sea of Galilee.", "Jesus came into Galilee."]
        let records = rows.enumerated().map { ["book": "Test", "chapter": 1, "verse": $0.offset + 1, "text": $0.element] as [String: Any] }
        let library = try VerseLibrary(data: JSONSerialization.data(withJSONObject: ["format_version": 1, "verses": records]))
        let query = try RelationQuery.parse("Jesus came unto Galilee")
        #expect(library.search(query, scope: .automatic).map(\.verse.verse) == [2])
        #expect(library.search(query, scope: .related).map(\.verse.verse) == [2])
    }

}
#endif

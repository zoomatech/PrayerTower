import Foundation
import Testing
@testable import PrayerTowerScripture

// The ancient texts sliced as the Bible is (TextPassages.swift).

struct TextGroupsTests {
    static func verses(_ work: String, _ book: String, chapters: [Int]) -> [TextPassage] {
        chapters.enumerated().flatMap { c, count in
            (1...count).map { TextPassage(workId: work, ref: "\(book) \(c + 1):\($0)", text: "\(book) \(c + 1) verse \($0).") }
        }
    }

    static func paragraphs(_ work: String, _ lengths: [Int], ref: String = "BOOK I") -> [TextPassage] {
        lengths.enumerated().map { TextPassage(workId: work, ref: ref, text: "p\($0)" + String(repeating: "x", count: max($1 - 2, 0))) }
    }

    @Test func numberedVersesAreSlicedSixEveryThreeNeverCrossingAChapter() {
        let passages = Self.verses("tobit", "The Book of Tobit", chapters: [22, 4])
        let groups = TextGroups.groups(passages)
        // Chapter 1: 1-6, 4-9, ... 16-21, then 17-22 to end on its last verse; chapter 2 is shorter than six: one group.
        #expect(groups.map { [$0.firstVerse, $0.lastVerse] } == [[1, 6], [4, 9], [7, 12], [10, 15], [13, 18], [16, 21], [17, 22], [23, 26]])
        #expect(Set(groups.prefix(7).map(\.chapter)).count == 1 && groups[7].chapter != groups[0].chapter)
        #expect(groups[0].text == passages[0..<6].map(\.text).joined(separator: " "))
        #expect(groups.allSatisfy { $0.book == "tobit" })
    }

    @Test func versesNumberedWithoutAChapterAndAPrologueAreSlicedToo() {
        // The Dhammapada's "Chapter 1 (The Twin-Verses), verse 6", Sirach's unnumbered prologue before its verses.
        var passages = [TextPassage(workId: "sirach", ref: "The Book of Sirach", text: "Prologue.")]
        passages += Self.verses("sirach", "The Book of Sirach", chapters: [12])
        passages += (1...7).map { TextPassage(workId: "dhammapada", ref: "Chapter 1 (The Twin-Verses), verse \($0)", text: "Verse \($0).") }
        let groups = TextGroups.groups(passages)
        #expect(groups.map { [$0.book, "\($0.firstVerse)-\($0.lastVerse)"] } == [
            ["sirach", "1-1"], ["sirach", "2-7"], ["sirach", "5-10"], ["sirach", "8-13"],
            ["dhammapada", "14-19"], ["dhammapada", "15-20"],
        ])
    }

    @Test func paragraphSlicesOverlapTheNextByHalf() {
        // Long paragraphs: two at a time, the next starting at the second.
        let long = TextGroups.groups(Self.paragraphs("iliad", [1000, 1000, 1000, 1000]))
        #expect(long.map { [$0.firstVerse, $0.lastVerse] } == [[1, 2], [2, 3], [3, 4]])
        // Short ones: as many as make about six verses' length (800 characters), at most six, the next halfway in.
        let short = TextGroups.groups(Self.paragraphs("hammurabi", Array(repeating: 200, count: 10), ref: "§ 1"))
        #expect(short.map { [$0.firstVerse, $0.lastVerse] } == [[1, 4], [3, 6], [5, 8], [7, 10]])
        let tiny = TextGroups.groups(Self.paragraphs("tao", Array(repeating: 50, count: 8)))
        #expect(tiny.map { [$0.firstVerse, $0.lastVerse] } == [[1, 6], [4, 8]])
        for groups in [long, short, tiny] {
            for (one, next) in zip(groups, groups.dropFirst()) { #expect(next.firstVerse > one.firstVerse && next.firstVerse <= one.lastVerse) }
        }
    }

    @Test func aChapterNamingSeveralParagraphsIsSlicedByParagraph() {
        // The Tao Te Ching's "Chapter 1" holds several paragraphs: the number is a chapter, not a verse.
        let passages = (1...3).flatMap { c in (1...3).map { TextPassage(workId: "tao", ref: "Chapter \(c)", text: "Chapter \(c) part \($0) " + String(repeating: "x", count: 500)) } }
        #expect(TextGroups.chapters(passages) == nil)
        #expect(TextGroups.groups(passages).allSatisfy { $0.lastVerse - $0.firstVerse == 1 })
    }

    @Test func slicesNeverCrossAWorkAndAOneParagraphWorkIsOneSlice() {
        let passages = Self.paragraphs("a", [1000, 1000, 1000]) + Self.paragraphs("manasses", [2257]) + Self.paragraphs("b", [300, 300])
        let groups = TextGroups.groups(passages)
        #expect(groups.map { "\($0.book) \($0.firstVerse)-\($0.lastVerse)" } == ["a 1-2", "a 2-3", "manasses 4-4", "b 5-6"])
        #expect(Set(groups.map(\.reference)).count == groups.count)
    }

    @Test func theCollectionFileKeepsOnlyPublicDomainWorksAndItsVersionFollowsItsWords() throws {
        let json = #"""
        {"format_version":1,"id":"oldest-texts","title":"Oldest texts","faith":false,"source":"x",
         "works":[{"id":"a","title":"A","author":"","rights":"public_domain"},{"id":"b","title":"B","author":"","rights":"unverified"}],
         "passages":[{"workId":"a","ref":"1","text":"One."},{"workId":"b","ref":"1","text":"Hidden."},{"workId":"a","ref":"2","text":"Two."}]}
        """#
        let collection = try TextCollection(data: Data(json.utf8))
        #expect(collection.id == "oldest-texts" && collection.title == "Oldest texts")
        #expect(collection.passages.map(\.text) == ["One.", "Two."])
        let same = TextCollection(id: "oldest-texts", title: "Oldest texts", passages: collection.passages)
        let changed = TextCollection(id: "oldest-texts", title: "Oldest texts", passages: [collection.passages[0], TextPassage(workId: "a", ref: "2", text: "Two!")])
        #expect(same.version == collection.version && changed.version != collection.version)
    }

    @Test func aCollectionIndexIsKeptBesideTheBiblesAndReadOnlyForItsOwnWords() throws {
        let folder = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let groups = TextGroups.groups(Self.paragraphs("iliad", [1000, 1000, 1000]))
        let index = PassageIndex(name: "world-classics", version: "v1", groups: groups, vectors: [[1, 0], [0, 1]])
        try index.save(in: folder, model: "m")
        let kept = try #require(PassageIndex.load("world-classics", version: "v1", from: folder, model: "m"))
        #expect(kept.groups == groups && kept.dimensions == 2 && kept.translation == nil)
        #expect(PassageIndex.load("world-classics", version: "v2", from: folder, model: "m") == nil)
        #expect(PassageIndex.load("world-classics", version: "v1", from: folder, model: "other") == nil)
        // A translation's index is read as before, with no version.
        try PassageIndex(translation: .kjv, groups: groups, vectors: [[1, 0], [0, 1]]).save(in: folder, model: "m")
        #expect(PassageIndex.load(.kjv, from: folder, model: "m")?.translation == .kjv)
    }

    /// The KJV's six-verse groups average about the length a paragraph slice grows to.
    @Test func paragraphSlicesGrowToAboutTheLengthOfSixBibleVerses() throws {
        let groups = PassageGroups.groups(try VerseLibrary.loadBundled().verses)
        let mean = groups.reduce(0) { $0 + $1.text.count } / groups.count
        #expect(abs(mean - TextGroups.paragraphLength) < 150)
    }
}

#if canImport(Darwin)
struct HybridTextSearchTests {
    static let collection = TextCollection(id: "oldest-texts", title: "Oldest texts", passages: [
        TextPassage(workId: "gilgamesh", ref: "Tablet XI, lines 142–145", text: "When the seventh day came I brought out a dove and let it go. The dove went and came back, for there was no resting place it returned."),
        TextPassage(workId: "gilgamesh", ref: "Tablet XI, lines 146–147", text: "I brought out a swallow and let it go. The swallow went and came back."),
        TextPassage(workId: "gilgamesh", ref: "Tablet XI, lines 148–151", text: "I brought out a raven and let it go. The raven went, and saw the waters abate, and did not come back."),
        TextPassage(workId: "hammurabi", ref: "§ 196", text: "If a man destroy the eye of another man, they shall destroy his eye."),
        TextPassage(workId: "hammurabi", ref: "§ 197", text: "If one break a man's bone, they shall break his bone."),
    ])
    // No index in the folder: the meaning search gives nothing, the cascade and the word search answer.
    let search = HybridTextSearch(collection: collection,
                                  fuzzy: FuzzyBibleSearch(folder: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)))

    @Test func beforeTheIndexIsMadeTheCascadeAndTheWordSearchAnswer() async {
        let found = await search.search("there was no resting place")
        #expect(found.first?.passage.ref == "Tablet XI, lines 142–145" && found.first?.finder == .cascade)
        #expect(!found.contains { $0.finder == .meaning })
        #expect(Set(found.map(\.index)).count == found.count && found.count <= 10)
    }

    @Test func theWordSearchFindsAPassageByItsWordsWithItsNeighbours() {
        // "destroyed" and "eyes" as the KJV's forms of "destroy" and "eye".
        #expect(search.words("destroyed eyes").first == 3)
        #expect(search.words("dove raven").contains(0))
    }

    @Test func nothingTypedFindsNothing() async {
        #expect(await search.search("  ").isEmpty)
    }

    @Test func aCollectionIsNotReadyBeforeTheBiblesSetup() async throws {
        try await search.fuzzy.prepare(Self.collection)
        #expect(await search.fuzzy.isReady(Self.collection) == false)
        #expect(try await search.fuzzy.search("dove", in: Self.collection).isEmpty)
    }
}
#endif

#if canImport(Darwin)
struct EveryTextSearchTests {
    static let laws = TextCollection(id: "oldest-texts", title: "Oldest texts", passages: [
        TextPassage(workId: "hammurabi", ref: "§ 196", text: "If a man destroy the eye of another man, they shall destroy his eye."),
        TextPassage(workId: "hammurabi", ref: "§ 197", text: "If one break a man's bone, they shall break his bone."),
    ])
    static let classics = TextCollection(id: "world-classics", title: "World classics", passages: [
        TextPassage(workId: "dhammapada", ref: "Chapter 1 (The Twin-Verses), verse 5", text: "For hatred does not cease by hatred at any time: hatred ceases by love, this is an old rule."),
        TextPassage(workId: "dhammapada", ref: "Chapter 1 (The Twin-Verses), verse 6", text: "The world does not know that we must all come to an end here."),
    ])
    let search = HybridTextSearch(collections: [laws, classics],
                                  fuzzy: FuzzyBibleSearch(folder: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)))

    @Test func oneSearchCoversEveryCollectionAndNamesWhereEachPassageIs() async {
        let eye = await search.search("destroy the eye")
        #expect(eye.first.map { [$0.collection, $0.passage.ref, "\($0.index)"] } == ["oldest-texts", "§ 196", "0"])
        let hatred = await search.search("hatred ceases by love")
        #expect(hatred.first.map { [$0.collection, $0.passage.ref, "\($0.index)"] } == ["world-classics", "Chapter 1 (The Twin-Verses), verse 5", "0"])
        #expect(hatred.first?.finder == .cascade)
    }

    @Test func theWordSearchRunsOverThemAllTogether() {
        #expect(search.words("bone").map { search.passage($0).ref } .first == "§ 197")
        #expect(search.words("rule").map { search.passage($0).ref }.first == "Chapter 1 (The Twin-Verses), verse 5")
    }
}
#endif

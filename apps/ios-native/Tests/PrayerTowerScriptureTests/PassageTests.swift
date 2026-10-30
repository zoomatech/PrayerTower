import Foundation
import Testing
@testable import PrayerTowerScripture

// Ported unchanged from Winstons Syndicate (Packages/ZoomaBibleSearch/Tests/ZoomaBiblePassagesTests/PassageTests.swift).

struct BibleTextTests {
    @Test func readsQuotedFieldsLineEndingsAndBookNames() {
        let csv = "Book,Chapter,Verse,Text\r\n"
            + "I Samuel,17,49,\"And David put his hand in his bag, and took thence a stone\"\r\n"
            + "III John,1,1,\"The elder said, \"\"Grace.\"\"\"\r\n"
            + "Revelation of John,22,21,The grace of our Lord Jesus Christ be with you all. Amen.\r\n"
            + "Matthew,17,21,\r\n"
        let verses = BibleText.verses(csv: csv)
        #expect(verses.map(\.book) == ["1 Samuel", "3 John", "Revelation"])
        #expect(verses[0].text == "And David put his hand in his bag, and took thence a stone")
        #expect(verses[1].text == "The elder said, \"Grace.\"")
        #expect(verses[2].chapter == 22 && verses[2].verse == 21)
    }

    @Test func namesTheBooksAsTheKJVDoes() {
        #expect(BibleText.bookName("II Chronicles") == "2 Chronicles")
        #expect(BibleText.bookName("I Thessalonians") == "1 Thessalonians")
        #expect(BibleText.bookName("Isaiah") == "Isaiah")
    }
}

struct PassageGroupTests {
    func chapter(_ book: String, _ number: Int, verses: Int) -> [BibleVerse] {
        (1...verses).map { BibleVerse(book: book, chapter: number, verse: $0, text: "v\($0)") }
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
}

struct PassageSearchTests {
    let a = PassageGroup(book: "Genesis", chapter: 11, firstVerse: 1, lastVerse: 6, text: "a")
    let b = PassageGroup(book: "Genesis", chapter: 11, firstVerse: 4, lastVerse: 9, text: "b")
    let c = PassageGroup(book: "Exodus", chapter: 20, firstVerse: 1, lastVerse: 6, text: "c")

    @Test func mergesTranslationsByReferenceKeepingTheBestScore() {
        let kjv = PassageIndex(translation: .kjv, groups: [a, b, c], vectors: [[1, 0], [0.6, 0.8], [0, 1]])
        let bsb = PassageIndex(translation: .bsb, groups: [a, b, c], vectors: [[0.8, 0.6], [0.9, 0.1], [-1, 0]])
        let top = PassageSearch.nearest([1, 0], in: [kjv, bsb], count: 5)
        #expect(top.map(\.reference) == ["Genesis 11:1-6", "Genesis 11:4-9", "Exodus 20:1-6"])
        #expect(top[0].translation == .kjv)
        #expect(top[1].translation == .bsb)
        #expect(abs(top[0].score - 1) < 0.01)
        #expect(PassageSearch.nearest([1, 0], in: [kjv, bsb], count: 1).count == 1)
    }

    @Test func keptOnTheDeviceAndReadBack() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let index = PassageIndex(translation: .ylt, groups: [a, c], vectors: [[3, 4], [0, 2]])
        try index.save(in: folder, model: "test")
        let read = try #require(PassageIndex.load(.ylt, from: folder, model: "test"))
        #expect(read.groups == [a, c])
        #expect(PassageIndex.load(.ylt, from: folder, model: "another") == nil)
        #expect(PassageIndex.load(.kjv, from: folder, model: "test") == nil)
        let scores = read.scores([0.6, 0.8])
        #expect(abs(scores[0] - 1) < 0.01 && abs(scores[1] - 0.8) < 0.01)
    }
}

struct CascadeTests {
    let texts = ["And Jael took a nail of the tent and smote it into his temples",
                 "The tent was pitched and the nail was struck",
                 "He stabbed the king",
                 "Nothing here at all"]

    @Test func eachGroupTakesTheFirstTierItFits() {
        let scores = CascadeIndex(texts).scores("the woman who drove a tent nail into his temples")
        // Essential words: woman, drove, tent, nail, temples. Group 0 holds tent, nail, temples (tier 3, 3 distinct);
        // group 1 holds tent, nail (tier 3, 2 distinct); none holds every one; groups 2 and 3 none.
        #expect(scores[0] == Float(2 * 1000 + 303))
        #expect(scores[1] == Float(2 * 1000 + 202))
        #expect(scores[2] == 0 && scores[3] == 0)
    }

    @Test func aPhraseFirstThenEveryWordThenAStem() {
        let index = CascadeIndex(texts)
        #expect(index.scores("tent and smote")[0] == Float(4 * 1000 + 1))
        #expect(index.scores("tent nail")[1] == Float(3 * 1000 + 2))
        // "stabbing" stems to "stabb", found at the start of "stabbed".
        #expect(index.scores("stabbing")[2] == Float(1 * 1000 + 1))
    }

    @Test func theCascadeSearchMergesTranslationsByReferenceAndGivesNoGroupOutsideTheTiers() {
        func group(_ verse: Int, _ text: String) -> PassageGroup { PassageGroup(book: "Judges", chapter: 4, firstVerse: verse, lastVerse: verse, text: text) }
        let kjv = [group(21, texts[0]), group(22, texts[3])], ylt = [group(21, texts[1]), group(23, texts[1])]
        let indexes = [(PassageIndex(translation: .kjv, groups: kjv, vectors: [[1, 0], [0, 1]]), CascadeIndex(kjv.map(\.text))),
                       (PassageIndex(translation: .ylt, groups: ylt, vectors: [[1, 0], [0, 1]]), CascadeIndex(ylt.map(\.text)))]
        let found = PassageSearch.cascade("tent nail temples", in: indexes)
        #expect(found.map(\.reference) == ["Judges 4:21", "Judges 4:23"])
        #expect(found[0].translation == .kjv)
    }

    @Test func stopWordsAndFillerAreNotEssential() {
        #expect(CascadeIndex.essential("Who was the guy that slew Goliath?") == ["slew", "goliath"])
    }
}

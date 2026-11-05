import Foundation
import Testing
@testable import PrayerTowerScripture

// The popular names for passages (NamedPassages.swift, Resources/NamedPassages.json).

struct NamedPassagesTests {
    @Test func everyBibleReferenceReadsAndHasItsVerses() throws {
        let kjv = try VerseLibrary.loadBundled()
        #expect(NamedPassages.all.count >= 70)
        for entry in NamedPassages.all {
            #expect(!entry.names.isEmpty && !entry.about.isEmpty)
            #expect(!entry.bible.isEmpty || !entry.texts.isEmpty || entry.note != nil, "\(entry.names[0]) leads nowhere")
            for ref in entry.bible {
                let ref = try #require(VerseReference(ref), "\(entry.names[0]): \(ref)")
                #expect(kjv.verses(ref.book + " \(ref.chapter):\(ref.firstVerse)-\(ref.lastVerse)").count == ref.lastVerse - ref.firstVerse + 1,
                        "\(entry.names[0]): \(ref)")
            }
            for side in entry.texts {
                #expect((side.ref == nil) != (side.find == nil), "\(entry.names[0]) side")
                #expect(["apocrypha-kjv", "ancient-writings", "oldest-texts", "world-classics"].contains(side.collection))
            }
        }
    }

    @Test func aNameTypedLeadsToItsPassagesTheLongestNameFirst() {
        #expect(NamedPassages.named("do unto others as you would have them do unto you").first?.names.first == "golden rule")
        #expect(NamedPassages.named("What is the Golden Rule?").first?.bible == ["Matthew 7:12", "Luke 6:31"])
        #expect(NamedPassages.named("Noah’s ark").first?.names.first == "noah's ark")
        #expect(NamedPassages.named("Daniel in the lions' den").first?.names.first == "daniel in the lions den")
        // "an eye for an eye and a tooth for a tooth": one entry, once.
        #expect(NamedPassages.named("an eye for an eye and a tooth for a tooth").map { $0.names[0] } == ["eye for an eye"])
        #expect(NamedPassages.named("the guy who built a boat").isEmpty)
        // A name must be whole words: "edenic" is not "eden".
        #expect(NamedPassages.named("an edenic garden").isEmpty)
    }

    @Test func aSayingNotInTheBibleSaysSo() {
        let saying = NamedPassages.named("god helps those who help themselves").first
        #expect(saying?.note?.hasPrefix("Not in the Bible") == true)
        #expect(NamedPassages.named("money is the root of all evil").first?.bible == ["1 Timothy 6:10"])
    }

    @Test func nearANameItsDescriptionIsSearched() {
        #expect(NamedPassages.named("noahs arks").isEmpty)
        #expect(NamedPassages.near("noahs arks")?.names.first == "noah's ark")
        #expect(NamedPassages.near("david and goliah")?.names.first == "david and goliath")
        #expect(NamedPassages.near("the left handed guy who stabbed a fat king") == nil)
        #expect(NamedPassages.distance("goliath", "goliah") == 1 && NamedPassages.distance("", "ab") == 2)
    }
}

#if canImport(Darwin)
struct NamedTextSidesTests {
    @Test func everyTextSideResolvesInItsCollection() throws {
        let folder = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appending(path: "../../../server/data/library")
        var collections: [TextCollection] = []
        for id in ["apocrypha-kjv", "ancient-writings", "oldest-texts", "world-classics"] {
            let zipped = folder.appending(path: "\(id).json.gz")
            guard FileManager.default.fileExists(atPath: zipped.path) else { return }
            let gunzip = Process()
            gunzip.executableURL = URL(fileURLWithPath: "/usr/bin/gunzip")
            gunzip.arguments = ["-c", zipped.path]
            let pipe = Pipe()
            gunzip.standardOutput = pipe
            try gunzip.run()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            gunzip.waitUntilExit()
            collections.append(try TextCollection(data: data))
        }
        let search = HybridTextSearch(collections: collections, fuzzy: FuzzyBibleSearch(folder: FileManager.default.temporaryDirectory))
        for entry in NamedPassages.all {
            for side in entry.texts {
                let places = search.places(side)
                #expect(places.count == (side.count ?? 1), "\(entry.names[0]): \(side)")
            }
        }
        let golden = NamedPassages.named("golden rule")[0].texts.flatMap(search.places).map { search.passage($0).ref }
        #expect(golden == ["The Book of Tobit 4:15", "Book 15, Chapter 23", "Book 12, Chapter 2"])
    }
}
#endif

struct NamedPassagesNearTests {
    @Test func commonWordsDoNotMakeANearName() {
        // "the" and a word like "crossed" are not near any name.
        #expect(NamedPassages.near("they crossed the river at night") == nil)
        #expect(NamedPassages.near("the floods came") == nil)
    }
}

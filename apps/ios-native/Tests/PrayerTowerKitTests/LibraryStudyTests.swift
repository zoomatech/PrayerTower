import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct LibraryStudyTests {
    @Test func readsAVerseWordByWordAndAWordEntry() throws {
        let json = #"{"ref":"Genesis 1:1","citation":"Genesis 1:1 (King James Bible)","key":"0123456789abcdef0123456789abcdef","words":[{"text":"In the ","strongs":[]},{"text":"beginning","strongs":["H7225"]}],"roots":{"H7225":{"lemma":"רֵאשִׁית","translit":"rêʼshîyth"}}}"#
        let v = try JSONDecoder().decode(WordVerse.self, from: Data(json.utf8))
        #expect(v.words.count == 2 && v.roots["H7225"]?.translit == "rêʼshîyth")
        #expect(v.spoken(v.words[1]) == "beginning: rêʼshîyth (H7225)")
        let entry = try JSONDecoder().decode(WordEntry.self, from: Data(#"{"id":"G26","language":"Greek","lemma":"ἀγάπη","translit":"agápē","pron":"ag-ah'-pay","derivation":"from G25;","definition":"love","kjv":"charity, love.","total":116,"verses":[{"ref":"1 Corinthians 13:4","text":"Charity suffereth long","as":["Charity"],"citation":"1 Corinthians 13:4 (King James Bible)","key":"0123456789abcdef0123456789abcdef"}]}"#.utf8))
        #expect(entry.total == 116 && entry.verses.first?.as == ["Charity"])
    }

    @Test func savingAMarkSendsNullsToClearAndNeverSharesAColourAlone() throws {
        let clear = String(decoding: try JSONEncoder().encode(LibraryNoteInput(collection: "bible-kjv", key: "k", color: nil, note: nil, circleId: "c1")), as: UTF8.self)
        #expect(clear.contains(#""color":null"#) && clear.contains(#""note":null"#) && clear.contains(#""circleId":null"#))
        let shared = try JSONSerialization.jsonObject(with: JSONEncoder().encode(LibraryNoteInput(collection: "bible-kjv", key: "k", color: "yellow", note: "  For Sunday. ", circleId: "c1"))) as! [String: Any]
        #expect(shared["note"] as? String == "For Sunday." && shared["circleId"] as? String == "c1" && shared["color"] as? String == "yellow")
    }

    @Test func readsNotesAndCircleNotes() throws {
        let json = #"{"notes":[{"id":"n1","collection":"bible-kjv","workId":"kjv-psalms","ref":"Psalms 23:1","key":"k","quote":"The LORD is my shepherd","citation":"Psalms 23:1 (King James Bible)","color":"yellow","note":"For Sunday.","circle":{"id":"c1","name":"Study group"},"updatedAt":"2026-10-29T23:00:00Z","author":"Ruth","mine":false}]}"#
        let n = try JSONDecoder().decode(LibraryNotes.self, from: Data(json.utf8)).notes[0]
        #expect(n.circle?.name == "Study group" && n.author == "Ruth" && n.mine == false)
        let own = try JSONDecoder().decode(LibraryNote.self, from: Data(#"{"id":"n2","collection":"world-classics","workId":"tao","ref":"Chapter 1","key":"k2","quote":"q","citation":"c","color":null,"note":null,"circle":null,"updatedAt":"2026-10-29T23:00:00Z"}"#.utf8))
        #expect(own.author == nil && own.color == nil)
    }

    @Test func keepsAndSearchesAnOfflineCopy() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("offline-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: folder) }
        let library = OfflineLibrary(folder: folder)
        let file = #"{"format_version":1,"id":"world-classics","title":"World classics","faith":false,"source":"Project Gutenberg","works":[{"id":"tao","title":"Tao Te Ching","author":"James Legge (1891)","rights":"public_domain"}],"passages":[{"workId":"tao","ref":"Chapter 1","text":"The Tao that can be trodden is not the enduring and unchanging Tao."},{"workId":"tao","ref":"Chapter 2","text":"All in the world know the beauty of the beautiful."}]}"#
        let list = try JSONDecoder().decode(OfflineCollections.self, from: Data(#"{"enabled":true,"collections":[{"id":"world-classics","title":"World classics","faith":false,"version":"abc","bytes":300,"passages":2}]}"#.utf8))
        #expect(library.kept().isEmpty)
        try library.keep(list.collections[0], data: Data(file.utf8))
        #expect(library.kept().map(\.version) == ["abc"])
        let r = try #require(library.open("world-classics")).search("tao trodden")
        #expect(r.total == 1)
        #expect(r.hits.first?.credit == "Tao Te Ching, Chapter 1 (James Legge (1891))")
        #expect(r.hits.first?.complete == true)
        #expect(throws: (any Error).self) { try library.keep(list.collections[0], data: Data("not json".utf8)) }
        try library.remove("world-classics")
        #expect(library.kept().isEmpty && library.open("world-classics") == nil)
        let off = try JSONDecoder().decode(OfflineCollections.self, from: Data(#"{"enabled":false}"#.utf8))
        #expect(!off.enabled && off.collections.isEmpty)
    }

    @Test func patchesTheNewSwitches() throws {
        let patch = String(decoding: try JSONEncoder().encode(LibrarySettings(offlineEnabled: true)), as: UTF8.self)
        #expect(patch == #"{"offlineEnabled":true}"#)
    }
}

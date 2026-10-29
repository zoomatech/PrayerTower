import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct LibraryTests {
    @Test func readsAClosedAndAnOpenLibrary() throws {
        let closed = try JSONDecoder().decode(LibraryOverview.self, from: Data(#"{"enabled":false}"#.utf8))
        #expect(!closed.enabled && closed.collections.isEmpty)
        let open = try JSONDecoder().decode(LibraryOverview.self, from: Data(#"{"enabled":true,"collections":[{"id":"bible-kjv","title":"King James Bible","faith":true}]}"#.utf8))
        #expect(open.collections.first?.id == Library.bible)
    }

    @Test func readsResults() throws {
        let json = #"{"total":1,"source":"Project Gutenberg","hits":[{"ref":"Psalm 23:1","text":"The LORD is my shepherd; I shall not want.","complete":true,"work":{"id":"kjv","title":"King James Bible","author":""}}]}"#
        let r = try JSONDecoder().decode(LibraryResults.self, from: Data(json.utf8))
        #expect(r.hits.first?.ref == "Psalm 23:1")
    }

    @Test func sharesAPassageWithItsCitation() throws {
        let json = #"{"ref":"Psalms 23:1","text":" The LORD is my shepherd. ","complete":true,"work":{"id":"kjv-psalms","title":"Psalms","author":""},"citation":"Psalms 23:1 (King James Bible)"}"#
        let hit = try JSONDecoder().decode(LibraryHit.self, from: Data(json.utf8))
        let post = Library.shared(hit.text, citation: hit.credit)
        #expect(post.body == "“The LORD is my shepherd.”\n— Psalms 23:1 (King James Bible)")
        #expect(post.postType == "prayer_request")
        // An older server sends no citation: the work and place stand in.
        let old = try JSONDecoder().decode(LibraryHit.self, from: Data(#"{"ref":"Book IV","text":"x","complete":true,"work":{"id":"m","title":"Meditations","author":"Marcus Aurelius"}}"#.utf8))
        #expect(old.credit == "Meditations, Book IV")
    }

    @Test func readsTheDailyPassageAndSettings() throws {
        let off = try JSONDecoder().decode(LibraryDaily.self, from: Data(#"{"enabled":false}"#.utf8))
        #expect(!off.enabled && off.passage == nil)
        let on = try JSONDecoder().decode(LibraryDaily.self, from: Data(#"{"enabled":true,"day":"2026-10-29","share":true,"passage":{"collection":"bible-kjv","ref":"John 3:16","text":"For God so loved the world","complete":true,"work":{"id":"kjv-john","title":"John","author":""},"citation":"John 3:16 (King James Bible)"}}"#.utf8))
        #expect(on.day == "2026-10-29" && on.share == true && on.passage?.credit == "John 3:16 (King James Bible)")
        let patch = String(decoding: try JSONEncoder().encode(LibrarySettings(dailyEnabled: true)), as: UTF8.self)
        #expect(patch == #"{"dailyEnabled":true}"#)
    }
}

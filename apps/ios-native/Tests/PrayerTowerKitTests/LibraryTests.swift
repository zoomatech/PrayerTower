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
}

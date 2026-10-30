import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct ShortcutsTests {
    private func cards() throws -> [Card] {
        let base = SampleServer.card("p1", "Ruth", mine: false, "Please pray for my mother's surgery on Tuesday.")
        let mine = SampleServer.card("p2", "Sample Member", mine: true, "Asking for strength for my new job.")
        let crisis = base.replacingOccurrences(of: #""id":"p1""#, with: #""id":"p3""#).replacingOccurrences(of: #""crisis":false"#, with: #""crisis":true"#)
        let sensitive = mine.replacingOccurrences(of: #""id":"p2""#, with: #""id":"p4""#).replacingOccurrences(of: #""crisis":false"#, with: #""crisis":false,"isSensitive":true"#)
        let noPray = base.replacingOccurrences(of: #""id":"p1""#, with: #""id":"p5""#).replacingOccurrences(of: #""praying_now","#, with: "")
        return try JSONDecoder().decode([Card].self, from: Data("[\(base),\(mine),\(crisis),\(sensitive),\(noPray)]".utf8))
    }

    @Test func spotlightHoldsOnlyTheMembersOwnOrdinaryRequests() throws {
        let items = Shortcuts.spotlightItems(try cards())
        #expect(items.map(\.postId) == ["p2"])
        #expect(items[0].title == "Asking for strength for my new job.")
    }

    @Test func siriOffersOthersRequestsTheMemberCanPrayFor() throws {
        let items = Shortcuts.prayable(try cards())
        #expect(items.map(\.postId) == ["p1"])
        #expect(items[0].title == "Ruth: Please pray for my mother's surgery on Tuesday.")
    }

    @Test func shortensLongTitlesAndRoundTripsIdentifiers() throws {
        let long = String(repeating: "word ", count: 30)
        let card = try JSONDecoder().decode(Card.self, from: Data(SampleServer.card("p9", "Sam", mine: true, long).utf8))
        #expect(Shortcuts.spotlightItems([card])[0].title.count == 60)
        #expect(Shortcuts.postId(fromIdentifier: Shortcuts.identifier("abc")) == "abc")
        #expect(Shortcuts.postId(fromIdentifier: "post:") == nil)
        #expect(Shortcuts.postId(fromIdentifier: "other") == nil)
    }

    @Test func isOffUntilTheMemberTurnsItOn() {
        let d = UserDefaults(suiteName: "shortcuts-test-\(UUID())")!
        #expect(!Shortcuts.isOn(d))
        d.set(true, forKey: Shortcuts.defaultsKey)
        #expect(Shortcuts.isOn(d))
    }
}

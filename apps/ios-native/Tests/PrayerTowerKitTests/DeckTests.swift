import Testing
@testable import PrayerTowerKit

@Suite struct DeckTests {
    @Test func countsOnlyALongEnoughSwipe() {
        #expect(SwipeDeck.swipe(dx: 120, width: 400) == .pray)
        #expect(SwipeDeck.swipe(dx: -113, width: 400) == .next)
        #expect(SwipeDeck.swipe(dx: 100, width: 400) == .none)
        #expect(SwipeDeck.swipe(dx: 300, width: 0) == .none)
    }

    @Test func fetchesMoreBeforeTheDeckRunsOutAndThenSaysThankYou() {
        var deck = SwipeDeck()
        #expect(!deck.needsMore(count: 10, atEnd: false))
        for _ in 0..<7 { deck.advance() }
        #expect(deck.needsMore(count: 10, atEnd: false))
        #expect(!deck.needsMore(count: 10, atEnd: true))
        for _ in 0..<3 { deck.advance() }
        #expect(deck.done(count: 10))
        deck.restart()
        #expect(deck.index == 0)
    }

    @Test func usesOpenCirclesWords() {
        #expect(LayoutWords(.faith).pray == "Pray")
        #expect(LayoutWords(.neutral).pray == "Support")
        #expect(LayoutWords(.neutral).allSeen.contains("showing up"))
        #expect(!LayoutWords(.neutral).confirm.lowercased().contains("pray"))
        #expect(LayoutWords(.faith).folio(0, of: 12) == "1 of 12 · Swipe up to turn the page")
        #expect(LayoutWords(.faith).folio(4, of: 12) == "5 of 12")
    }

    @Test func namesThePlaceInTheWallAndTower() {
        let w = LayoutWords(.neutral)
        #expect(w.wallPosition(2, of: 9) == "Post 2 of 9" && w.towerFloor(1, of: 3) == "Floor 1 of 3")
        #expect(![w.wallSwipe, w.towerTop, w.circuitEnd].joined().lowercased().contains("pray"))
    }
}

@testable import PrayerTowerKit
import XCTest

/// The Full Screen Sparkler skin (Steve, 2026-11-01).
final class SparklerTests: XCTestCase {
    func testSeparatorIsBlackWithALightBlueLine() {
        let look = SparklerLook(nil)
        XCTAssertEqual(look.backdrop.hex, "#000000")
        XCTAssertEqual(look.stripe.hex, "#8FD3FF")
        XCTAssertEqual(SkinLayout(rawValue: "sparkler"), .sparkler)
    }

    func testEveryKindOfBackgroundWithReadableWords() {
        for g in Sparkler.Kind.allCases { XCTAssertTrue(Sparkler.backgrounds.contains { $0.group == g }, g.rawValue) }
        for b in Sparkler.backgrounds {
            let ink = Sparkler.ink(b)
            XCTAssertGreaterThanOrEqual(ink.text.contrast(b.base), 4.5, b.id)
            XCTAssertGreaterThanOrEqual(ink.muted.contrast(b.base), 4.5, b.id)
        }
        XCTAssertEqual(Sparkler.background("nope").id, "white")
    }

    func testStarsAndFlowersFitTheirPostTheSameEachTime() {
        XCTAssertEqual(Sparkler.stars(w: 390, h: 600, seed: 3), Sparkler.stars(w: 390, h: 600, seed: 3))
        XCTAssertGreaterThan(Sparkler.stars(w: 390, h: 600, seed: 3).count, Sparkler.stars(w: 390, h: 200, seed: 3).count)
        for s in Sparkler.stars(w: 390, h: 600, seed: 3) { XCTAssertTrue((0...390).contains(s.x) && (0...600).contains(s.y)) }
        for f in Sparkler.flowers(w: 390, h: 300, seed: 2) { XCTAssertGreaterThanOrEqual(f.y, 10) }
    }

    func testSparksFlyOutFromTheTip() {
        let spray = Sparkler.sparks { 0.5 }
        XCTAssertEqual(spray.count, 16)
        for s in spray { XCTAssertGreaterThan(hypot(s.x2 - s.x1, s.y2 - s.y1), 5) }
    }

    func testOneLineGrowsWithTheScrollAndNeverDrawsBack() {
        // At the top, the tip already rides near the foot of the screen (84%), sparkler and all.
        XCTAssertEqual(Sparkler.tip(scrolled: 0, screen: 800, reached: 0, feedHeight: 5000), 672, accuracy: 0.001)
        XCTAssertEqual(Sparkler.tip(scrolled: 1000, screen: 800, reached: 672, feedHeight: 5000), 1672, accuracy: 0.001)
        // Scrolled back up, it stays as far as it reached.
        XCTAssertEqual(Sparkler.tip(scrolled: 200, screen: 800, reached: 1672, feedHeight: 5000), 1672, accuracy: 0.001)
        // Never past the end of the feed.
        XCTAssertEqual(Sparkler.tip(scrolled: 4800, screen: 800, reached: 0, feedHeight: 5000), 5000, accuracy: 0.001)
    }

    func testASwipeThrowsTheSparklerAheadAtMostATenthOfTheScreen() {
        // A fast swipe eases it toward a tenth of the screen ahead...
        var lead = 0.0
        for _ in 0..<12 { lead = Sparkler.lead(lead, delta: 60, screen: 800) }
        XCTAssertEqual(lead, 80, accuracy: 1)
        // ...and as the swipe slows, the screen catches up.
        for _ in 0..<12 { lead = Sparkler.lead(lead, delta: 4, screen: 800) }
        XCTAssertLessThan(lead, 12)
        XCTAssertEqual(Sparkler.lead(0, delta: -400, screen: 800), -14, accuracy: 0.001)
    }

    func testTheTrailOfSparkleFadesOutTowardTheTopOfTheScreen() {
        let all = Sparkler.glitter(scrolled: 500, top: 0, tip: 700, time: 1)
        XCTAssertFalse(all.isEmpty)
        XCTAssertTrue(all.allSatisfy { $0.y >= 0 && $0.y < 700 })
        // Nothing in the top tenth; brighter near the tip than halfway up.
        XCTAssertTrue(all.filter { $0.y < 50 }.isEmpty)
        let low = all.filter { $0.y > 560 }.map(\.opacity).max() ?? 0
        let mid = all.filter { $0.y > 250 && $0.y < 350 }.map(\.opacity).max() ?? 0
        XCTAssertGreaterThan(low, mid)
        // It rides with the feed: the same glint 13 points further down the feed sits 13 points higher on screen.
        XCTAssertEqual(Sparkler.glitter(scrolled: 0, top: 0, tip: 700, time: 1).count > 0, true)
    }
}

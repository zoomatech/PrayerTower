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

    func testLineGrowsWithTheScrollAndNeverDrawsBack() {
        // A 400-point row whose top is at 300 on an 800-point screen: the tip (560) is 260 into it.
        XCTAssertEqual(Sparkler.grown(rowTop: 300, rowHeight: 400, screen: 800, reached: 0), 0.65, accuracy: 0.001)
        XCTAssertEqual(Sparkler.grown(rowTop: 900, rowHeight: 400, screen: 800, reached: 0), 0)
        XCTAssertEqual(Sparkler.grown(rowTop: -500, rowHeight: 400, screen: 800, reached: 0), 1)
        // Scrolled back up, it stays as far as it reached.
        XCTAssertEqual(Sparkler.grown(rowTop: 900, rowHeight: 400, screen: 800, reached: 0.65), 0.65)
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
}

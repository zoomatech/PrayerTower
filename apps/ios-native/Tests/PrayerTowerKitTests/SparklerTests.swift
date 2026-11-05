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

    func testTheTrailIsYellowAndDarkModeShedsStardustThatFadesTowardTheTop() {
        for c in Sparkler.trailColors + Sparkler.trailColorsLight {
            // Yellow: strong red and green, little blue.
            XCTAssertGreaterThan(c.r, 0.8); XCTAssertGreaterThan(c.g, 0.6); XCTAssertLessThan(c.b, 0.6)
        }
    }

    func testTheTrailIsWhereTheSparklerHasBeenHeldOnScreenWithSlowInertia() {
        var trail = Sparkler.DustTrail()
        // At rest it lays nothing.
        trail.follow(tip: 650, content: 500, time: 0)
        trail.follow(tip: 650, content: 500, time: 0.95)
        XCTAssertEqual(trail.count, 0)
        // Going on down the feed, it lays the stretch it just passed, behind it on screen...
        trail.follow(tip: 650, content: 560, time: 1.0)
        XCTAssertGreaterThan(trail.count, 10)
        let laid = trail.motes(time: 1.2)
        XCTAssertFalse(laid.isEmpty)
        XCTAssertTrue(laid.allSatisfy { $0.y > 580 && $0.y < 700 })
        // ...which drifts on down, slowing, and is not carried by the scroll.
        // (Stardust only: the glints of sparkle are briefer, so they come and go between looks.)
        let mean = { (ms: [Sparkler.Mote]) in
            let dust = ms.filter { !$0.glint }
            return dust.map(\.y).reduce(0, +) / Double(dust.count)
        }
        let a = mean(trail.motes(time: 1.5)), b = mean(trail.motes(time: 2.5)), c = mean(trail.motes(time: 3.5))
        XCTAssertGreaterThan(b, a)
        XCTAssertLessThan(c - b, b - a)
        // Turning back, the new trail is laid below it and drifts up.
        var back = Sparkler.DustTrail()
        back.follow(tip: 650, content: 560, time: 0)
        back.follow(tip: 650, content: 500, time: 0.5)
        XCTAssertLessThan(mean(back.motes(time: 2.0)), mean(back.motes(time: 0.6)))
        XCTAssertTrue(back.motes(time: 0.6).allSatisfy { $0.y > 620 })
        // Nothing is permanent.
        XCTAssertTrue(trail.motes(time: 30).isEmpty)
        trail.follow(tip: 650, content: 560, time: 30)
        XCTAssertEqual(trail.count, 0)
    }

    func testStardustNeverPilesUpPastItsLimit() {
        var trail = Sparkler.DustTrail()
        for i in 0..<400 { trail.follow(tip: 650, content: Double(i) * 30, time: Double(i) * 0.05) }
        XCTAssertLessThanOrEqual(trail.count, Sparkler.DustTrail.most)
    }

    func testDefaultWhiteTurnsToNightInDarkModeButAPickedColorStays() {
        XCTAssertEqual(Sparkler.background("white", dark: true).id, "night")
        XCTAssertTrue(Sparkler.background("white", dark: true).dark)
        XCTAssertEqual(Sparkler.background("white", dark: false).id, "white")
        XCTAssertEqual(Sparkler.background("mint", dark: true).id, "mint")
        let ink = Sparkler.ink(Sparkler.night)
        XCTAssertGreaterThanOrEqual(ink.text.contrast(Sparkler.night.base), 4.5)
        XCTAssertGreaterThanOrEqual(ink.muted.contrast(Sparkler.night.base), 4.5)
    }
}

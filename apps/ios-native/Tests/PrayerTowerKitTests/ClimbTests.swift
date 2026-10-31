import Foundation
import Testing
@testable import PrayerTowerKit

/// The Mountain Climber skin (Steve, 2026-10-31), matching layouts/climb.test.tsx in the Expo app.
@Suite struct ClimbTests {
    @Test func climbsUpRappelsDownQuicklyAndStopsWhereYouStop() {
        #expect(Climb.chase(500, to: 200).mode == .up)
        #expect(Climb.chase(200, to: 500).mode == .down)
        var y: Double = 200
        for _ in 0..<60 { y = Climb.chase(y, to: 900).y }
        #expect(abs(y - 900) < 1)
        let done = Climb.chase(900, to: 900)
        #expect(done.mode == .still && done.y == 900)
    }

    @Test func isSeenFromTheSide() {
        let up = Climb.pose(.up, p: 1, t: 0), down = Climb.pose(.down, p: 1, t: 0)
        #expect(up.axeInHand && !down.axeInHand)
        #expect(up.off < down.off)
        #expect(down.lean < -25)
        #expect(Climb.pose(.up, p: 0.5, t: 0).nearHip != Climb.pose(.up, p: 2, t: 0).nearHip)
    }

    @Test func rockFillsTheBandAndTheCliffEdgeJoinsTheNextBand() {
        let rock = Climb.rock(w: 390, h: 520, seed: 3)
        #expect(rock.facets.count > 40)
        #expect(!rock.cracks.isEmpty)
        for f in rock.facets { for p in f.points { #expect(p.x >= -0.1 && p.y >= -0.1) } }
        let edge = Climb.cliffEdge(h: 520, seed: 3)
        #expect(edge.first!.x == Climb.edgeX && edge.first!.y == 0)
        #expect(edge.last!.x == Climb.edgeX && edge.last!.y == 520)
        for p in edge { #expect(abs(p.x - Climb.edgeX) <= 11) }
    }

    @Test func readsItsTokensAndKeepsTextReadable() throws {
        let theme = try JSONDecoder().decode(FeedTheme.self, from: Data(##"{"slug":"mountain-climber","name":"Mountain Climber","layout":"climb","tokens":{"backdrop":"#B8AB96"}}"##.utf8))
        #expect(theme.kind == .climb)
        #expect(Skin.backdrop(theme)?.hex == "#B8AB96")
        #expect(ClimbLook(theme).slab.contrast(.textMuted) >= 4.5)
    }
}

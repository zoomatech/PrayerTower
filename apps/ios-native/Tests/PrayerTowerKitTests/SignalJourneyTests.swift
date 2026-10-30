import Foundation
import Testing
@testable import PrayerTowerKit

// The same answers as packages/shared signalJourney (apps/server/test/signal-queue.test.ts).
struct SignalJourneyTests {
    let t0 = Date(timeIntervalSince1970: 1_793_318_400)

    @Test func measuresHowFarAWaveHasGone() {
        let early = SignalJourney.at(sentAt: t0, now: t0.addingTimeInterval(-5))
        #expect(early.km == 0 && early.passed.isEmpty && early.next?.key == "moon")
        let one = SignalJourney.at(sentAt: t0, now: t0.addingTimeInterval(1))
        #expect(abs(one.km - SignalJourney.lightKmS) < 0.001)
        #expect(one.lightValue == 1 && one.lightUnit == "second")
        #expect(SignalJourney.at(sentAt: t0, now: t0.addingTimeInterval(1.3)).passed == ["moon"])
        let tenMin = SignalJourney.at(sentAt: t0, now: t0.addingTimeInterval(600))
        #expect(tenMin.lightValue == 10 && tenMin.lightUnit == "minute")
        #expect(tenMin.passed == ["moon", "sun"])
        #expect(tenMin.next?.key == "neptune")
        #expect((tenMin.next?.fraction ?? 0) > 0 && (tenMin.next?.fraction ?? 1) < 1)
        let day = SignalJourney.at(sentAt: t0, now: t0.addingTimeInterval(86_400))
        #expect(day.lightValue == 1 && day.lightUnit == "day")
        #expect(day.passed == ["moon", "sun", "neptune", "heliopause", "voyager"])
        let far = SignalJourney.at(sentAt: t0, now: t0.addingTimeInterval(5 * 365.25 * 86_400))
        #expect(far.lightUnit == "year" && far.lightValue == 5)
        #expect(far.passed.count == SignalJourney.landmarks.count && far.next == nil)
    }

    @Test func landmarksRunNearestFirstAndTheTrackStaysInBounds() {
        let kms = SignalJourney.landmarks.map(\.km)
        #expect(kms == kms.sorted())
        #expect(SignalJourney.track(0) == 0)
        #expect(SignalJourney.track(1e30) == 1)
        #expect(SignalJourney.track(384_400) < SignalJourney.track(SignalJourney.auKm))
    }
}

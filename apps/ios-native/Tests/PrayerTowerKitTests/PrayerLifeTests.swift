import Foundation
import Testing
@testable import PrayerTowerKit

private let statsJSON = ##"{"stats":{"enabled":true,"daysPrayed":12,"peoplePrayedFor":30,"requestsPrayedFor":40,"currentStreak":3,"longestStreak":5,"week":[{"date":"2026-10-23","prayed":true},{"date":"2026-10-24","prayed":false}],"monthDays":9,"welcomeBack":true,"freshStart":"month","weeksPrayed":6,"weekRun":null,"intention":{"days":3,"week":[{"date":"2026-10-27","prayed":true}],"shown":1,"met":false},"freshDay":null}}"##

@Suite struct PrayerLifeTests {
    let stats = try! JSONDecoder().decode(PrayerStatsWrapper.self, from: Data(statsJSON.utf8)).stats
    let faith = Words(.faith), neutral = Words(.neutral)

    @Test func showsDaysInARowUnlessAGentleSwitchIsOn() {
        let none = Features(values: [:])
        #expect(stats.third(none, faith).value == 3)
        #expect(stats.note(none, faith).hasPrefix("3 days in a row"))
        let rhythm = Features(values: ["gentleRhythm": true])
        #expect(stats.third(rhythm, faith).value == 9)
        #expect(stats.gentleLines(rhythm, faith).count == 2)
        #expect(stats.gentleLines(none, faith).isEmpty)
        let weeks = Features(values: ["gentleStreak": true, "gentleRhythm": true])
        #expect(stats.third(weeks, faith).value == 6)
        // Under two weeks in a row, the run is never shown as lost: the plain note instead.
        #expect(stats.note(weeks, faith).hasPrefix(faith("reminders.weeksNote")))
    }

    @Test func openCircleWordsHaveNoPrayer() {
        let all = [Features(values: [:]), Features(values: ["gentleRhythm": true]), Features(values: ["gentleStreak": true])]
        let text = all.flatMap { [stats.summary($0, neutral), stats.note($0, neutral), stats.third($0, neutral).label] + stats.gentleLines($0, neutral) }
            + [neutral("intention.title"), stats.intention!.line(neutral)!]
        #expect(!text.joined(separator: " ").lowercased().contains("pray"))
    }

    @Test func theIntentionNeverMentionsAShortWeek() {
        #expect(stats.intention?.line(faith) == "Days you showed up this week: 1")
        let none = PrayerStats.Intention(days: nil, week: [], shown: 2, met: false)
        #expect(none.line(faith) == nil)
    }
}

extension APIClientTests {
    @Test func setsTheWeeklyIntentionOrNoAim() async throws {
        StubProtocol.answer = (200, statsJSON)
        _ = try await client().setWeeklyIntention(nil, timeZone: "America/Chicago")
        let body = try JSONSerialization.jsonObject(with: StubProtocol.seen.last!.httpBody!) as! [String: Any]
        #expect(body["days"] is NSNull && body["tz"] as? String == "America/Chicago")
        #expect(StubProtocol.seen.last?.httpMethod == "PUT")
        #expect(try await client().prayerStats().weeksPrayed == 6)
    }
}

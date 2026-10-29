import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

@Suite struct GiftScheduleTests {
    private var utc: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    @Test func picksTheNextFridayEveningAndSkipsOneThatIsNow() throws {
        // Thursday 29 Oct 2026, 10:00 UTC.
        let thu = try Date("2026-10-29T10:00:00Z", strategy: .iso8601)
        #expect(GiftSchedule.next(GiftSchedule.whens[0], from: thu, calendar: utc) == (try Date("2026-10-30T19:00:00Z", strategy: .iso8601)))
        let friEvening = try Date("2026-10-30T19:00:00Z", strategy: .iso8601)
        #expect(GiftSchedule.next(GiftSchedule.whens[0], from: friEvening, calendar: utc) == (try Date("2026-11-06T19:00:00Z", strategy: .iso8601)))
    }

    @Test func offersAtMostThreeDrawablePoolsFullestFirst() {
        let pools = [("a", 5, nil), ("b", 50, nil), ("c", 9, "Daily limit reached"), ("d", 20, nil), ("e", 1, nil)].map {
            TokenPool(id: $0.0, name: $0.0, drawAmount: 2, balance: $0.1, blockedReason: $0.2)
        }
        #expect(GiftSchedule.offered(pools).map(\.id) == ["b", "d", "a"])
    }

    @Test func giftWordsHaveNoReligiousWordsInOpenCircle() {
        let w = Words(.neutral)
        for key in ["actions.giftNote", "actions.giveDone", "scheduled.intro", "notifySettings.prayers", "notifySettings.prayersHint", "notifySettings.intro"] {
            #expect(!w(key).lowercased().contains("pray"), "\(key)")
        }
        for c in NotificationPrefs.categories { #expect(w("notifySettings.\(c)") != "notifySettings.\(c)") }
    }
}

@Suite struct NotificationPrefsTests {
    @Test func turnsCategoriesOffAndOnAndSendsQuietHours() throws {
        var p = NotificationPrefs().setting("tokens", on: false)
        #expect(!p.isOn("tokens"))
        p = p.setting("tokens", on: true).quiet(on: true, start: "21:00", timeZone: "America/Chicago")
        #expect(p.isOn("tokens"))
        #expect(p.quietHours == .init(start: "21:00", end: "07:00", timeZone: "America/Chicago"))
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(p.quiet(on: false).patch)) as? [String: Any]
        let prefs = json?["notificationPrefs"] as? [String: Any]
        #expect(prefs?["quietHours"] is NSNull)
        #expect((prefs?["off"] as? [String])?.isEmpty == true)
    }
}

extension APIClientTests {
    @Test func readsScheduledGiftsAndSchedulesOne() async throws {
        StubProtocol.answer = (200, #"{"schedules":[{"id":"s1","post_id":"p1","amount":3,"next_run_at":"2026-10-30T19:00:00.000Z","repeat_weeks":4,"runs":1,"action":"reach","status":"active","error":null,"excerpt":"My knee"}]}"#)
        let list = try await client().scheduledSpends()
        #expect(list.first?.repeatWeeks == 4)

        StubProtocol.answer = (201, #"{"schedule":{}}"#)
        _ = try await client().scheduleSpend(postId: "p1", amount: 3, at: try Date("2026-10-30T19:00:00Z", strategy: .iso8601), repeatWeeks: 4)
        let body = try JSONSerialization.jsonObject(with: try #require(StubProtocol.seen.last?.httpBody)) as? [String: Any]
        #expect(body?["runAt"] as? String == "2026-10-30T19:00:00.000Z")
        #expect(body?["repeatWeeks"] as? Int == 4)
    }
}

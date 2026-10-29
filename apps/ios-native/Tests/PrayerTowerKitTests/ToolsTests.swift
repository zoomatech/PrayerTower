import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct ToolsTests {
    let w = Words(.faith)

    @Test func prayerListItemTrimsAndClampsTheHour() throws {
        let tz = try #require(TimeZone(identifier: "America/Denver"))
        let jan = Date(timeIntervalSince1970: 1_767_225_600) // 2026-01-01, MST
        let item = NewPrayerListItem(name: "  Grandma ", note: " hip ", remind: "daily", hour: "30", timeZone: tz, at: jan)
        #expect(item.name == "Grandma")
        #expect(item.note == "hip")
        #expect(item.hour == 23)
        #expect(item.tzOffsetMinutes == 420)
        #expect(NewPrayerListItem(name: "x", note: "", remind: "off", hour: "abc").hour == 0)
    }

    @Test func prayerMinuteTime() {
        #expect(PrayerMinute.valid("07:30"))
        #expect(!PrayerMinute.valid("7:30"))
        #expect(!PrayerMinute.valid("noon"))
    }

    @Test func newPoolNeedsTokensAndACapWhenMatching() throws {
        #expect(NewPool(name: "", purpose: "", realm: nil, amount: "5", draw: "1", showDonor: false, matching: false, manyHands: false, ratio: "", cap: "") == nil)
        #expect(NewPool(name: "Fam", purpose: "", realm: nil, amount: "0", draw: "1", showDonor: false, matching: false, manyHands: false, ratio: "", cap: "") == nil)
        let plain = try #require(NewPool(name: " Fam ", purpose: "", realm: "health", amount: "5", draw: "1", showDonor: true, matching: true, manyHands: false, ratio: "0", cap: ""))
        #expect(plain.name == "Fam" && plain.matchCap == nil && plain.matchRatio == nil)
        #expect(NewPool(name: "Fam", purpose: "", realm: nil, amount: "5", draw: "1", showDonor: false, matching: true, manyHands: false, ratio: "2", cap: "") == nil)
        let ratio = try #require(NewPool(name: "Fam", purpose: "", realm: nil, amount: "5", draw: "1", showDonor: false, matching: true, manyHands: false, ratio: "2", cap: "50"))
        #expect(ratio.matchRatio == 2 && ratio.matchCap == 50 && ratio.matchMode == nil)
        let many = try #require(NewPool(name: "Fam", purpose: "", realm: nil, amount: "5", draw: "1", showDonor: false, matching: true, manyHands: true, ratio: "", cap: "9"))
        #expect(many.matchMode == "quadratic" && many.matchRatio == nil)
        let json = String(decoding: try JSONEncoder().encode(plain), as: UTF8.self)
        #expect(!json.contains("matchCap"))
    }

    @Test func givingAmountsAndTargets() throws {
        #expect(Giving.dollars(2500) == "$25")
        #expect(Giving.dollars(1250) == "$12.50")
        #expect(Giving.cents("$12.50") == 1250)
        #expect(Giving.cents("1,000") == 100_000)
        #expect(Giving.cents("abc") == nil)
        #expect(Giving.cents("-3") == nil)
        let enc = JSONEncoder()
        enc.outputFormatting = .sortedKeys
        #expect(String(decoding: try enc.encode(Giving.Target.member("u1")), as: UTF8.self) == #"{"kind":"member","userId":"u1"}"#)
        #expect(String(decoding: try enc.encode(Giving.Target.pool("p")), as: UTF8.self) == #"{"kind":"pool","poolId":"p"}"#)
    }

    @Test func decodesServerShapes() throws {
        let cast = try JSONDecoder().decode(PrayerCast.self, from: Data(#"{"totals":{"prayers":3,"sends":2},"cast":[{"id":"c","post_id":"p","text":"Heal","repeats":2,"transmitter":"log","call_sign":null,"transmitted_at":"2026-10-29T10:00:00Z"}]}"#.utf8))
        #expect(cast.cast.first?.transmitter == "log")
        let pool = try JSONDecoder().decode(TokenPool.self, from: Data(#"{"id":"p","name":"Fam","drawAmount":1,"balance":4,"blockedReason":null,"donor":"Ana","match":{"mode":"ratio","ratio":1,"cap":10,"matched":2}}"#.utf8))
        #expect(pool.match?.matched == 2 && pool.donor == "Ana")
        let list = try JSONDecoder().decode(PrayerList.self, from: Data(#"{"enabled":true,"items":[{"id":"i","name":"Mom","note":"","remind":"off","nextReminderAt":null,"lastPrayedAt":null,"prayedCount":2}]}"#.utf8))
        #expect(list.items?.first?.prayedCount == 2)
    }

    @Test func wordsFillBothPlaceholderStyles() {
        #expect(w("give.giveAmount", ["amount": "$10"]) == "Give $10")
        #expect(w("post.powerCost", ["cost": "3"], count: 5).contains("5 more people"))
    }
}

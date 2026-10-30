import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

private func card(_ extra: String = "", mine: Bool = true, type: String = "prayer_request") throws -> Card {
    let json = """
    {"id":"p1","author":{"id":null,"displayName":"Ethel","handle":null,"anonymous":false},"isMine":\(mine),"postType":"\(type)","urgency":2,
     "preview":"Pray for my knee","body":"Pray for my knee","crisis":false,
     "counts":{"prayingNow":0,"prayers":0,"commitments":0,"comments":0,"encouragements":0},"createdAt":"2026-10-29T08:00:00Z","state":"open"\(extra)}
    """
    return try JSONDecoder().decode(Card.self, from: Data(json.utf8))
}

private func tokens(balance: Int, cost: Int, repeats: Int? = 3, amplifyCost: Int? = 2) -> TokenSummary {
    TokenSummary(balance: 0, priestly: .init(balance: balance, towardNext: 0, prayersPerToken: 10, radioPrayerCost: cost, amplifyRepeats: repeats, amplifyCost: amplifyCost))
}

private let allOn = Features(values: ["heardTrail": true, "scheduledRadio": true, "keepOnAir": true, "lament": true])

@Suite struct RadioOfferTests {
    @Test func offersSendAmplifyScheduleAndKeepOnAirWithEnoughTokens() throws {
        let o = Radio.offer(card: try card(), features: allOn, radioOn: true, tokens: tokens(balance: 2, cost: 1))
        #expect(o.sendCost == 1)
        #expect(o.amplify == .init(repeats: 3, cost: 2))
        #expect(o.schedule && o.scheduleCanAmplify && o.keepOnAir && o.trail)
    }

    @Test func noSendWithoutEnoughPriestlyTokens() throws {
        let o = Radio.offer(card: try card(), features: allOn, radioOn: true, tokens: tokens(balance: 0, cost: 1))
        #expect(o.sendCost == nil && o.amplify == nil)
        // Scheduling still shows: the price is checked when it runs.
        #expect(o.schedule)
    }

    @Test func freeRadioNeedsNoTokens() throws {
        let o = Radio.offer(card: try card(), features: allOn, radioOn: true, tokens: tokens(balance: 0, cost: 0, repeats: nil, amplifyCost: nil))
        #expect(o.sendCost == 0)
        #expect(o.amplify == nil && !o.scheduleCanAmplify)
    }

    @Test func followsTheSwitchesAndTheCommunity() throws {
        let c = try card()
        #expect(Radio.offer(card: c, features: allOn, radioOn: false, tokens: tokens(balance: 5, cost: 1)) == RadioOffer(trail: true))
        let off = Radio.offer(card: c, features: Features(values: [:]), radioOn: true, tokens: tokens(balance: 5, cost: 1))
        #expect(!off.schedule && !off.keepOnAir && !off.trail)
        #expect(off.sendCost == 1)
    }

    @Test func aLamentGoesOnTheAirOnlyWhenItsAuthorSaidSo() throws {
        let held = Radio.offer(card: try card(#","lament":true,"lamentRadio":false"#), features: allOn, radioOn: true, tokens: tokens(balance: 5, cost: 1))
        #expect(held.sendCost == nil && !held.schedule)
        let allowed = Radio.offer(card: try card(#","lament":true,"lamentRadio":true"#), features: allOn, radioOn: true, tokens: tokens(balance: 5, cost: 1))
        #expect(allowed.sendCost == 1)
    }

    @Test func keepOnAirOnlyForTheAuthorsOpenNonSensitiveRequest() throws {
        let t = tokens(balance: 5, cost: 1)
        #expect(!Radio.offer(card: try card(mine: false), features: allOn, radioOn: true, tokens: t).keepOnAir)
        #expect(!Radio.offer(card: try card(#","isSensitive":true"#), features: allOn, radioOn: true, tokens: t).keepOnAir)
        #expect(!Radio.offer(card: try card(type: "thanksgiving"), features: allOn, radioOn: true, tokens: t).keepOnAir)
        #expect(Radio.offer(card: try card(type: "discussion"), features: allOn, radioOn: true, tokens: t) == RadioOffer(trail: true))
    }
}

@Suite struct RadioScheduleTests {
    let cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Chicago")!
        return c
    }()

    @Test func nextFridayAtSevenIsAlwaysAhead() throws {
        // Thursday 29 Oct 2026, 10:00 local.
        let thu = try #require(cal.date(from: DateComponents(year: 2026, month: 10, day: 29, hour: 10)))
        let fri = Radio.nextWeekday(6, hour: 19, from: thu, calendar: cal)
        #expect(cal.dateComponents([.month, .day, .hour], from: fri) == DateComponents(month: 10, day: 30, hour: 19))
        // Friday 19:00 exactly: next week.
        let again = Radio.nextWeekday(6, hour: 19, from: fri, calendar: cal)
        #expect(cal.dateComponents([.month, .day], from: again) == DateComponents(month: 11, day: 6))
    }

    @Test func readsATypedTimeOnlyWhenItIsRealAndAhead() throws {
        let now = try #require(cal.date(from: DateComponents(year: 2026, month: 10, day: 29, hour: 10)))
        let d = try #require(Radio.parseLocal(" 2026-11-06 19:30 ", now: now, calendar: cal))
        #expect(cal.dateComponents([.day, .hour, .minute], from: d) == DateComponents(day: 6, hour: 19, minute: 30))
        #expect(Radio.parseLocal("2026-10-01 09:00", now: now, calendar: cal) == nil)
        #expect(Radio.parseLocal("2026-02-30 09:00", now: now, calendar: cal) == nil)
        #expect(Radio.parseLocal("next friday", now: now, calendar: cal) == nil)
    }

    @Test func everyRadioWordIsThereInBothWordings() {
        let keys = ["post.radio", "post.radioSent", "keepOnAir.toggle", "keepOnAir.hint", "radioTrail.title", "radioTrail.none", "scheduleRadio.title",
                    "scheduleRadio.submit", "signalQueue.title", "signalQueue.intro", "signalQueue.empty", "signalQueue.off", "scheduled.intro", "scheduled.empty"]
            + Radio.whenOptions.map { "actions.whenOptions.\($0.key)" }
            + ["waiting", "sending", "sent", "not_sent"].map { "signalQueue.status.\($0)" }
        for k in keys {
            #expect(Words(.faith)(k) != k, "\(k)")
            #expect(Words(.neutral)(k) != k, "\(k)")
        }
        let w = Words(.neutral)
        for k in ["post.radio", "keepOnAir.toggle", "keepOnAir.hint", "signalQueue.intro", "radioTrail.title", "scheduleRadio.hint"] {
            let text = w(k).lowercased()
            #expect(!text.contains("pray") && !text.contains("god"), "\(k): \(text)")
        }
    }
}

extension APIClientTests {
    @Test func sendsARadioPrayerOnceWithAnIdempotencyKey() async throws {
        StubProtocol.answer = (201, #"{"radioPrayer":{"id":"r1","status":"queued","repeats":3}}"#)
        let r = try await client().sendRadioPrayer(postId: "p1", amplify: true)
        #expect(r.repeats == 3)
        let req = try #require(StubProtocol.seen.last)
        #expect(req.url?.path == "/posts/p1/radio")
        let body = try JSONSerialization.jsonObject(with: try #require(req.httpBody)) as? [String: Any]
        #expect(body?["amplify"] as? Bool == true)
        #expect((body?["idempotencyKey"] as? String)?.hasPrefix("radio-p1-") == true)
    }

    @Test func readsMySignalQueueAndWhereItWasHeard() async throws {
        StubProtocol.answer = (200, """
        {"signals":[{"id":"r1","postId":"p1","excerpt":"Pray for my knee","status":"sent","kind":"prayer","amplified":false,"queuedAt":"2026-10-29T08:00:00Z",
          "sentAt":"2026-10-29T08:05:00Z","callSign":"N0CALL","preset":"fm-standard","heardCount":2,"signalCode":"K7Q2"}]}
        """)
        let s = try #require(try await client().signalQueue().first)
        #expect(s.spokenCode == "K 7 Q 2")
        StubProtocol.answer = (200, #"{"trail":[{"sentAt":"2026-10-29T08:05:00Z","callSign":"N0CALL","amplified":false,"nodes":[{"name":"Hilltop","snrDb":14.5,"at":"2026-10-29T08:05:03Z"}],"phones":3}]}"#)
        let trail = try await client().radioTrail(postId: "p1")
        #expect(trail.first?.nodes.first?.name == "Hilltop")
        #expect(trail.first?.phones == 3)
    }

    @Test func readsSignalJourneyFieldsWhenTheServerSendsThem() async throws {
        StubProtocol.answer = (200, """
        {"journey":true,"signals":[{"id":"r1","postId":"p1","excerpt":"Pray","status":"sent","kind":"prayer","amplified":true,"copies":1000,"queuedAt":"2026-10-29T08:00:00Z",
          "sentAt":"2026-10-29T08:05:00Z","callSign":"N0CALL","preset":null,"heardCount":2,"signalCode":"K7Q2","bestSnrDb":14}]}
        """)
        let r = try await client().signalQueueWithJourney()
        #expect(r.journey)
        #expect(r.signals.first?.copies == 1000)
        #expect(r.signals.first?.bestSnrDb == 14)
    }

    @Test func schedulesARadioSendAndKeepsARequestOnTheAir() async throws {
        StubProtocol.answer = (201, #"{"schedule":{"id":"s1","post_id":"p1","amount":1,"next_run_at":"2026-10-31T00:00:00Z","repeat_weeks":4,"runs":0,"action":"radio","status":"active","error":null,"excerpt":"Pray"}}"#)
        let s = try await client().scheduleSpend(postId: "p1", NewScheduledSpend(amount: 1, runAt: "2026-10-31T00:00:00.000Z", repeatWeeks: 4, action: "radio"))
        #expect(s.isRadio && s.repeatWeeks == 4)
        StubProtocol.answer = (200, #"{"keepOnAir":true}"#)
        #expect(try await client().setKeepOnAir(postId: "p1", on: true))
        let req = try #require(StubProtocol.seen.last)
        #expect(req.httpMethod == "PUT")
        #expect(String(decoding: try #require(req.httpBody), as: UTF8.self) == #"{"on":true}"#)
    }
}

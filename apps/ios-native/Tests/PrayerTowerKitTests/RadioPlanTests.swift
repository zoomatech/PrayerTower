import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

@Suite struct RadioPlanTests {
    @Test func readsTheBandPlanAndUrgentPrayers() throws {
        let plan = #"""
        {"enabled":true,"bands":[{"label":"40 m","freqHz":7103000,"mode":"usb"},{"label":"20 m","freqHz":14103000,"mode":"usb","preset":"hf-standard"}],
         "spaceWeather":{"sfi":152.3,"kp":2.7,"fluxAt":"2026-10-29T20:00:00Z","fetchedAt":"2026-10-29T21:00:00.000Z"},
         "outlook":{"now":{"band":{"label":"20 m","freqHz":14103000,"mode":"usb"},"reason":"hf","mufMhz":24.6,"workingMhz":19.7},"spaceWeather":null,
           "hours":[{"at":"2026-10-29T18:00:00.000Z","band":"20 m","mufMhz":24.6,"onAir":true},{"at":"2026-10-29T19:00:00.000Z","band":"20 m","mufMhz":22,"onAir":true},
                    {"at":"2026-10-29T20:00:00.000Z","band":"40 m","mufMhz":12,"onAir":false},{"at":"2026-10-29T21:00:00.000Z","band":null,"mufMhz":null,"onAir":true}]}}
        """#
        let p = try JSONDecoder().decode(BandPlan.self, from: Data(plan.utf8))
        #expect(p.bands[1].preset == "hf-standard" && p.bands[0].preset == nil)
        #expect(p.outlook?.now?.band.mhz == "14.103")
        // Only the hours where the band changes, after the first.
        #expect(p.outlook?.changes.map(\.band) == ["40 m", nil])

        let urgent = #"""
        {"enabled":true,"repeats":3,"preset":"auto","confirmMinutes":15,"maxRetries":2,"presetNow":"hf-robust","nextWindowAt":null,
         "prayers":[{"id":"u1","postId":"p1","text":"Pray","status":"transmitted","repeats":3,"flaggedAt":"2026-10-29T18:00:00.000Z",
           "transmittedAt":"2026-10-29T18:01:00.000Z","confirmedAt":null,"heardCount":0,"retries":1}]}
        """#
        let u = try JSONDecoder().decode(UrgentRadio.self, from: Data(urgent.utf8))
        #expect(u.presetNow == "hf-robust" && u.nextWindowAt == nil && u.prayers[0].retries == 1)
    }

    @Test func theConsoleReadsWithAndWithoutTheNewCards() throws {
        let demo = ConsoleDemo(now: Date(timeIntervalSince1970: 1_793_000_000))
        let data = try JSONEncoder().encode(demo.console)
        let back = try JSONDecoder().decode(RadioConsole.self, from: data)
        #expect(back.band != nil && back.urgent?.enabled == true)
        // An older server sends neither.
        var json = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        json["band"] = nil
        json["urgent"] = nil
        let old = try JSONDecoder().decode(RadioConsole.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(old.band == nil && old.urgent == nil)
    }

    @Test func bandsReadAndWriteAsOneLineEach() {
        let bands = RadioBand.parse("20 m, 14.103, usb, hf-standard\n\n2 m FM, 146.52, fm")
        #expect(bands == [RadioBand(label: "20 m", freqHz: 14_103_000, mode: "usb", preset: "hf-standard"), RadioBand(label: "2 m FM", freqHz: 146_520_000, mode: "fm")])
        #expect(bands?.map(\.line).joined(separator: "\n") == "20 m, 14.103, usb, hf-standard\n2 m FM, 146.52, fm")
        #expect(RadioBand.parse("20 m, fourteen, usb") == nil)
        #expect(RadioBand.parse("20 m, 14.103, cw") == nil)
        #expect(RadioBand.parse("tiny, 0.1, usb") == nil)
    }

    @Test func onlyStaffMarkOrdinaryRequestsUrgent() throws {
        func card(_ type: String = "prayer_request", sensitive: Bool = false, state: String = "open") throws -> Card {
            let json = #"{"id":"p1","author":{"displayName":"Ann","anonymous":false},"isMine":false,"postType":"\#(type)","urgency":0,"preview":"x","body":"x","crisis":false,"#
                + #""isSensitive":\#(sensitive),"counts":{"prayingNow":0,"prayers":0,"commitments":0,"comments":0},"createdAt":"2026-10-29T18:00:00Z","state":"\#(state)"}"#
            return try JSONDecoder().decode(Card.self, from: Data(json.utf8))
        }
        #expect(!UrgentRadio.mayFlag(roles: ["admin"], card: try card(sensitive: true)))
        #expect(!UrgentRadio.mayFlag(roles: ["admin"], card: try card(state: "answered")))
        #expect(!UrgentRadio.mayFlag(roles: ["admin"], card: try card("praise")))
        let request = try card()
        #expect(UrgentRadio.mayFlag(roles: ["radio_operator"], card: request))
        #expect(UrgentRadio.mayFlag(roles: ["admin"], card: request))
        #expect(!UrgentRadio.mayFlag(roles: ["moderator"], card: request))
    }

    @Test func theSampleHasSomethingInEveryScreen() {
        var d = RadioPlanDemo(now: Date(timeIntervalSince1970: 1_793_000_000))
        #expect(d.plan.enabled && d.plan.bands.count == 3 && d.plan.outlook?.hours.count == 24)
        #expect(d.plan.outlook?.now?.band.label == d.plan.outlook?.hours.first?.band)
        #expect(d.urgent.prayers.contains { $0.confirmedAt != nil } && d.urgent.prayers.contains { $0.status == "queued" })
        d.unflag("demo-u2") // sent, so it stays
        d.unflag("demo-u1")
        #expect(d.urgent.prayers.map(\.id) == ["demo-u2", "demo-u3"])
    }

    @Test func wordsExistInBothEditions() {
        for key in ["bandPlan.title", "bandPlan.on", "bandPlan.hint", "bandPlan.now", "bandPlan.weather", "bandPlan.from", "bandPlan.badLine",
                    "urgentRadio.title", "urgentRadio.on", "urgentRadio.send", "urgentRadio.confirmed", "urgentRadio.nextWindow", "urgentRadio.cantSend"] {
            #expect(Words(.faith)(key) != key, "\(key)")
            #expect(Words(.neutral)(key) != key, "\(key)")
        }
        #expect(Words(.faith)("urgentRadio.repeats", count: 3) == "Said 3 times")
    }
}

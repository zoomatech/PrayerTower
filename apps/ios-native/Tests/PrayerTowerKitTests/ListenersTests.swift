import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

@Suite struct ListenersTests {
    @Test func readsRequestsCardsAndTheStationReport() throws {
        let signups = #"""
        {"enabled":true,"emailReady":false,"signups":[{"id":"s1","name":"Ann","email":"ann@example.com","place":"Chatham","lat":39.7,"lon":-89.7,"receiver":"rtl-sdr",
          "platform":"pi","callSign":null,"note":"","edition":"open-circle","status":"pending","setupExpiresAt":null,"nodeId":null,"createdAt":"2026-10-29T20:00:00.000Z"}]}
        """#
        let s = try JSONDecoder().decode(ListenerSignups.self, from: Data(signups.utf8))
        #expect(s.signups[0].edition == "open-circle" && s.signups[0].callSign == nil && !s.emailReady)

        let cards = #"""
        {"enabled":true,"cards":[{"token":"abc","path":"/qsl/abc","node":"Hilltop","callSign":"W1AW","day":"2026-10-29","serial":7,"preset":"fm-standard","bestSnrDb":21.3,
          "prayers":12,"firstHeardAt":"2026-10-29T08:00:00.000Z","lastHeardAt":"2026-10-29T09:00:00.000Z","edition":"prayer-tower"}]}
        """#
        #expect(try JSONDecoder().decode(QslCards.self, from: Data(cards.utf8)).cards[0].id == "abc")

        let report = #"""
        {"enabled":true,"email":false,"thisWeek":null,"history":[],"lastWeek":{"weekStart":"2026-10-19",
          "bursts":{"sent":42,"failed":1,"airSeconds":610,"prayers":300,"presets":{"fm-standard":42}},
          "prayers":{"delivered":300,"heard":240,"failed":2,"waiting":3},
          "listeners":{"nodes":4,"reporting":3,"quiet":["Lake cabin"],"placed":3,"signups":2,"joined":1,"cards":5,
            "perNode":[{"name":"Hilltop","receiver":null,"reports":0,"snrDb":null,"quality":"none"}]},
          "problems":{"total":3,"byKind":{"ptt_failed":1},"burstErrors":[{"error":"PTT did not key","count":1}]}}}
        """#
        let r = try #require(try JSONDecoder().decode(StationReportOverview.self, from: Data(report.utf8)).lastWeek)
        #expect(r.airTime == "10 min")
        #expect(r.problems.byKind["ptt_failed"] == 1 && r.listeners.perNode[0].snrDb == nil)
    }

    @Test func theSampleHasSomethingInEveryScreen() {
        var d = ListenerDemo(now: Date(timeIntervalSince1970: 1_793_000_000))
        #expect(d.signups.enabled && d.signups.signups.contains { $0.status == "pending" })
        #expect(d.cards.enabled && !d.cards.cards.isEmpty)
        let this = d.report.thisWeek!, last = d.report.lastWeek!
        #expect(d.report.enabled && last.problems.total > 0)
        // Weeks start on Monday, UTC: last week is exactly seven days earlier.
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate]
        let gap = f.date(from: this.weekStart)!.timeIntervalSince(f.date(from: last.weekStart)!)
        #expect(gap == 7 * 86_400)
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        #expect(cal.component(.weekday, from: f.date(from: this.weekStart)!) == 2)
        d.approve("demo-s1")
        #expect(d.signups.signups.first { $0.id == "demo-s1" }?.status == "approved")
        d.decline("demo-s2")
        #expect(d.signups.signups.first { $0.id == "demo-s2" }?.status == "declined")
    }

    @Test func wordsExistInBothEditions() {
        for key in ["listeners.on", "listeners.hint", "listeners.approve", "listeners.receiver.rtl-sdr", "listeners.platform.pi", "listeners.status.joined", "qsl.on", "qsl.row",
                    "stationReport.title", "stationReport.delivered", "stationReport.burstError"] {
            #expect(Words(.faith)(key) != key, "\(key)")
            #expect(Words(.neutral)(key) != key, "\(key)")
        }
        #expect(Words(.faith)("listeners.waiting", count: 2) == "2 requests waiting")
        #expect(!Words(.neutral)("stationReport.delivered").lowercased().contains("pray"))
    }
}

extension APIClientTests {
    @Test func approvesAListenerAndSwitchesTheReport() async throws {
        StubProtocol.answer = (200, #"""
        {"signup":{"id":"s1","name":"Ann","email":"a@example.com","place":"","lat":null,"lon":null,"receiver":"radio","platform":"mac","callSign":null,"note":"",
          "edition":"prayer-tower","status":"approved","setupExpiresAt":"2026-11-12T00:00:00.000Z","nodeId":null,"createdAt":"2026-10-29T00:00:00.000Z"},
         "setupUrl":"https://api.example.org/listeners/setup/abc","emailed":false}
        """#)
        let a = try await client().approveListener("s1")
        #expect(a.setupUrl.hasSuffix("/abc") && !a.emailed)
        var req = try #require(StubProtocol.seen.last)
        #expect(req.httpMethod == "POST" && req.url?.path == "/admin/listener-signups/s1/approve")

        StubProtocol.answer = (200, #"{"enabled":true,"email":true,"thisWeek":null,"lastWeek":null,"history":[]}"#)
        #expect(try await client().updateStationReport(email: true).email)
        req = try #require(StubProtocol.seen.last)
        #expect(req.httpMethod == "PATCH" && req.url?.path == "/admin/station-report")
        #expect(String(decoding: try #require(req.httpBody), as: UTF8.self) == #"{"email":true}"#)
    }
}

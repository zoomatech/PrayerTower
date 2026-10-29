import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

@Suite struct EventRuleTests {
    @Test func onlyStaffScheduleCirclesAndHostingNeedsALinkOrAPlace() {
        #expect(!Events.kinds(roles: ["member"]).contains("circle"))
        #expect(Events.kinds(roles: ["moderator"]).contains("circle"))
        #expect(!Events.canHost(title: "Walk", videoUrl: " ", location: ""))
        #expect(Events.canHost(title: "Walk", videoUrl: "", location: "Park"))
    }

    @Test func newEventsTrimAndDefaultToAnHour() throws {
        let e = NewEvent(kind: "meetup", title: " Walk ", description: "  ", startsAt: try Date("2026-11-04T19:00:00Z", strategy: .iso8601), minutes: "x", videoUrl: "", location: " Park ", groupId: nil)
        #expect(e.title == "Walk")
        #expect(e.description == nil)
        #expect(e.durationMinutes == 60)
        #expect(e.location == "Park")
        #expect(e.startsAt == "2026-11-04T19:00:00.000Z")
    }

    @Test func eventAndCareWordsHaveNoReligiousWordsInOpenCircle() {
        let w = Words(.neutral)
        for k in Events.staffKinds { #expect(!w("enums.eventKind.\(k)").lowercased().contains("pray"), "\(k)") }
        for k in ["pray_with_me", "pastor"] { #expect(!w("enums.careKind.\(k)").lowercased().contains("pray"), "\(k)") }
        for key in ["events.intro", "events.titlePlaceholder", "care.intro", "care.title", "care.ask", "care.sent"] {
            #expect(!w(key).lowercased().contains("pray"), "\(key)")
        }
    }
}

extension APIClientTests {
    @Test func readsAnEventAndAsksForCare() async throws {
        StubProtocol.answer = (200, """
        {"event":{"id":"e1","kind":"meetup","title":"Walk","description":"","startsAt":"2026-11-04T19:00:00.000Z","durationMinutes":60,
          "videoUrl":null,"hasVideo":true,"location":null,"groupId":null,"groupTitle":null,"host":{"id":"u1","name":"Ethel","pastor":null},
          "isHost":false,"going":3,"myRsvp":null,"cancelled":false,"live":false}}
        """)
        let e = try await client().rsvp("e1", status: "going")
        #expect(e.hasVideo && e.videoUrl == nil)
        #expect(StubProtocol.seen.last?.httpMethod == "PUT")

        StubProtocol.answer = (201, #"{"id":"c1","crisis":true}"#)
        #expect(try await client().askForCare(kind: "pray_with_me", body: " I can't cope "))
    }
}

import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

@Suite struct CommitmentRuleTests {
    @Test func daysAreBlankForNoEndAndCappedAtAYear() {
        #expect(Commitments.days("") == nil)
        #expect(Commitments.days("0") == nil)
        #expect(Commitments.days(" 30 ") == 30)
        #expect(Commitments.days("900") == 365)
    }

    @Test func frequenciesHaveWordsInBothWordings() {
        for f in Commitments.frequencies {
            #expect(Words(.faith)("enums.frequency.\(f)") != "enums.frequency.\(f)")
            #expect(Words(.neutral)("enums.frequency.\(f)") != "enums.frequency.\(f)")
        }
    }

    @Test func openCirclePromisesHaveNoReligiousWords() {
        let w = Words(.neutral)
        for key in ["tabs.promises", "promises.empty", "promises.week", "actions.commitTitle", "actions.commitDone", "actions.promiseYou", "feed.prayed"] {
            let text = w(key).lowercased()
            #expect(!text.contains("pray") && !text.contains("god"), "\(key): \(text)")
        }
    }
}

extension APIClientTests {
    @Test func readsMyPromisesAndSendsOnlyTheChangedFields() async throws {
        StubProtocol.answer = (200, """
        {"commitments":[{"id":"c1","post_id":"p1","frequency":"daily","vow_text":"I will pray for Ethel.","status":"active",
          "next_reminder_at":"2026-10-30T09:00:00Z","committed_count":7,"completed_count":2,"ends_at":null,"post_excerpt":"Please pray for my knee"}],
         "note":"This data helps us measure whether we are helping. WE DO NOT JUDGE."}
        """)
        let list = try await client().commitments()
        #expect(list.commitments.first?.postExcerpt == "Please pray for my knee")
        #expect(list.commitments.first?.isActive == true)

        StubProtocol.answer = (200, #"{"commitment":{"id":"c1","post_id":"p1","frequency":"daily","vow_text":"x","status":"completed","next_reminder_at":null,"committed_count":7,"completed_count":2,"ends_at":null}}"#)
        _ = try await client().editCommitment("c1", CommitmentEdit(status: "completed"))
        let r = try #require(StubProtocol.seen.last)
        #expect(r.httpMethod == "PATCH")
        #expect(String(decoding: try #require(r.httpBody), as: UTF8.self) == #"{"status":"completed"}"#)
    }

    @Test func makesACommitmentWithATrimmedPromise() async throws {
        StubProtocol.answer = (201, #"{"commitment":{"id":"c2","post_id":"p1","frequency":"weekly","vow_text":"Hi","status":"active","next_reminder_at":null,"committed_count":4,"completed_count":0,"ends_at":"2026-11-28T00:00:00Z"}}"#)
        let c = try await client().commit(postId: "p1", NewCommitment(frequency: "weekly", vowText: "  Hi \n", durationDays: Commitments.days("28")))
        #expect(c.endsAt != nil)
        let body = try JSONSerialization.jsonObject(with: try #require(StubProtocol.seen.last?.httpBody)) as? [String: Any]
        #expect(body?["vowText"] as? String == "Hi")
        #expect(body?["durationDays"] as? Int == 28)
    }
}

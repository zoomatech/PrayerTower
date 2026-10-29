import Foundation
import Testing
@testable import PrayerTowerKit

private let state = ##"{"enabled":true,"volunteer":false,"canAsk":false,"matches":[{"id":"m1","role":"newcomer","other":{"id":"u2","displayName":"Ruth"},"endsAt":"2026-11-12T00:00:00.000Z","checkInDue":true}]}"##

@Suite struct EncouragerTests {
    @Test func namesEachSideOfAMatch() throws {
        let s = try JSONDecoder().decode(EncouragerState.self, from: Data(state.utf8))
        let m = s.matches[0]
        #expect(m.isNewcomer && m.checkInDue == true)
        let l = m.lines(Words(.faith), endDate: "November 12")
        #expect(l.title.contains("Ruth") && l.hint.contains("November 12"))
        #expect(encouragerDay(m.endsAt, locale: Locale(identifier: "en_US")).contains("November"))
        let off = try JSONDecoder().decode(EncouragerState.self, from: Data(##"{"enabled":false}"##.utf8))
        #expect(!off.enabled && off.matches.isEmpty)
    }
}

extension APIClientTests {
    @Test func volunteersOnlyAfterAgreeingAndChecksIn() async throws {
        StubProtocol.answer = (200, state)
        _ = try await client().setVolunteer(true)
        var body = try JSONSerialization.jsonObject(with: StubProtocol.seen.last!.httpBody!) as! [String: Any]
        #expect(body["on"] as? Bool == true && body["agree"] as? Bool == true)
        _ = try await client().setVolunteer(false)
        body = try JSONSerialization.jsonObject(with: StubProtocol.seen.last!.httpBody!) as! [String: Any]
        #expect(body["agree"] == nil)
        _ = try await client().encouragerCheckIn("m1", .change)
        body = try JSONSerialization.jsonObject(with: StubProtocol.seen.last!.httpBody!) as! [String: Any]
        #expect(body["answer"] as? String == "change" && StubProtocol.seen.last?.url?.path.hasSuffix("/matches/m1/check-in") == true)
        _ = try await client().endEncouragerMatch("m1")
        #expect(StubProtocol.seen.last?.httpMethod == "DELETE")
    }
}

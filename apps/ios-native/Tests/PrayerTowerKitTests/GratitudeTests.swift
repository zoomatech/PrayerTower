import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct GratitudeTests {
    @Test func fillsThreeBoxesAndSharesOnlyWhatWasWritten() throws {
        let g = try JSONDecoder().decode(Gratitude.self, from: Data(##"{"enabled":true,"weekday":null,"weekStart":"2026-10-26","items":["Sun on the porch"],"weeks":4}"##.utf8))
        #expect(g.boxes == ["Sun on the porch", "", ""])
        #expect(Gratitude.filled([" a ", "", "b"]) == ["a", "b"])
        let post = Gratitude.praise(["Sun", "  ", "Tea"])
        #expect(post.postType == "praise" && post.body == "Sun\nTea")
        let off = try JSONDecoder().decode(Gratitude.self, from: Data(##"{"enabled":false}"##.utf8))
        #expect(!off.enabled && off.boxes == ["", "", ""])
    }
}

extension APIClientTests {
    @Test func savesGoodThingsAndTurnsTheReminderOff() async throws {
        StubProtocol.answer = (200, ##"{"enabled":true,"weekday":null,"weekStart":"2026-10-26","items":["Tea"]}"##)
        _ = try await client().saveGratitude(["Tea"], timeZone: "UTC")
        var body = try JSONSerialization.jsonObject(with: StubProtocol.seen.last!.httpBody!) as! [String: Any]
        #expect(body["items"] as? [String] == ["Tea"] && StubProtocol.seen.last?.url?.path.hasSuffix("/me/gratitude") == true)
        _ = try await client().setGratitudeDay(nil, timeZone: "UTC")
        body = try JSONSerialization.jsonObject(with: StubProtocol.seen.last!.httpBody!) as! [String: Any]
        #expect(body["weekday"] is NSNull && StubProtocol.seen.last?.httpMethod == "PUT")
    }
}

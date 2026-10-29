import Foundation
import Testing
@testable import PrayerTowerKit

extension APIClientTests {
    @Test func answersAFollowupWithOrWithoutWords() async throws {
        StubProtocol.answer = (200, ##"{"answer":"private","crisis":false}"##)
        _ = try await client().answerFollowup(postId: "p1", .private, body: "   ")
        var body = try JSONSerialization.jsonObject(with: StubProtocol.seen.last!.httpBody!) as! [String: Any]
        #expect(body["answer"] as? String == "private" && body["body"] == nil)
        StubProtocol.answer = (200, ##"{"answer":"grateful","crisis":false}"##)
        let r = try await client().answerFollowup(postId: "p1", .grateful, body: " Surgery went well ")
        body = try JSONSerialization.jsonObject(with: StubProtocol.seen.last!.httpBody!) as! [String: Any]
        #expect(body["body"] as? String == "Surgery went well" && r.answer == .grateful)
        #expect(FollowupAnswer.private.doneKey == "practices.followupQuiet")
        #expect(FollowupAnswer.sharing.allSatisfy { Words(.neutral)($0.wordKey) != $0.wordKey })
    }
}

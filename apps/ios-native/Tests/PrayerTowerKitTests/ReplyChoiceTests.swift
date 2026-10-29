import Foundation
import Testing
@testable import PrayerTowerKit

extension APIClientTests {
    @Test func hidesTheBoxOnlyWhenTheAuthorChoseSo() async throws {
        StubProtocol.answer = (200, ##"{"enabled":true,"audience":"none","canComment":false,"isMine":false}"##)
        let s = try await client().replyChoice(postId: "p1")
        #expect(!ReplyChoiceState.showsComposer(s) && s.noteKey == "replyChoice.noneNote")
        #expect(ReplyChoiceState.showsComposer(nil))
        _ = try await client().setReplyChoice(postId: "p1", .supporters)
        let body = try JSONSerialization.jsonObject(with: StubProtocol.seen.last!.httpBody!) as! [String: Any]
        #expect(body["audience"] as? String == "supporters" && StubProtocol.seen.last?.httpMethod == "PUT")
        #expect(!Words(.neutral)("replyChoice.noneNote").lowercased().contains("pray"))
    }
}

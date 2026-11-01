import Foundation
import Testing
@testable import PrayerTowerKit

extension APIClientTests {
    @Test func answersAPrayerResolutionCheckIn() async throws {
        StubProtocol.answer = (200, ##"{"enabled":true,"pending":false,"answered":true,"outcome":"his_will","canRepost":false,"freeTokens":0,"tokenClaimed":false,"repostedPostId":null}"##)
        let s = try await client().answerResolution(postId: "p1", outcome: .hisWill)
        var body = try JSONSerialization.jsonObject(with: StubProtocol.seen.last!.httpBody!) as! [String: Any]
        #expect(body["answered"] as? Bool == true && body["outcome"] as? String == "his_will")
        #expect(s.outcome == .hisWill && !s.showsCard)

        StubProtocol.answer = (200, ##"{"enabled":true,"pending":false,"answered":false,"outcome":null,"canRepost":true,"freeTokens":1,"tokenClaimed":false,"repostedPostId":null}"##)
        let notYet = try await client().answerResolution(postId: "p1", outcome: nil)
        body = try JSONSerialization.jsonObject(with: StubProtocol.seen.last!.httpBody!) as! [String: Any]
        #expect(body["answered"] as? Bool == false && body["outcome"] == nil)
        #expect(notYet.offersRepost && notYet.offersToken && notYet.showsCard)
    }

    @Test func prayerResolutionWordsExistInBothWordings() {
        for o in ResolutionOutcome.allCases {
            #expect(Words(.faith)(o.wordKey) != o.wordKey)
            #expect(Words(.neutral)(o.wordKey) != o.wordKey)
        }
        #expect(Words(.faith)("resolution.hoped") == "The Lord answered my prayer in a way I had hoped")
        #expect(Words(.faith)("resolution.hisWill") == "The Lord answered my prayer according to his will, not my will")
    }
}

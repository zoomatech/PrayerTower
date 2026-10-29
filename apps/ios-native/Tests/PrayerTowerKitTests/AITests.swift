import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct AITests {
    @Test func circleSummary() {
        #expect(Circles.summary(in: "Thank you.\nSummary: I was hurt at group.\n\nShall we go on?") == "I was hurt at group.")
        #expect(Circles.summary(in: "Summary: all of it") == "all of it")
        #expect(Circles.summary(in: "No summary yet") == nil)
    }

    @Test func practiceTransactionMatchesTheServer() throws {
        let id = try #require(UUID(uuidString: "6F9619FF-8B86-4011-B42D-00C04FC964FF"))
        let signed = TokenStore.practiceTransaction(productId: "tokens.10", userId: "11111111-1111-4111-8111-111111111111", transactionId: id)
        #expect(signed.hasPrefix("practice."))
        var b64 = String(signed.dropFirst("practice.".count)).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        let json = try #require(Data(base64Encoded: b64))
        let obj = try #require(try JSONSerialization.jsonObject(with: json) as? [String: String])
        #expect(obj["productId"] == "tokens.10")
        #expect(obj["transactionId"] == "6f9619ff-8b86-4011-b42d-00c04fc964ff")
        #expect(!signed.contains("="))
    }

    @Test func crosspostDefaultType() throws {
        let s = try JSONDecoder().decode(CrosspostStatus.self, from: Data(#"{"enabled":true,"postType":null,"postTypes":["prayer_request","testimony","praise"],"paused":false}"#.utf8))
        #expect(s.chosenType == "testimony")
    }
}

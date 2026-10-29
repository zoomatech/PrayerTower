import Foundation
import Testing
@testable import PrayerTowerKit

extension APIClientTests {
    @Test func offersPostAgainOnlyWhenTheModeratorAllowedIt() async throws {
        StubProtocol.answer = (200, ##"{"notifications":[{"id":"n1","kind":"moderation_notice","title":"Removed","body":"…","data":{"itemId":"i1","pathBack":true},"read_at":null,"created_at":"2026-10-29T08:00:00Z"},{"id":"n2","kind":"moderation_notice","title":"Removed","body":"…","data":{"itemId":"i2"},"read_at":"2026-10-29T09:00:00Z","created_at":"2026-10-29T08:00:00Z"},{"id":"n3","kind":"prayed","title":"Someone prayed","body":"","data":{"postId":"p1"},"read_at":null,"created_at":"2026-10-29T08:00:00Z"}]}"##)
        let n = try await client().notices()
        #expect(n.map(\.postAgainItem) == ["i1", nil, nil])
        #expect(n[2].postId == "p1" && n[0].readAt == nil)

        StubProtocol.answer = (200, ##"{"target":"post","body":"Pray for my exam","postType":"praise"}"##)
        let words = try await client().removedWords("i1")
        #expect(words.newPost?.body == "Pray for my exam" && words.newPost?.postType == "praise")
        StubProtocol.answer = (200, ##"{"target":"comment","body":"Hang in there","postId":"p9"}"##)
        let c = try await client().removedWords("i2")
        #expect(c.newPost == nil && c.postId == "p9")
    }
}

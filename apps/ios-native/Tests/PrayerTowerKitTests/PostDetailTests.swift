import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

private func comment(_ id: String, _ parent: String?, _ at: String) -> PrayerTowerKit.Comment {
    PrayerTowerKit.Comment(id: id, parentId: parent, body: id, isUpdate: false, createdAt: at, isMine: nil, author: Identity(id: nil, displayName: "A", handle: nil, anonymous: true))
}

@Suite struct CommentThreadTests {
    @Test func putsRepliesUnderTheirParentAndStopsIndentingAtTheThirdLevel() {
        let list = [
            comment("b", nil, "2026-10-29T02:00:00Z"),
            comment("a", nil, "2026-10-29T01:00:00Z"),
            comment("a1", "a", "2026-10-29T03:00:00Z"),
            comment("a1x", "a1", "2026-10-29T04:00:00Z"),
            comment("a1xy", "a1x", "2026-10-29T05:00:00Z"),
            comment("orphan", "gone", "2026-10-29T06:00:00Z"),
        ]
        let t = CommentThread.ordered(list)
        #expect(t.map(\.id) == ["a", "a1", "a1x", "a1xy", "b", "orphan"])
        #expect(t.map(\.depth) == [0, 1, 2, 2, 0, 0])
    }
}

extension APIClientTests {
    @Test func sendsAReplyAndMarksAnsweredWithoutAnEmptyTestimony() async throws {
        StubProtocol.answer = (201, #"{"comment":{"id":"c1","crisis":false,"harm":null},"coolDown":true}"#)
        let added = try await client().addComment(postId: "p1", NewComment(body: "  So glad he got home safe! ", parentId: "c0"))
        #expect(added.comment.id == "c1")
        #expect(added.coolDown == true)
        let body = try #require(StubProtocol.seen.last?.httpBody)
        #expect(try JSONDecoder().decode([String: String].self, from: body) == ["body": "So glad he got home safe!", "parentId": "c0"])

        StubProtocol.answer = (200, """
        {"post":{"id":"p1","author":{"id":"u1","displayName":"Ethel","handle":null,"anonymous":false},"isMine":true,"postType":"prayer_request",
          "urgency":0,"preview":"x","body":"x","crisis":false,"counts":{"prayingNow":0,"prayers":3,"commitments":0,"comments":1},
          "createdAt":"2026-10-29T08:00:00Z","state":"answered","answeredAt":"2026-10-29T09:00:00Z","testimony":null,
          "media":[{"kind":"image","storagePath":"u1/a.jpg","url":"https://s.example.test/a.jpg"}]},"crisis":false}
        """)
        let card = try await client().markAnswered(postId: "p1", testimony: "   ")
        #expect(card.state == "answered")
        #expect(card.media?.first?.url == "https://s.example.test/a.jpg")
        let sent = try #require(StubProtocol.seen.last?.httpBody)
        #expect(String(decoding: sent, as: UTF8.self) == "{}")
    }

    @Test func readsWhoPrayed() async throws {
        StubProtocol.answer = (200, #"{"count":3,"people":[{"id":"u2","displayName":"Carol","lastPrayedAt":"2026-10-29T08:00:00Z"},{"id":null,"displayName":"Anonymous","lastPrayedAt":"2026-10-29T08:00:00Z"}]}"#)
        let p = try await client().prayers(postId: "p1")
        #expect(p.count == 3)
        #expect(p.people.map(\.displayName) == ["Carol", "Anonymous"])
    }
}

@Suite struct ZeroWordsTests {
    @Test func usesTheZeroFormWhenThereIsOne() {
        let w = Words(.faith)
        #expect(w("post.prayed", count: 0) == "No one has prayed yet")
        #expect(w("post.prayed", count: 1) == "1 person has prayed")
        #expect(w("post.prayed", count: 4) == "4 people have prayed")
        #expect(!Words(.neutral)("post.prayed", count: 4).lowercased().contains("pray"))
    }
}

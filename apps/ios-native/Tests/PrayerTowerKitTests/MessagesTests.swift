import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

@Suite struct MessagesRuleTests {
    @Test func communityFeaturesAreOnUnlessHidden() {
        #expect(Community(slug: "a", name: "A", wording: "faith").shows("groups"))
        #expect(!Community(slug: "a", name: "A", wording: "faith", hiddenFeatures: ["groups"]).shows("groups"))
    }

    @Test func openCircleMessagesHaveNoReligiousWords() {
        let w = Words(.neutral)
        for key in ["messages.empty", "messages.kinds.prayer", "messages.privacy", "groups.intro", "conversation.about", "conversation.invited"] {
            let text = w(key).lowercased()
            #expect(!text.contains("pray") && !text.contains("god"), "\(key): \(text)")
        }
    }

    @Test func groupNamesAndTopicsAreTrimmed() {
        let g = NewGroup(title: "  Walkers ", topic: "  ", isPublic: true)
        #expect(g.title == "Walkers")
        #expect(g.topic == nil)
    }
}

extension APIClientTests {
    @Test func readsAConversationAndKnowsWhenWritingWaits() async throws {
        StubProtocol.answer = (200, """
        {"conversation":{"id":"c1","kind":"prayer","title":"Ethel","topic":null,"isPublic":false,"isRequest":false,"isOwner":true,
          "awaitingReply":true,"post":{"id":"p1","excerpt":"My knee"},"members":[{"id":"u2","name":"Ethel","invited":false,"isOwner":false}]},
         "messages":[{"id":"m1","mine":true,"author":"Me","body":"Praying for you","crisis":false,"createdAt":"2026-10-29T08:00:00Z"}]}
        """)
        let v = try await client().conversation("c1")
        #expect(v.conversation.other?.id == "u2")
        #expect(!v.conversation.canWrite)
        #expect(!v.conversation.canInvite)
        #expect(v.messages.first?.mine == true)
    }

    @Test func splitsRequestsFromTheRestAndCreatesAGroup() async throws {
        StubProtocol.answer = (200, """
        {"conversations":[
          {"id":"a","kind":"direct","postId":null,"title":"Sam","topic":null,"isPublic":false,"isRequest":false,"isOwner":false,"memberCount":2,"lastMessage":"hi","lastMessageAt":null,"unread":1},
          {"id":"b","kind":"group","postId":null,"title":"Walkers","topic":"7am","isPublic":true,"isRequest":true,"isOwner":false,"memberCount":5,"lastMessage":null,"lastMessageAt":null,"unread":0}]}
        """)
        let (requests, rest) = Messages.split(try await client().conversations())
        #expect(requests.map(\.id) == ["b"])
        #expect(rest.map(\.id) == ["a"])

        StubProtocol.answer = (201, #"{"conversationId":"g1","invited":0}"#)
        #expect(try await client().createGroup(NewGroup(title: "Walkers", topic: nil, isPublic: false)) == "g1")
        let body = try JSONSerialization.jsonObject(with: try #require(StubProtocol.seen.last?.httpBody)) as? [String: Any]
        #expect(body?["isPublic"] as? Bool == false)
        #expect((body?["memberIds"] as? [String])?.isEmpty == true)
    }
}

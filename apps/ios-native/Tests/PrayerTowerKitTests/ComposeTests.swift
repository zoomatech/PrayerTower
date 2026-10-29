import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

@Suite struct ComposeRuleTests {
    @Test func offersOnlyTheCommunitysKindsOfPost() {
        #expect(Compose.types(for: nil) == ["prayer_request", "praise", "open_prayer", "testimony", "confessional"])
        let oc = Community(slug: "open-circle", name: "Open Circle", wording: "neutral", enabledPostTypes: ["prayer_request", "praise", "discussion"])
        #expect(Compose.types(for: oc) == ["prayer_request", "praise", "discussion"])
    }

    @Test func countsWordsAndLeavesOutLongVideos() {
        #expect(Compose.wordCount("  one two\nthree  ") == 3)
        #expect(Compose.wordCount("   ") == 0)
        #expect(Compose.videoFits(seconds: 7.4, cap: 7))
        #expect(!Compose.videoFits(seconds: 8, cap: 7))
        #expect(Compose.videoFits(seconds: nil, cap: 7))
        #expect(Compose.contentType("image/heic", video: false) == "image/heic")
        #expect(Compose.contentType("image/gif", video: false) == "image/jpeg")
        #expect(Compose.contentType(nil, video: true) == "video/mp4")
    }
}

@Suite struct WordsTests {
    @Test func usesTheExpoAppsWordsAndOpenCirclesWhereTheyDiffer() {
        let faith = Words(.faith)
        let neutral = Words(.neutral)
        #expect(faith("compose.placeholder") == "Type your prayer here")
        #expect(neutral("compose.placeholder") == "What's on your mind?")
        #expect(faith("compose.greeting", ["name": "Ethel"]) == "Welcome, Ethel! Let's talk to the Lord.")
        #expect(neutral("enums.postType.prayer_request") == "Request")
        #expect(faith("enums.postType.prayer_request") == "Prayer Request")
        #expect(neutral.server("Prayer Warrior") == "Kindness Champion")
        #expect(faith.server("Prayer Warrior") == "Prayer Warrior")
        #expect(faith("no.such.key") == "no.such.key")
    }

    @Test func choosesOneOrOtherByCount() {
        let w = Words(.faith)
        #expect(w("backupCodes.remaining", count: 7) == "7 unused backup codes. Each works once.")
    }

    @Test func openCircleComposeHasNoReligiousWords() {
        let w = Words(.neutral)
        let religious = /(?i)\b(pray\w*|god|lord|church\w*|bible|scripture|prais\w*|testimon\w*)\b/
        let keys = ["compose.placeholder", "compose.bodyLabel", "compose.kind", "compose.realm", "compose.post", "compose.addMedia"]
            + Compose.postTypes.filter { !Compose.discussionTypes.contains($0) && $0 != "confessional" }.map { "enums.postType.\($0)" }
            + Compose.kinds.map { "enums.prayerKind.\($0)" } + Compose.realms.map { "enums.prayerRealm.\($0)" }
        for k in keys { #expect(w(k).firstMatch(of: religious) == nil, "\(k): \(w(k))") }
    }
}

extension APIClientTests {
    @Test func readsNumberSettingsWithTheSwitches() async throws {
        StubProtocol.answer = (200, #"{"features":{"lament":true,"videoMaxSeconds":15,"name":"x"}}"#)
        let f = try await client().features()
        #expect(f["lament"])
        #expect(f.number("videoMaxSeconds") == 15)
        #expect(f.number("lament") == nil)
    }

    @Test func postsARequestWithoutABackgroundWhenItHasPhotos() async throws {
        StubProtocol.answer = (201, """
        {"post":{"id":"p9","author":{"id":"u1","displayName":"Ethel","handle":null,"anonymous":false},"isMine":true,"postType":"prayer_request",
          "urgency":2,"preview":"Surgery","body":"Surgery Tuesday","crisis":false,"counts":{"prayingNow":0,"prayers":0,"commitments":0,"comments":0},
          "createdAt":"2026-10-29T08:00:00Z"},"harm":null}
        """)
        var p = NewPost()
        p.body = "  Surgery Tuesday \n"
        p.urgency = 2
        p.background = "sky"
        p.media = [MediaRef(kind: "image", storagePath: "u1/a.jpg")]
        let created = try await client().createPost(p)
        #expect(created.post.id == "p9")
        let sent = try #require(StubProtocol.seen.last?.httpBody)
        let json = try #require(try JSONSerialization.jsonObject(with: sent) as? [String: Any])
        #expect(json["body"] as? String == "Surgery Tuesday")
        #expect(json["background"] == nil)
        #expect((json["media"] as? [[String: Any]])?.first?["storagePath"] as? String == "u1/a.jpg")
    }

    @Test func uploadsToTheSignedURLThenReturnsThePath() async throws {
        StubProtocol.answer = (200, #"{"path":"u1/abc.mp4","token":"t","signedUrl":"https://storage.example.test/object/upload/sign/post-media/u1/abc.mp4?token=t"}"#)
        let ref = try await client().uploadMedia(Data([1, 2, 3]), contentType: "video/mp4", video: true, durationMs: 6000)
        #expect(ref == MediaRef(kind: "video", storagePath: "u1/abc.mp4", durationMs: 6000))
        let put = try #require(StubProtocol.seen.last)
        #expect(put.httpMethod == "PUT")
        #expect(put.url?.host == "storage.example.test")
        #expect(put.value(forHTTPHeaderField: "Content-Type") == "video/mp4")
    }
}

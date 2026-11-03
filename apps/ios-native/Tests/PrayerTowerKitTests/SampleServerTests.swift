import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import Testing
@testable import PrayerTowerKit

/// The UI walks' sample data must decode into the same models the screens use.
@Suite struct SampleServerTests {
    let api = APIClient(baseURL: SampleServer.baseURL, session: SampleServer.session()) { nil }

    @Test func mainScreensDecode() async throws {
        let me = try await api.me()
        #expect(me.profile.onboardedAt != nil)
        _ = try await api.features()
        let feed = try await api.feed()
        #expect(feed.posts.count == 2)
        #expect(try await api.post("sample-p1").author.displayName == "Ruth")
        #expect(try await api.comments(postId: "sample-p1").count == 9)
        #expect(try await api.prayers(postId: "sample-p1").count == 4)
        #expect(try await api.commitments().commitments.count == 1)
        #expect(try await api.conversations().count == 1)
        #expect(try await api.notifications().count == 1)
        #expect(try await api.topicGroups().first?.name == "Cancer survivors")
        #expect(try await api.topicGroup("sample-g1").posts.first?.comments.count == 1)
        // My Promises and Me load these too; a missing one shows an error in the store screenshots.
        #expect(try await api.weeklyReview().kept == 2)
        #expect(try await api.tier().prayers == 42)
        #expect(try await api.tokens().balance == 12)
    }

    @Test func meCountsAndCirclesDecode() async throws {
        #expect(try await !api.features()["prayerCircles"])
        #expect(try await api.tier().prayers == 42)
        #expect(try await api.tokens().balance == 12)
        #expect(try await api.prayerStats().week.count == 7)
        #expect(try await api.weeklyReview().people == 3)
        #expect(try await api.myCircles().circles.count == 2)
        #expect(try await api.feedThemes().themes.isEmpty)
    }

    /// The performance tests' feed: -PTSamplePosts 1000 pages through 1,000 different posts.
    @Test func theLongFeedPagesThroughAThousandPosts() throws {
        var page: Int? = 0, ids: [String] = []
        while let p = page {
            let f = try JSONDecoder().decode(FeedPage.self, from: SampleServer.answer(method: "GET", path: "/feed", query: ["page": String(p)], posts: 1000).body)
            ids += f.posts.map(\.id)
            page = f.nextPage
        }
        #expect(ids.count == 1000 && Set(ids).count == 1000 && ids.last == "sample-g999")
        let one = try JSONDecoder().decode([String: Card].self, from: SampleServer.answer(method: "GET", path: "/posts/sample-g2", posts: 1000).body)
        #expect((one["post"]?.body.count ?? 0) > 100)
        #expect(SampleServer.posts(["app", "-PTSampleData", "-PTSamplePosts", "1000"]) == 1000)
        #expect(SampleServer.posts(["app", "-PTSampleData"]) == nil)
    }

    /// A new post is the top post on the member's own feed and own page (Steve, 2026-11-02).
    @Test func aNewPostIsTheTopPostOnTheFeedAndTheMembersPage() throws {
        let sent = try JSONSerialization.data(withJSONObject: ["body": "Thank you, Lord, for this morning.", "postType": "praise"])
        // Its own store, so the other tests running beside it still see the plain sample feed.
        let kept = Locked<[String]>([])
        let made = try JSONDecoder().decode(CreatedPost.self, from: SampleServer.answer(method: "POST", path: "/posts", body: sent, kept: kept).body).post
        #expect(made.body == "Thank you, Lord, for this morning." && made.isMine)
        let feed = try JSONDecoder().decode(FeedPage.self, from: SampleServer.answer(method: "GET", path: "/feed", kept: kept).body)
        #expect(feed.posts.first?.id == made.id)
        let long = try JSONDecoder().decode(FeedPage.self, from: SampleServer.answer(method: "GET", path: "/feed", query: ["page": "0"], posts: 100, kept: kept).body)
        #expect(long.posts.first?.id == made.id)
        let page = try JSONDecoder().decode(PersonPage.self, from: SampleServer.answer(method: "GET", path: "/people/\(SampleServer.memberId)", kept: kept).body)
        #expect(page.posts.first?.id == made.id)
    }

    /// PrayerCast (Steve, 2026-11-02): public joins the feed; private is kept nowhere.
    @Test func aPublicPrayerCastJoinsTheFeedAndAPrivateOneIsKeptNowhere() throws {
        let kept = Locked<[String]>([])
        let enc = JSONEncoder()
        var p = NewPost(); p.body = "Lord, carry my friend through tonight."
        let pub = try JSONDecoder().decode(PrayerCastSent.self, from: SampleServer.answer(method: "POST", path: "/prayercast", body: try enc.encode(CastBody(post: p, visibility: .public, idempotencyKey: "a")), kept: kept).body)
        #expect(pub.post?.body == p.body)
        let priv = try JSONDecoder().decode(PrayerCastSent.self, from: SampleServer.answer(method: "POST", path: "/prayercast", body: try enc.encode(CastBody(post: p, visibility: .private, idempotencyKey: "b")), kept: kept).body)
        #expect(priv.post == nil)
        #expect(kept.withLock { $0.count } == 1)
        let json = try JSONSerialization.jsonObject(with: try enc.encode(CastBody(post: p, visibility: .private, idempotencyKey: "c"))) as? [String: Any]
        #expect(json?["visibility"] as? String == "private" && json?["body"] as? String == p.body)
    }

    @Test func unknownReadsAreNotFoundAndWritesSucceed() {
        #expect(SampleServer.answer(method: "GET", path: "/nowhere").status == 404)
        #expect(SampleServer.answer(method: "POST", path: "/posts/sample-p1/praying-now").status == 200)
        #expect(SampleServer.isOn(["app", "-PTSampleData"]))
        #expect(!SampleServer.isOn(["app"]))
        #expect(SampleServer.screen(["app", "-PTSampleData", "-PTScreen", "notices"]) == "notices")
        #expect(SampleServer.screen(["app", "-PTScreen", "notices"]) == nil)
        #expect(SampleServer.skin(["app", "-PTSampleData", "-PTSkin", "golden-wood"]) == "golden-wood")
        #expect(SampleServer.skin(["app", "-PTSkin", "golden-wood"]) == nil)
        #expect(SampleServer.tab(for: "post") == (0, true))
        #expect(SampleServer.tab(for: "me").tab == 4)
    }

    @Test func openCircleSampleNeverSaysPray() {
        // Field names and codes ("prayers":, "praying_now") are not words people read.
        let shown = SampleServer.routes(.openCircle).map(\.body).joined()
            .replacingOccurrences(of: #""\w*[Pp]ray\w*"\s*:"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #""(praying_now|prayer_request|prayed_for)""#, with: "", options: .regularExpression)
        #expect(shown.range(of: "pray", options: .caseInsensitive) == nil)
        #expect(SampleServer.routes(.prayerTower).map(\.body).joined().contains("Thank you for praying!"))
    }
}

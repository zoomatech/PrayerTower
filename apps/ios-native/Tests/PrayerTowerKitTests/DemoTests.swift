import Foundation
import Testing
@testable import PrayerTowerKit

/// The sample data the snapshot and performance tests run on: every screen's reads decode with
/// the real models, and the feed pages through all its posts.
@Suite(.serialized) struct DemoTests {
    @Test func everyMainScreenReadDecodes() async throws {
        let api = Demo.client()
        let me = try await api.me()
        #expect(me.profile.displayName == "Ruth" && me.profile.onboardedAt != nil)
        #expect(try await api.features()["prayerCircles"])
        let post = try await api.post("demo-2")
        #expect(post.body.count > 100)
        #expect(try await api.comments(postId: "demo-2").count == 3)
        #expect(try await api.prayers(postId: "demo-2").count == 3)
        #expect(try await api.tier().prayers == 42)
        #expect(try await api.tokens().balance == 12)
        #expect(try await api.prayerStats().week.count == 7)
        #expect(try await api.notifications().count == 3)
        #expect(try await api.conversations().count == 3)
        #expect(try await api.commitments().commitments.count == 2)
        #expect(try await api.weeklyReview().people == 6)
        #expect(try await api.myCircles().circles.count == 2)
        #expect(try await api.feedThemes().themes.isEmpty)
    }

    @Test func theFeedPagesThroughAThousandPosts() async throws {
        let api = Demo.client(posts: 1000)
        var page: Int? = 0, ids: [String] = []
        while let p = page {
            let f = try await api.feed(page: p)
            ids += f.posts.map(\.id)
            page = f.nextPage
        }
        #expect(ids.count == 1000 && Set(ids).count == 1000)
        #expect(ids.first == "demo-0" && ids.last == "demo-999")
    }

    @Test func readsTheLaunchArguments() {
        #expect(Demo.posts(fromArguments: ["app"]) == nil)
        #expect(Demo.posts(fromArguments: ["app", "-PTDemo"]) == 24)
        #expect(Demo.posts(fromArguments: ["app", "-PTDemo", "-PTDemoPosts", "1000"]) == 1000)
    }
}

@Test func photoCacheFileNamesAreSafeAndStable() {
    #expect(PhotoCacheKey.fileName("posts/u1/abc 1.jpg") == "p-posts_u1_abc_1.jpg")
    #expect(PhotoCacheKey.fileName("../../etc") == "p-.._.._etc" && PhotoCacheKey.fileName("..") == "p-..")
    #expect(PhotoCacheKey.fileName(String(repeating: "a", count: 300)).count == 202)
}

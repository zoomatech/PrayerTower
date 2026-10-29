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
        #expect(try await api.comments(postId: "sample-p1").count == 1)
        #expect(try await api.prayers(postId: "sample-p1").count == 4)
        #expect(try await api.commitments().commitments.count == 1)
        #expect(try await api.conversations().count == 1)
        #expect(try await api.notifications().count == 1)
    }

    @Test func meCountsAndCirclesDecode() async throws {
        #expect(try await api.features()["prayerCircles"])
        #expect(try await api.tier().prayers == 42)
        #expect(try await api.tokens().balance == 12)
        #expect(try await api.prayerStats().week.count == 7)
        #expect(try await api.weeklyReview().people == 6)
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

    @Test func unknownReadsAreNotFoundAndWritesSucceed() {
        #expect(SampleServer.answer(method: "GET", path: "/nowhere").status == 404)
        #expect(SampleServer.answer(method: "POST", path: "/posts/sample-p1/praying-now").status == 200)
        #expect(SampleServer.isOn(["app", "-PTSampleData"]))
        #expect(!SampleServer.isOn(["app"]))
    }
}

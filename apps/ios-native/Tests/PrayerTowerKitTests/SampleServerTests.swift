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

    @Test func unknownReadsAreNotFoundAndWritesSucceed() {
        #expect(SampleServer.answer(method: "GET", path: "/nowhere").status == 404)
        #expect(SampleServer.answer(method: "POST", path: "/posts/sample-p1/praying-now").status == 200)
        #expect(SampleServer.isOn(["app", "-PTSampleData"]))
        #expect(!SampleServer.isOn(["app"]))
    }
}

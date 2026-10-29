import PrayerTowerKit
import PrayerTowerSession
import Testing

@Test func theDemoStoreIsSignedInOnSampleData() async throws {
    let store = SessionStore(demoPosts: 5)
    #expect(store.isDemo)
    #expect(await store.current() == .signedIn)
    #expect(try await store.api.feed().posts.count == 5)
}

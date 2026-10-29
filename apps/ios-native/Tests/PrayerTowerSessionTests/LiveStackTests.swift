import Foundation
import PrayerTowerKit
import PrayerTowerSession
import Testing

/// Against a running local stack (supabase start, the API on :3000, npm run seed:demo):
///   PT_SUPABASE_URL=http://127.0.0.1:54321 PT_SUPABASE_KEY=<publishable key> PT_API_URL=http://127.0.0.1:3000 \
///   PT_EMAIL=<demo member> PT_PASSWORD=<password> swift test
/// Skipped when those aren't set (as in CI).
let env = ProcessInfo.processInfo.environment
let live = ["PT_SUPABASE_URL", "PT_SUPABASE_KEY", "PT_API_URL", "PT_EMAIL", "PT_PASSWORD"].allSatisfy { env[$0] != nil }

@Suite(.enabled(if: live, "set PT_* to run against a local stack"))
struct LiveStackTests {
    let store = SessionStore(
        supabaseURL: URL(string: env["PT_SUPABASE_URL"] ?? "http://127.0.0.1:54321")!,
        publishableKey: env["PT_SUPABASE_KEY"] ?? "",
        apiURL: URL(string: env["PT_API_URL"] ?? "http://127.0.0.1:3000")!,
        storage: MemoryStorage()
    )

    @Test func signsInReadsTheFeedAndPrays() async throws {
        #expect(await store.current() == .signedOut)
        let state = try await store.signIn(email: env["PT_EMAIL"]!, password: env["PT_PASSWORD"]!)
        #expect(state == .signedIn)
        let me = try await store.api.me()
        #expect(!me.profile.displayName.isEmpty)
        let feed = try await store.api.feed()
        #expect(!feed.posts.isEmpty)
        let other = try #require(feed.posts.first { !$0.isMine })
        let prayed = try await store.api.prayingNow(postId: other.id)
        #expect(!prayed.integrityText.isEmpty)
        await store.signOut()
        #expect(await store.current() == .signedOut)
    }

    @Test func refusesAWrongPassword() async throws {
        await #expect(throws: (any Error).self) { try await store.signIn(email: env["PT_EMAIL"]!, password: "not-the-password") }
    }
}

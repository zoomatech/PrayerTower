import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

@Suite struct ProfileSettingsTests {
    @Test func firmerRemindersShowOnlyWhileRemindersAreOn() {
        let off = ProfileSettings.switches(for: Profile(id: "u", displayName: "A", promptsEnabled: false)).map(\.field)
        let on = ProfileSettings.switches(for: Profile(id: "u", displayName: "A", promptsEnabled: true)).map(\.field)
        #expect(!off.contains("promptTone"))
        #expect(on.contains("promptTone"))
        #expect(on.count == off.count + 1)
    }

    @Test func statsAreOnUnlessTurnedOffAndToneIsSentAsAWord() throws {
        #expect(ProfileSettings.value("showPrayerStats", in: Profile(id: "u", displayName: "A")))
        #expect(!ProfileSettings.value("showPrayerStats", in: Profile(id: "u", displayName: "A", showPrayerStats: false)))
        let body = try JSONEncoder().encode(ProfileSettings.patch("promptTone", on: true))
        #expect(String(decoding: body, as: UTF8.self) == #"{"promptTone":"firm"}"#)
    }

    @Test func everySwitchHasWordsAndOpenCircleOnesHaveNoReligiousWords() {
        let all = ProfileSettings.switches(for: Profile(id: "u", displayName: "A", promptsEnabled: true))
        for s in all {
            for key in [s.label] + (s.hint.map { [$0] } ?? []) {
                #expect(Words(.faith)(key) != key)
                let n = Words(.neutral)(key).lowercased()
                #expect(!n.contains("pray") && !n.contains("god"), "\(key): \(n)")
            }
        }
        for key in ["profile.prayers", "profile.tier", "profile.tokensNote", "profile.tour", "deleteAccount.intro"] {
            #expect(!Words(.neutral)(key).lowercased().contains("pray"), "\(key)")
        }
    }
}

extension APIClientTests {
    @Test func readsTierAndTokensAndDeletesWithTheTypedWord() async throws {
        StubProtocol.answer = (200, #"{"tier":{"tier":"faithful","label":"Faithful","weeklyAllotment":3},"prayers":12,"next":{"tier":"steadfast","label":"Steadfast","prayersNeeded":8},"upkeep":null}"#)
        let tier = try await client().tier()
        #expect(tier.next?.prayersNeeded == 8)

        StubProtocol.answer = (200, #"{"balance":5,"priestly":{"balance":1,"verifiedPrayers":12,"towardNext":2,"prayersPerToken":10,"radioPrayerCost":1,"amplifyRepeats":null,"amplifyCost":null}}"#)
        #expect(try await client().tokens().priestly.towardNext == 2)

        StubProtocol.answer = (200, #"{"deleted":true}"#)
        _ = try await client().deleteAccount()
        let r = try #require(StubProtocol.seen.last)
        #expect(r.httpMethod == "DELETE")
        #expect(String(decoding: try #require(r.httpBody), as: UTF8.self) == #"{"confirm":"DELETE"}"#)
    }

    @Test func readsTheFullProfile() async throws {
        StubProtocol.answer = (200, #"{"profile":{"id":"u1","display_name":"Ethel","why_here":["pray_for_others"],"trauma_content_opt_out":true,"prompts_enabled":true,"prompt_tone":"firm","show_prayer_stats":false},"roles":["member"],"community":null}"#)
        let me = try await client().me()
        #expect(me.profile.traumaContentOptOut == true)
        #expect(ProfileSettings.value("promptTone", in: me.profile))
    }
}

import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct MemberTests {
    let w = Words(.faith)

    @Test func noticeTargetsMatchTheExpoApp() {
        #expect(AppRoute.target(["postId": .string("p1")]) == .post("p1"))
        #expect(AppRoute.target(["conversationId": .string("c1"), "postId": .string("p1")]) == .conversation("c1"))
        #expect(AppRoute.target(["storyId": .string("s")]) == .helpStories)
        #expect(AppRoute.target(["screen": .string("circle"), "circleId": .string("k")]) == .circle("k"))
        #expect(AppRoute.target(["screen": .string("highlights")]) == .highlights)
        #expect(AppRoute.target(["itemIds": .array([.string("a")])]) == .moderation)
        #expect(AppRoute.target(["problems": .array([])]) == .ops)
        #expect(AppRoute.target(["personId": .string("u")]) == .person("u"))
        #expect(AppRoute.target([:]) == nil)
    }

    @Test func appLinks() throws {
        #expect(AppRoute(url: try #require(URL(string: "prayertower:///post/p1"))) == .post("p1"))
        #expect(AppRoute(url: try #require(URL(string: "prayertower:///people/u1"))) == .person("u1"))
        #expect(AppRoute(url: try #require(URL(string: "https://x.org/post/p1"))) == nil)
        #expect(Invite.code(from: try #require(URL(string: "prayertower:///sign-in?invite=ABC123"))) == "ABC123")
        #expect(Invite.code(from: try #require(URL(string: "prayertower://sign-in?invite=XY"))) == "XY")
        #expect(Invite.code(from: try #require(URL(string: "prayertower:///post/p1"))) == nil)
    }

    @Test func noticeButtons() throws {
        let json = #"""
        [{"id":"1","kind":"moderation_notice","title":"t","body":"b","data":{"itemId":"m1","pathBack":true},"read_at":null,"created_at":"2026-10-29T10:00:00Z"},
         {"id":"2","kind":"held_for_review","title":"t","body":"b","data":{"itemId":"m2","explainable":true},"read_at":"2026-10-29T11:00:00Z","created_at":"2026-10-29T10:00:00Z"}]
        """#
        let n = try JSONDecoder().decode([AppNotification].self, from: Data(json.utf8))
        #expect(n[0].appealItem == "m1" && n[0].pathBackItem == "m1" && n[0].explainItem == nil)
        #expect(n[1].appealItem == nil && n[1].explainItem == "m2")
    }

    @Test func onboardingPatch() {
        let p = Onboarding.patch(whyHere: ["pray_for_others"], wanted: ["Health"], offered: [], scope: ["world"], traumaOptOut: true, anonymous: false)
        #expect(p["completeOnboarding"] == .bool(true))
        #expect(p["supportWanted"] == .array([.string("Health")]))
        #expect(p["prayForScope"] == .array([.string("world")]))
        #expect(Onboarding.toggled(["a"], "a") == [])
        for k in Onboarding.whyHere { #expect(w("enums.whyHere.\(k)") != "enums.whyHere.\(k)") }
        for k in Onboarding.support { #expect(w("onboarding.support.\(k)") != "onboarding.support.\(k)") }
        for k in Onboarding.scopes { #expect(w("onboarding.scopes.\(k)") != "onboarding.scopes.\(k)") }
    }

    @Test func profileReadsOnboarded() throws {
        let json = #"{"id":"u","display_name":"A","onboarded_at":"2026-10-29T10:00:00Z","support_wanted":["Health"]}"#
        let p = try JSONDecoder().decode(Profile.self, from: Data(json.utf8))
        #expect(p.onboardedAt != nil && p.supportWanted == ["Health"])
    }

    @Test func tourWordsAndSeen() throws {
        for s in Tour.steps { #expect(w("tour.\(s.key)Title") != "tour.\(s.key)Title") }
        #expect(Tour.icon(Tour.steps[1], wording: .neutral) == "🤝")
        let d = try #require(UserDefaults(suiteName: "tour-\(UUID().uuidString)"))
        #expect(!Tour.seen("u", in: d))
        Tour.markSeen("u", in: d)
        #expect(Tour.seen("u", in: d))
    }

    @Test func rulesAndSafetyWords() {
        for i in 0..<9 { #expect(w("rulesPage.items.\(i).title") != "rulesPage.items.\(i).title") }
        for k in SafetyCenter.tools { #expect(w("safetyCenter.tools.\(k).name") != "safetyCenter.tools.\(k).name") }
    }

    @Test func highlightsOffDecodes() throws {
        let h = try JSONDecoder().decode(KindnessHighlights.self, from: Data(#"{"enabled":false,"weeks":[]}"#.utf8))
        #expect(!h.enabled)
    }
}

@Suite struct EditionTests {
    @Test func editionFromInfoPlist() throws {
        #expect(Edition(["PTEdition": "open-circle"]) == .openCircle)
        #expect(Edition(["PTEdition": "prayer-tower"]) == .prayerTower)
        #expect(Edition(nil) == .prayerTower)
        #expect(Invite.code(from: try #require(URL(string: "opencircle:///sign-in?invite=OC1"))) == "OC1")
        #expect(PrayNow.postId(from: try #require(URL(string: "opencircle:///post/p9"))) == "p9")
    }
}

@Suite struct ShareTests {
    @Test func linksUseTheSiteOrTheAppScheme() {
        #expect(ShareLinks.url("/post/p1", query: ["comment": "c1"], base: "https://prayertower.app/") == "https://prayertower.app/post/p1?comment=c1")
        #expect(ShareLinks.url("/post/p1", base: nil) == "prayertower:///post/p1")
        #expect(ShareLinks.url("/pray/t", base: "", scheme: "opencircle") == "opencircle:///pray/t")
    }

    @Test func baseFallsBackToAnHttpsApi() {
        #expect(ShareLinks.base(link: "", api: URL(string: "https://api.example")!) == "https://api.example")
        #expect(ShareLinks.base(link: nil, api: URL(string: "http://127.0.0.1")!) == nil)
        #expect(ShareLinks.base(link: "https://site", api: URL(string: "http://127.0.0.1")!) == "https://site")
    }

    @Test func shareStateDecodes() throws {
        let json = #"{"mine":true,"level":"link","canShare":true,"cardAllowed":false,"words":false,"path":"/post/p1"}"#
        let s = try JSONDecoder().decode(ShareState.self, from: Data(json.utf8))
        #expect(s.level == "link")
        #expect(!s.cardAllowed)
    }
}

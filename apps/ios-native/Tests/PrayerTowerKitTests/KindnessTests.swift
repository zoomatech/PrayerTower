import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

private let tree = [
    MeaningEmoji(key: "praying", emoji: "🙏", meanings: [
        .init(key: "praying", label: "Praying for you", neutralLabel: "Thinking of you"),
        .init(key: "holding", label: "Holding you up", neutralLabel: "Holding you up"),
    ]),
    MeaningEmoji(key: "love", emoji: "❤️", meanings: [.init(key: "love", label: "Sending love", neutralLabel: "Sending love")]),
]
private let allActions = CardAction.allCases.map(\.rawValue)

@Suite struct ActionRowTests {
    @Test func keepsOneRowInTheServersOrderAndSkipsUnknownActions() {
        let row = ActionRow.items(actions: ["praying_now", "share", "something_new", "well_wishes"], features: Features(values: [:]), tree: tree, wording: .faith)
        #expect(row.map(\.action) == [.prayingNow, .share, .wellWishes])
        #expect(row.map(\.icon) == ["💜", "↗", "❤️"])
        #expect(row.allSatisfy { $0.meanings == nil })
    }

    @Test func addsMeaningsOnlyWhileBothSwitchesAreOn() {
        let one = Features(values: ["meaningReactions": true])
        #expect(ActionRow.items(actions: allActions, features: one, tree: tree, wording: .faith).allSatisfy { $0.meanings == nil })
        let both = Features(values: ["meaningReactions": true, "meaningIconRow": true])
        let row = ActionRow.items(actions: allActions, features: both, tree: tree, wording: .faith)
        #expect(row.first { $0.action == .prayingNow }?.meaningWords(.faith) == "🙏 Praying for you · Holding you up")
        #expect(row.first { $0.action == .wellWishes }?.meanings?.key == "love")
        #expect(row.first { $0.action == .share }?.meanings == nil)
    }

    @Test func usesOpenCirclesWordsInNeutralWording() {
        let both = Features(values: ["meaningReactions": true, "meaningIconRow": true])
        let row = ActionRow.items(actions: allActions, features: both, tree: tree, wording: .neutral)
        #expect(row.map(\.name) == ["Thinking of You", "Thumbs Up", "Promise to Check In", "Well Wishes", "Share", "Gift Tokens"])
        #expect(row.first { $0.action == .prayingNow }?.meaningWords(.neutral) == "🙏 Thinking of you · Holding you up")
        #expect(Wording(Community(slug: "open-circle", name: "Open Circle", wording: "neutral")) == .neutral)
        #expect(Wording(nil) == .faith)
    }
}

@Suite struct KindCloudTests {
    @Test func showsNothingWhileTheDraftIsFine() {
        #expect(KindCloud.note(for: nil, wording: .faith) == nil)
        #expect(KindCloud.note(for: Precheck(warn: false, cloud: nil, harm: nil), wording: .faith) == nil)
        #expect(KindCloud.note(for: Precheck(warn: false, cloud: KindVerdict(level: "ok", reason: nil), harm: nil), wording: .faith) == nil)
    }

    @Test func asksGentlyAndMoreFirmlyForStrongWords() throws {
        let nudge = try #require(KindCloud.note(for: Precheck(warn: false, cloud: KindVerdict(level: "nudge", reason: "shouting"), harm: nil), wording: .faith))
        #expect(nudge.ask == "Are you sure you want to put that out there?")
        #expect(!nudge.strong)
        #expect(nudge.prayer.contains("Psalm 141:3"))
        let strong = try #require(KindCloud.note(for: Precheck(warn: true, cloud: KindVerdict(level: "strong", reason: "threat"), harm: nil), wording: .faith))
        #expect(strong.strong)
        #expect(strong.spoken.hasPrefix("A gentle note about your words. Words like these can really hurt someone."))
    }

    @Test func keepsReligiousWordsOutOfOpenCircle() throws {
        let note = try #require(KindCloud.note(for: Precheck(warn: false, cloud: KindVerdict(level: "nudge", reason: nil), harm: nil), wording: .neutral))
        #expect(note.prayer == "Take a breath. Kind words travel far.")
        let religious = /(?i)\b(pray|prayer|lord|god|psalm|bless|church|faith|amen)/
        #expect(note.spoken.firstMatch(of: religious) == nil)
        #expect(note.prayer.firstMatch(of: religious) == nil)
    }

    @Test func passesOnTheHarmFiltersRedirect() throws {
        let harm = HarmNote(category: "harm_wish", message: "Let's pray for good, never for harm.", resources: nil)
        let note = try #require(KindCloud.note(for: Precheck(warn: true, cloud: nil, harm: harm), wording: .faith))
        #expect(note.harm == harm)
        #expect(note.spoken.contains("never for harm"))
    }
}

@Suite struct FreshDayRuleTests {
    @Test func acceptsRealDatesIncludingLeapDay() {
        #expect(FreshDayRules.isValid(month: 2, day: 29, label: "Leap day"))
        #expect(FreshDayRules.isValid(month: 12, day: 31, label: "New Year's Eve"))
    }

    @Test func refusesDaysThatDontExistAndEmptyOrLongNames() {
        #expect(!FreshDayRules.isValid(month: 4, day: 31, label: "April"))
        #expect(!FreshDayRules.isValid(month: 13, day: 1, label: "Nope"))
        #expect(!FreshDayRules.isValid(month: 5, day: 0, label: "Nope"))
        #expect(!FreshDayRules.isValid(month: 5, day: 12, label: "   "))
        #expect(!FreshDayRules.isValid(month: 5, day: 12, label: String(repeating: "a", count: 41)))
        #expect(FreshDayRules.maxDays == 3)
    }

    @Test func wordsTodaysFreshStart() {
        #expect(FreshDay(label: "my birthday", season: nil).line == "Today is my birthday. A fresh start: want to pick one small intention?")
        #expect(FreshDay(label: nil, season: "lent").line == "Lent begins today. A fresh start: want to pick one small intention?")
        #expect(FreshDay(label: nil, season: nil).line == nil)
    }
}

// The network tests share the stand-in server, so they join the serialized APIClientTests suite.
extension APIClientTests {
    @Test func choosesAndRemovesAMeaning() async throws {
        StubProtocol.answer = (200, #"{"leaves":[{"emoji":"praying","icon":"🙏","meaning":"holding","label":"Holding you up","neutralLabel":"Holding you up","count":2,"mine":true}]}"#)
        let leaves = try await client().chooseMeaning(postId: "p1", emoji: "praying", meaning: "holding")
        #expect(leaves.first?.mine == true)
        _ = try await client().removeMeaning(postId: "p1", emoji: "praying")
        #expect(StubProtocol.seen.map(\.httpMethod) == ["PUT", "DELETE"])
        #expect(StubProtocol.seen.map { $0.url?.path } == ["/posts/p1/meanings", "/posts/p1/meanings/praying"])
        let sent = try JSONDecoder().decode([String: String].self, from: try #require(StubProtocol.seen.first?.httpBody))
        #expect(sent == ["emoji": "praying", "meaning": "holding"])
    }

    @Test func aFailedPrecheckShowsNoCloud() async {
        StubProtocol.answer = (500, #"{"error":"oops","message":"Down"}"#)
        let r = await client().precheck("hello")
        #expect(KindCloud.note(for: r, wording: .faith) == nil)
        StubProtocol.answer = (200, #"{"warn":false,"cloud":{"level":"nudge","reason":"aimed"}}"#)
        #expect(await client().precheck("YOU ALWAYS").cloud?.level == "nudge")
    }

    @Test func readsACircleWithAnUpdateAndSendsOne() async throws {
        StubProtocol.answer = (200, """
        {"circle":{"id":"c1","name":"Tuesday friends","about":null,"isOwner":true,"ownerId":"u1","full":false},
         "members":[{"id":"u1","displayName":"Ethel"}],"invite":null,"welcome":{"text":null,"show":true},
         "posts":[{"id":"cp1","author":{"id":"u1","displayName":"Ethel"},"body":"My sister starts a job.","createdAt":"2026-10-29T08:00:00Z",
                   "prayedByMe":false,"prayed":3,"replies":[],"update":{"text":"It went well.","answered":true,"at":"2026-10-29T09:00:00Z"}}]}
        """)
        let view = try await client().circle("c1")
        #expect(view.posts.first?.isMine == true)
        #expect(view.posts.first?.update?.answered == true)
        #expect(view.welcome?.show == true)
        StubProtocol.answer = (200, #"{"ok":true}"#)
        _ = try await client().circleUpdate(postId: "cp1", text: "Going better.", answered: false)
        let asked = try #require(StubProtocol.seen.last)
        #expect(asked.url?.path == "/circle-posts/cp1/update")
        let body = try JSONSerialization.jsonObject(with: try #require(asked.httpBody)) as? [String: Any]
        #expect(body?["text"] as? String == "Going better.")
        #expect(body?["answered"] as? Bool == false)
    }

    @Test func savesAndRemovesFreshStartDays() async throws {
        StubProtocol.answer = (200, #"{"days":[{"id":"d1","month":5,"day":12,"label":"My birthday"}]}"#)
        let days = try await client().addFreshDay(month: 5, day: 12, label: "My birthday")
        #expect(days.first?.label == "My birthday")
        _ = try await client().removeFreshDay("d1")
        StubProtocol.answer = (200, #"{"stats":{"daysThisMonth":3,"freshDay":{"label":"My birthday"}}}"#)
        #expect(try await client().freshDayToday(timeZone: "America/Chicago")?.label == "My birthday")
        #expect(StubProtocol.seen.map { "\($0.httpMethod ?? "") \($0.url?.path ?? "")" } == ["POST /me/fresh-days", "DELETE /me/fresh-days/d1", "GET /me/prayer-stats"])
        #expect(StubProtocol.seen.last?.url?.query == "tz=America/Chicago")
    }

    @Test func readsTheCardsActions() async throws {
        StubProtocol.answer = (200, """
        {"posts":[{"id":"p1","author":{"id":null,"displayName":"Someone","handle":null,"anonymous":true},"isMine":false,"postType":"prayer_request",
          "urgency":0,"preview":"x","body":"x","crisis":false,"counts":{"prayingNow":0,"prayers":0,"commitments":0,"comments":0},
          "createdAt":"2026-10-29T08:00:00Z","actions":["praying_now","commit","well_wishes"]}],"pinnedId":null,"nextPage":null}
        """)
        #expect(try await client().feed().posts.first?.actions == ["praying_now", "commit", "well_wishes"])
    }
}

@Suite struct KindWordsTests {
    @Test func keepsOneMomentAllWeekAndHasWordsForEach() {
        // 2026-10-26 is a Monday; through Sunday the moment stays, and the next Monday moves on.
        let monday = Date(timeIntervalSince1970: 1_792_972_800)
        let sunday = monday.addingTimeInterval(6 * 86_400 + 3_600)
        #expect(KindWords.moment(for: monday) == KindWords.moment(for: sunday))
        #expect(KindWords.moment(for: monday.addingTimeInterval(7 * 86_400)) == (KindWords.moment(for: monday) + 1) % 6)
        let w = Words(.neutral)
        for week in 0..<6 {
            let k = KindWords.keys(for: monday.addingTimeInterval(Double(week) * 7 * 86_400))
            #expect(w(k.situation) != k.situation)
            for r in k.replies { #expect(w(r.reply) != r.reply && w(r.note) != r.note) }
        }
    }
}

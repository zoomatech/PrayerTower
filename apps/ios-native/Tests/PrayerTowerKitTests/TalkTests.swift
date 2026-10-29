import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct TalkTests {
    @Test func findsTheMoveInTheSameOrderAsTheExpoApp() {
        #expect(Talk.move(of: "Thanks, bye!") == .thanks)
        #expect(Talk.move(of: "Hi there") == .greeting)
        #expect(Talk.move(of: "My mom is in the hospital") == .trouble)
        #expect(Talk.move(of: "Good news, I got the job") == .goodNews)
        #expect(Talk.move(of: "ok") == nil)
        #expect(Talk.suggestionKey(lastFromOther: nil, empty: true) == "talk.suggestGreeting")
        #expect(Talk.suggestionKey(lastFromOther: "how are you?", empty: false) == "talk.suggestHowAreYou")
    }

    @Test func noticesADownbeatAnswerAndBuildsChains() {
        #expect(Talk.isDownbeat("meh, tired"))
        #expect(!Talk.isDownbeat("Great, thanks!"))
        #expect(Talk.chain("Hello!", "Hi, how are you?", "ok") == ["greeting", "howAreYou", "other"])
        #expect(Talk.chain("ok", "Hi", "x") == nil)
    }

    @Test func chipsFollowBothTheSwitchAndTheMembersChoice() {
        let on = Features(values: ["replySuggestions": true, "troubleNudge": true, "kindClosings": true])
        let w = Words(.faith)
        #expect(Talk.chips(features: on, prefs: ConversationPrefs(), words: w, lastFromOther: "meh, not great", empty: false).isEmpty)
        let chosen = ConversationPrefs(replySuggestions: true, troubleNudge: true, kindClosings: true)
        let chips = Talk.chips(features: on, prefs: chosen, words: w, lastFromOther: "meh, not great", empty: false)
        #expect(chips.map(\.label).contains(w("talk.careAsk")))
        #expect(chips.count == 3)
        #expect(Talk.chips(features: Features(values: [:]), prefs: chosen, words: w, lastFromOther: "meh, not great", empty: false).isEmpty)
    }

    @Test func openCircleSuggestionsHaveNoReligiousWords() {
        let w = Words(.neutral)
        for key in ["talk.suggestGreeting", "talk.suggestTrouble", "talk.suggestGoodNews", "talk.careAsk", "talk.closing1", "talk.closing2"] {
            #expect(w(key) != key)
            #expect(!w(key).lowercased().contains("pray"), "\(key)")
        }
    }
}

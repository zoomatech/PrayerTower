import Foundation
import Testing
@testable import PrayerTowerKit

// The research desk beside Search the texts (ResearchDesk.swift, Resources/research-desk.json). The expected links are
// the Ehrmanator Research Desk page's own, made by its JavaScript for the same words.

struct ResearchDeskTests {
    let desk = ResearchDesk.bundled!

    @Test func holdsTheDesksPanelsFeedsAndIndex() {
        #expect(desk.news.items.count == 11)
        #expect(desk.news.filters.map(\.id) == ["all", "ark", "museum", "flood", "scholars"])
        #expect(desk.news.items("ark").count == 6 && desk.news.items("all").count == 11)
        #expect(desk.news.items.allSatisfy { desk.news.sides[$0.side] != nil && !$0.sources.isEmpty })
        #expect(desk.scholars.map(\.name) == ["Dan McClellan", "Bart D. Ehrman", "Elaine Pagels"])
        #expect(desk.outlets.count == 6)
        #expect(desk.index.episodes.count == 187 && desk.index.episodes.map(\.number) == Array(1...187))
        #expect(desk.index.episodes.allSatisfy { $0.topics.allSatisfy { desk.index.topics[$0] != nil } })
        let links = desk.news.items.flatMap(\.sources).map(\.url) + desk.scholars.flatMap(\.accounts).map(\.url) + desk.outlets.map(\.url)
        #expect(links.allSatisfy { URL(string: $0)?.scheme == "https" })
    }

    @Test func eachAccountsSearchIsTheDesksOwnLink() {
        let words = "Noah\u{2019}s Ark & flood"
        let mcclellan = desk.scholars[0].search
        #expect(mcclellan.map { $0.address(words)?.absoluteString ?? "index" } == [
            "https://www.tiktok.com/search?q=maklelan%20Noah%E2%80%99s%20Ark%20%26%20flood",
            "https://www.youtube.com/@maklelan/search?query=Noah%E2%80%99s%20Ark%20%26%20flood",
            "https://bsky.app/search?q=from%3Amaklelan.bsky.social%20Noah%E2%80%99s%20Ark%20%26%20flood",
            "https://x.com/search?q=from%3Amaklelan%20Noah%E2%80%99s%20Ark%20%26%20flood&f=live",
            "index",
            "https://www.google.com/search?q=site%3Ainstagram.com%2Fmaklelan%20Noah%E2%80%99s%20Ark%20%26%20flood",
        ])
        #expect(desk.scholars[1].search.last?.address(words)?.absoluteString
            == "https://www.google.com/search?q=%22Misquoting%20Jesus%22%20podcast%20Noah%E2%80%99s%20Ark%20%26%20flood")
        #expect(desk.scholars[2].search.first?.address(words)?.absoluteString
            == "https://www.youtube.com/results?search_query=%22Elaine%20Pagels%22%20Noah%E2%80%99s%20Ark%20%26%20flood&sp=CAI%253D")
    }

    @Test func theLiveNewsSearchIsGoogleNewsOverTheTimeChosen() {
        #expect(ResearchDesk.newsSearch("Ark Encounter", when: "30d")?.absoluteString
            == "https://news.google.com/search?q=Ark%20Encounter%20when%3A30d&hl=en-US&gl=US&ceid=US:en")
        #expect(ResearchDesk.newsSearch("Ken Ham", when: "")?.absoluteString
            == "https://news.google.com/search?q=Ken%20Ham&hl=en-US&gl=US&ceid=US:en")
    }

    @Test func theIndexFindsEpisodesByNumberWordsAndTopic() {
        let index = desk.index
        #expect(index.episodes(matching: "183").map(\.number) == [183])
        #expect(index.episodes(matching: "#4").map(\.title) == ["Ehrmageddon! With Bart Ehrman"])
        #expect(index.episodes(matching: "Ehrmageddon bart").map(\.number) == [4])
        // A topic's name counts as words of the episode.
        #expect(index.episodes(matching: "hell", topic: "spirits").map(\.number).contains(15))
        #expect(index.episodes(matching: "", topic: "holiday").allSatisfy { $0.topics.contains("holiday") })
        #expect(index.episodes(matching: "zzzz").isEmpty)
        #expect(index.topicOrder.first == "spirits")
        #expect(index.episodes[182].youTube?.absoluteString.hasPrefix("https://www.youtube.com/results?search_query=Data%20Over%20Dogma%20") == true)
    }
}

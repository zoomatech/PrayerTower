import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct WidgetTests {
    let w = Words(.faith)

    func card(_ id: String, mine: Bool = false, sensitive: Bool = false, crisis: Bool = false, type: String = "prayer_request", state: String? = nil, prayers: Int = 0) -> String {
        """
        {"id":"\(id)","author":{"id":"u","displayName":"Ana","handle":null,"anonymous":false},"isMine":\(mine),"postType":"\(type)","urgency":0,
         "preview":"Pray for \(id)","body":"b","crisis":\(crisis),"isSensitive":\(sensitive),"counts":{"prayingNow":0,"prayers":\(prayers),"commitments":0,"comments":0},
         "createdAt":"2026-10-29T08:00:00Z"\(state.map { #","state":"\#($0)""# } ?? "")}
        """
    }

    func page(_ cards: [String], pinned: String? = nil) throws -> FeedPage {
        let json = #"{"posts":[\#(cards.joined(separator: ","))],"pinnedId":\#(pinned.map { "\"\($0)\"" } ?? "null"),"nextPage":null}"#
        return try JSONDecoder().decode(FeedPage.self, from: Data(json.utf8))
    }

    @Test func nextRequestSkipsWhatAHomeScreenShouldNotShow() throws {
        let p = try page([
            card("mine", mine: true), card("sens", sensitive: true), card("cri", crisis: true),
            card("talk", type: "discussion"), card("done", state: "answered"), card("ok", prayers: 3), card("pin"),
        ], pinned: "pin")
        #expect(PrayNow.nextRequest(p)?.id == "pin")
        let unpinned = try page([card("mine", mine: true), card("ok", prayers: 3)], pinned: "mine")
        #expect(PrayNow.nextRequest(unpinned)?.id == "ok")
        #expect(PrayNow.nextRequest(try page([card("mine", mine: true)])) == nil)
    }

    @Test func snapshotWords() throws {
        let c = try #require(PrayNow.nextRequest(try page([card("ok", prayers: 3)])))
        let s = PrayNow.snapshot(c, words: w)
        #expect(s == PrayNowSnapshot(heading: "Pray now", text: "Pray for ok", detail: "3 praying", url: "prayertower:///post/ok"))
        #expect(PrayNow.snapshot(nil, words: w).text == "Open Prayer Tower to see who needs prayer.")
        #expect(PrayNow.postId(from: URL(string: s.url)!) == "ok")
        #expect(PrayNow.postId(from: URL(string: "prayertower:///")!) == nil)
        #expect(PrayNow.postId(from: URL(string: "https://x.org/post/ok")!) == nil)
    }

    @Test func prayedForLine() {
        #expect(PrayNow.prayedForLine(PrayedFor(enabled: false), words: w) == "")
        #expect(PrayNow.prayedForLine(PrayedFor(enabled: true, names: [], people: 0), words: w) == "")
        #expect(PrayNow.prayedForLine(PrayedFor(enabled: true, names: [], people: 4), words: w) == "💛 4 people prayed for you today")
        #expect(PrayNow.prayedForLine(PrayedFor(enabled: true, names: ["Ana"], people: 1), words: w) == "💛 Ana prayed for you today")
        #expect(PrayNow.prayedForLine(PrayedFor(enabled: true, names: ["Ana", "Bo"], people: 2), words: w) == "💛 Ana and Bo prayed for you today")
        #expect(PrayNow.prayedForLine(PrayedFor(enabled: true, names: ["Ana", "Bo"], people: 3), words: w) == "💛 Ana and 2 others prayed for you today")
    }

    @Test func snapshotRoundTripsThroughDefaults() throws {
        let d = try #require(UserDefaults(suiteName: "widget-test-\(UUID().uuidString)"))
        #expect(PrayNow.load(from: d) == nil)
        let s = PrayNowSnapshot(heading: "h", text: "t", detail: "d", url: "u", prayedFor: "p")
        PrayNow.save(s, to: d)
        #expect(PrayNow.load(from: d) == s)
    }

    @Test func liveStateMatchesTheServer() throws {
        // modules/live-activity sends { name: "PrayedFor", props: JSON.stringify(content) }.
        let json = #"{"name":"PrayedFor","props":"{\"heading\":\"Praying for you\",\"line\":\"Ana prayed for you\",\"count\":1}"}"#
        let state = try JSONDecoder().decode(PrayedForState.self, from: Data(json.utf8))
        #expect(state.decoded == PrayedForProps(heading: "Praying for you", line: "Ana prayed for you", count: 1))
        #expect(PrayedForState(.waiting(w)).decoded == PrayedForProps(heading: "Praying for you", line: "Waiting for the first prayer", count: 0))
    }
}

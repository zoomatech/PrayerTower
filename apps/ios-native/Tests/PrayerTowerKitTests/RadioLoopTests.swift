import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

@Suite struct RadioLoopTests {
    @Test func readsTheSummaryPrefsAndSwitches() throws {
        let json = #"""
        {"optedIn":true,"sends":2,"station":{"lat":39.8,"lon":-89.7},
         "latest":{"sentAt":"2026-10-29T21:30:00.000Z","callSign":"KD9XYZ","heardBy":4,"places":[{"name":"Hilltop","lat":39.8,"lon":-89.5,"snrDb":15.1}]}}
        """#
        let s = try JSONDecoder().decode(RadioSummary.self, from: Data(json.utf8))
        #expect(s.optedIn && s.latest?.heardBy == 4 && s.latest?.places[0].id == "Hilltop")
        let none = try JSONDecoder().decode(RadioSummary.self, from: Data(#"{"optedIn":false,"sends":0,"station":null,"latest":null}"#.utf8))
        #expect(none.latest == nil && none.station == nil)
        let p = try JSONDecoder().decode(RadioPrefs.self, from: Data(#"{"followup":null,"namesPrivate":true}"#.utf8))
        #expect(p.followup == nil && p.namesPrivate == true)
        let c = try JSONDecoder().decode(ListenConfig.self, from: Data(#"{"enabled":true,"receipts":false,"readAloud":true}"#.utf8))
        #expect(c.readAloud == true)
        // An older server sends no readAloud: not offered.
        #expect(try JSONDecoder().decode(ListenConfig.self, from: Data(#"{"enabled":true,"receipts":false}"#.utf8)).readAloud == nil)
    }

    @Test func theMapPutsEverythingInTheBoxNorthUp() {
        let d = HeardMapLayout.dots(RadioLoopDemo().summary, width: 280, height: 150)
        #expect(d.count == 3 && d.filter(\.station).count == 1)
        let st = d.first(where: \.station)!, hill = d.first { $0.name == "Hilltop" }!, roof = d.first { $0.name == "Church roof" }!
        #expect(hill.x > st.x)
        #expect(roof.y > st.y)
        #expect(d.allSatisfy { (0...280).contains($0.x) && (0...150).contains($0.y) })
        var empty = RadioLoopDemo().summary
        empty = RadioSummary(optedIn: false, latest: .init(sentAt: empty.latest!.sentAt, callSign: nil, heardBy: 2, places: []), sends: 1, station: empty.station)
        #expect(HeardMapLayout.dots(empty, width: 280, height: 150).isEmpty)
    }

    @Test func readsEachPrayerOnceInOrder() {
        let f = { (prayers: [String]?) in HeardFrame(callSign: "N0CALL", preset: "fm-standard", snrDb: 12, corrected: false, prayers: prayers, codec: 3, via: nil, hops: nil, start: 0, end: 1) }
        #expect(ReadAloud.lines([f(["Pray for rain.", "Pray for rain.", "Pray for someone’s surgery."]), f(nil), f(["Pray for rain."])]) == ["Pray for rain.", "Pray for someone’s surgery."])
    }

    @Test func theSampleOffersEverything() {
        var d = RadioLoopDemo(now: Date(timeIntervalSince1970: 1_793_000_000))
        #expect(d.settings.followup && d.settings.readAloud && d.settings.namePrivacy)
        #expect(ListenConfig.sample.readAloud == true)
        d.setFollowup(true)
        #expect(d.summary.optedIn && d.prefs.followup == true)
    }

    @Test func wordsExistInBothEditions() {
        for key in ["radioFollowup.title", "radioFollowup.notYet", "radioFollowup.notify", "radioFollowup.mapLabel", "radioFollowup.adminOn",
                    "readAloud.toggle", "readAloud.hint", "readAloud.adminOn", "namePrivacy.mine", "namePrivacy.adminOn"] {
            #expect(Words(.faith)(key) != key, "\(key)")
            #expect(Words(.neutral)(key) != key, "\(key)")
        }
        #expect(Words(.faith)("radioFollowup.heard", ["time": "9:30 PM"], count: 4) == "Sent by radio at 9:30 PM, heard by 4 listeners")
    }
}

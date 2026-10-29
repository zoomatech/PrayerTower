import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct LibraryPlansTests {
    @Test func readsAParallelThemeWithLabelsAndCitations() throws {
        let json = #"{"id":"flood","title":"The great flood","intro":"Heaven sends a flood.","sides":[{"label":"The raven and the dove","collection":"bible-kjv","collectionTitle":"King James Bible","work":{"id":"kjv-genesis","title":"Genesis","author":""},"ref":"Genesis 8:6–11","text":"And it came to pass","citation":"Genesis 8:6–11 (King James Bible)"},{"label":null,"collection":"oldest-texts","collectionTitle":"Oldest texts","work":{"id":"gilgamesh-deluge-budge","title":"The Babylonian Story of the Deluge (Gilgamesh)","author":"E. A. Wallis Budge (1920)"},"ref":"Tablet XI, lines 142–155","text":"I brought out a dove","citation":"The Babylonian Story of the Deluge (Gilgamesh), Tablet XI, lines 142–155 (E. A. Wallis Budge (1920))"}]}"#
        let t = try JSONDecoder().decode(ParallelTheme.self, from: Data(json.utf8))
        #expect(t.sides.count == 2)
        #expect(t.sides[0].label == "The raven and the dove" && t.sides[0].excerpt.citation == "Genesis 8:6–11 (King James Bible)")
        #expect(t.sides[1].label == nil && t.sides[1].excerpt.collectionTitle == "Oldest texts")
        let off = try JSONDecoder().decode(ParallelThemes.self, from: Data(#"{"enabled":false}"#.utf8))
        #expect(!off.enabled && off.themes.isEmpty)
    }

    @Test func readsPlansProgressAndADay() throws {
        let list = try JSONDecoder().decode(LibraryPlanList.self, from: Data(#"{"enabled":true,"circles":[{"id":"c1","name":"Morning readers"}],"plans":[{"id":"psalms-30","title":"Psalms in 30 days","intro":"Five a day.","days":30,"faith":true,"following":{"read":3,"next":4,"finished":false,"reminders":true,"circle":{"id":"c1","name":"Morning readers"}},"circles":[{"id":"c1","name":"Morning readers","readers":2}]}]}"#.utf8))
        #expect(list.plans.first?.following?.next == 4 && list.plans.first?.circles.first?.readers == 2 && list.circles.count == 1)
        let done = try JSONDecoder().decode(PlanProgress.self, from: Data(#"{"read":30,"next":null,"finished":true,"reminders":false,"circle":null}"#.utf8))
        #expect(done.next == nil && done.finished)
        let day = try JSONDecoder().decode(LibraryPlanDay.self, from: Data(#"{"plan":{"id":"psalms-30","title":"Psalms in 30 days","days":30},"day":4,"reading":{"collection":"bible-kjv","collectionTitle":"King James Bible","work":{"id":"kjv-psalms","title":"Psalms","author":""},"ref":"Psalms 16–20","text":"Preserve me, O God","citation":"Psalms 16–20 (King James Bible)"},"read":false,"following":null,"circle":{"id":"c1","name":"Morning readers","readers":1,"reading":2}}"#.utf8))
        #expect(day.reading.citation == "Psalms 16–20 (King James Bible)" && day.circle?.reading == 2)
    }
}

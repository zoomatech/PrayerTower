import Foundation
import Testing
@testable import PrayerTowerKit

extension APIClientTests {
    @Test func readsTheStarterSetAndTurnsItOn() async throws {
        StubProtocol.answer = (200, ##"{"items":[{"key":"kind_cloud","on":true},{"key":"welcome_card","on":false}],"allOn":false,"anyOn":true}"##)
        let s = try await client().setKindnessStarter(true)
        #expect(s.onCount == 1 && !s.allOn)
        let body = try JSONSerialization.jsonObject(with: StubProtocol.seen.last!.httpBody!) as! [String: Any]
        #expect(body["on"] as? Bool == true && StubProtocol.seen.last?.httpMethod == "POST")
        let w = Words(.faith)
        #expect(s.items.allSatisfy { w("starter.items.\($0.key)") != "starter.items.\($0.key)" })
    }

    @Test func foldsQuietWeeksInTheWeather() async throws {
        StubProtocol.answer = (200, ##"{"enabled":true,"weeks":[{"weekStart":"2026-10-26","weather":"sunny","comments":12,"warm":9,"heated":1,"prayers":30,"people":7},{"weekStart":"2026-10-19","weather":"quiet","comments":null,"warm":null,"heated":null,"prayers":null,"people":null}]}"##)
        let r = try await client().kindnessWeather()
        #expect(StubProtocol.seen.last?.url?.query == "weeks=12")
        let w = Words(.neutral)
        let sunny = r.weeks[0].lines(w), quiet = r.weeks[1].lines(w)
        #expect(sunny.title.contains("2026-10-26") && sunny.numbers?.contains("12") == true && r.weeks[0].sky == "☀️")
        #expect(quiet.numbers == nil)
    }
}

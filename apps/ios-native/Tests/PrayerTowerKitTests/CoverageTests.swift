import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

@Suite struct CoverageTests {
    @Test func readsTheMapWithEachNodesReceiver() throws {
        let json = #"""
        {"enabled":true,"tileUrl":"","station":{"lat":39.8,"lon":-89.6},
         "points":[{"id":"n1","name":"Hilltop","place":"Springfield, IL","lat":39.8,"lon":-89.7,"snrDb":18,"reports":3,"lastHeardAt":"2026-10-29T08:00:00.000Z",
                    "lastSeenAt":null,"quality":"fair","receiver":{"kind":"rtl-sdr","freqHz":146520000,"mode":"fm"}},
                   {"id":"n2","name":"Old Pi","place":null,"lat":41.9,"lon":-87.6,"snrDb":null,"reports":0,"lastHeardAt":null,"lastSeenAt":null,"quality":"none","receiver":null}],
         "unplaced":[{"id":"n3","name":"Valley"}]}
        """#
        let m = try JSONDecoder().decode(CoverageMap.self, from: Data(json.utf8))
        #expect(m.points[0].receiver?.isSdr == true)
        #expect(m.points[0].receiver?.tuning == "146.520 MHz FM")
        #expect(m.points[1].receiver == nil)
        #expect(m.unplaced.map(\.name) == ["Valley"])
        let r = try #require(m.region)
        #expect(abs(r.center.lat - 40.85) < 0.001 && abs(r.center.lon - -88.65) < 0.001)
        #expect(r.latSpan > 2.1 * 1.39 && r.lonSpan > 2.1 * 1.39)
    }

    @Test func colorsBySignalAsTheServerDoes() {
        #expect([nil, 5, 10, 19.9, 20].map(CoverageMap.quality) == ["none", "weak", "fair", "fair", "strong"])
        #expect(CoverageMap.Receiver(kind: "sound-card").tuning == nil)
    }

    @Test func theSampleShowsEveryKindOfNode() throws {
        var d = CoverageDemo()
        #expect(d.map.enabled && d.map.station != nil)
        #expect(Set(d.map.points.map(\.quality)) == ["strong", "fair", "weak", "none"])
        #expect(d.map.points.contains { $0.receiver?.isSdr == true })
        for p in d.map.points { #expect(CoverageMap.quality(p.snrDb) == p.quality) }
        #expect(!d.reports.isEmpty)
        let r = try #require(d.map.region)
        #expect(r.latSpan >= 0.5)
        d.setEnabled(false)
        #expect(!d.map.enabled)
    }

    @Test func mapWordsExist() {
        for key in ["coverage.title", "coverage.on", "coverage.hint", "coverage.empty", "coverage.sdr", "coverage.radio", "coverage.stationPin", "coverage.recent", "coverage.unplaced",
                    "coverage.quality.strong", "coverage.quality.none"] {
            #expect(Words(.faith)(key) != key, "\(key)")
            #expect(Words(.neutral)(key) != key, "\(key)")
        }
    }
}

extension APIClientTests {
    @Test func turnsTheMapOnAndPlacesOrRemovesANode() async throws {
        StubProtocol.answer = (200, #"{"enabled":true,"tileUrl":"","station":null,"points":[],"unplaced":[]}"#)
        #expect(try await client().setCoverageMap(enabled: true).enabled)
        var req = try #require(StubProtocol.seen.last)
        #expect(req.httpMethod == "PATCH" && req.url?.path == "/admin/radio-coverage")
        #expect(String(decoding: try #require(req.httpBody), as: UTF8.self) == #"{"enabled":true}"#)
        _ = try await client().unplaceNode("n1")
        req = try #require(StubProtocol.seen.last)
        #expect(req.httpMethod == "PUT" && req.url?.path == "/admin/radio-nodes/n1/location")
        #expect(String(decoding: try #require(req.httpBody), as: UTF8.self) == #"{"location":null}"#)
        _ = try await client().coverageMap()
        #expect(StubProtocol.seen.last?.url?.path == "/admin/radio-coverage")
    }
}

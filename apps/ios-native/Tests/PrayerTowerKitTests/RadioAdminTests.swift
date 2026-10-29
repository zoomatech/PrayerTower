import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

@Suite struct RadioAdminModelTests {
    @Test func listsListenersOrStationsByTheirSwitches() throws {
        let json = #"""
        {"enabled":true,"multiStation":false,"signaturesRequired":false,"stations":[{"node":null,"sending":1,"sent":40}],
         "nodes":[{"id":"n1","name":"Hilltop","role":"listener","enabled":true,"created_at":"2026-10-20T00:00:00.000Z","last_seen_at":null},
                  {"id":"n2","name":"North","role":"station","enabled":true,"created_at":"2026-10-20T00:00:00.000Z","last_seen_at":null}],
         "reports":[{"node":"Hilltop","call_sign":"N0CALL","preset":"fm-standard","snr_db":14.5,"heard_at":"2026-10-29T08:05:03.000Z"}]}
        """#
        let n = try JSONDecoder().decode(RadioNodes.self, from: Data(json.utf8))
        #expect(n.shown.map(\.name) == ["Hilltop"])
        #expect(n.reports.first?.snr_db == 14.5)
        #expect(n.stations.first?.node == nil)
    }

    @Test func aBurstIsTroubledWhenItFailedOrDecodedShort() {
        func burst(ok: Bool, decoded: Int?) -> StationBurst {
            StationBurst(id: "1", created_at: "2026-10-29T08:00:00Z", call_sign: "N0CALL", mode: "simulate", preset: "fm-standard", prayers: 10, frames: 2,
                         bytes: 200, seconds: 0.9, decoded: decoded, ok: ok, error: nil)
        }
        #expect(!burst(ok: true, decoded: 10).troubled)
        #expect(!burst(ok: true, decoded: nil).troubled)
        #expect(burst(ok: true, decoded: 9).troubled)
        #expect(burst(ok: false, decoded: nil).troubled)
    }

    @Test func stationOnlySwitchesFollowTheTransmitter() {
        #expect(RadioSwitch.allCases.filter { !$0.stationOnly } == [.heardTrail, .scheduledRadio, .signalQueue])
        for s in RadioSwitch.allCases {
            #expect(Words(.faith)(s.label) != s.label, "\(s.label)")
            #expect(Words(.faith)(s.hint) != s.hint, "\(s.hint)")
        }
        #expect(Words(.faith)("radioAdmin.fund") == "Priestly token fund")
    }

    @Test func theSampleChangesOnlyItself() {
        var d = RadioAdminDemo()
        #expect(d.settings.station && d.settings.burst)
        #expect(d.tokens.radio_funding == "free")
        d.setFunding(free: false)
        #expect(d.tokens.radio_funding == "tokens" && d.tokens.radio_prayer_cost == 1)
        d.addNode(name: " Barn ", role: "listener")
        #expect(d.nodes.shown.last?.name == "Barn")
        #expect(d.bursts.contains { $0.troubled })
    }
}

extension APIClientTests {
    @Test func savesRadioSettingsAndSwitches() async throws {
        StubProtocol.answer = (200, #"""
        {"settings":{"radio_transmitter":"station","radio_station_requires_free":false,"radio_max_chars":280,"radio_amplify_repeats":3,"radio_order":"need",
         "radio_urgent_first":true,"radio_batch_max":50,"listen_page_enabled":false,"radio_receipts_enabled":false,"on_air_page_enabled":false}}
        """#)
        let s = try await client().updateRadioSettings(["batchMax": .int(50)])
        #expect(s.burst && s.station)
        var req = try #require(StubProtocol.seen.last)
        #expect(req.httpMethod == "PATCH" && req.url?.path == "/admin/radio-settings")
        #expect(String(decoding: try #require(req.httpBody), as: UTF8.self) == #"{"batchMax":50}"#)

        StubProtocol.answer = (200, #"{"enabled":true,"active":false}"#)
        #expect(try await client().setRadioSwitch(.listenerMode, true))
        req = try #require(StubProtocol.seen.last)
        #expect(req.url?.path == "/admin/listener-mode")
    }

    @Test func removesTheDailyCapWithNull() async throws {
        StubProtocol.answer = (200, #"{"everyRequest":true,"dailyCap":null}"#)
        let f = try await client().updateFairAir(dailyCap: .some(nil))
        #expect(f.dailyCap == nil)
        let req = try #require(StubProtocol.seen.last)
        #expect(String(decoding: try #require(req.httpBody), as: UTF8.self) == #"{"dailyCap":null}"#)
    }

    @Test func changesOnlyTheAckSettingAsked() async throws {
        StubProtocol.answer = (200, #"{"enabled":false,"health":null,"acks":{"enabled":true,"timeoutMinutes":30,"maxRetries":1,"heard":0,"waiting":0,"unheard":0,"retried":0}}"#)
        let h = try await client().updateRadioHealth(ackTimeout: 30)
        #expect(h.acks.timeoutMinutes == 30 && h.health == nil)
        let req = try #require(StubProtocol.seen.last)
        #expect(String(decoding: try #require(req.httpBody), as: UTF8.self) == #"{"acks":{"timeoutMinutes":30}}"#)
    }
}

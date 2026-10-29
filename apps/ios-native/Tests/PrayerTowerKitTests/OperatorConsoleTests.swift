import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PrayerTowerKit

/// A console as GET /radio/console answers it (server radio/console.ts view).
private func console(paused: Bool = false, override: String? = nil, onAir: Bool = true, windows: Bool = true, problems: String = "",
                     stations: String? = nil, sky: String = "null") throws -> RadioConsole {
    let station = stations ?? #"{"callSign":"N0CALL","lastHeartbeat":"2026-10-29T18:00:00.000Z","lastIdAt":"2026-10-29T17:55:00.000Z","everyMinutes":10,"nextIdAt":"2026-10-29T18:05:00.000Z"}"#
    let json = """
    {"paused":\(paused),"problems":[\(problems)],"windowOverrideUntil":\(override.map { "\"\($0)\"" } ?? "null"),"onAirNow":\(onAir),
     "schedule":{"enabled":\(windows),"timeZone":"America/Chicago","inWindow":true,"windows":[{"days":[5],"start":"19:00","end":"21:00"}],"quietStart":null,"quietEnd":null},
     "queue":{"queued":2,"sending":0,"oldestMinutes":7,"next":[{"id":"r1","text":"For my knee","urgency":2,"repeats":1,"waitingMinutes":7}]},
     "stations":[\(station)],
     "relays":[{"node":"Hilltop","reportedAt":"2026-10-29T18:00:00.000Z","callSign":"N0CALL-2","relayedLastHour":4,"secondsLastHour":12.5,"budgetSeconds":120,"skipped":{"duplicate":3}}],
     "sky":\(sky),"ceaseless":null,
     "beacon":{"enabled":true,"minutes":30,"recent":[{"id":"b1","sentAt":"2026-10-29T17:30:00.000Z","status":"sent","callSign":"N0CALL","preset":"fm-standard","heard":[{"by":"Hilltop","snrDb":14.2,"peakDbfs":-6}]}]},
     "log":[{"at":"2026-10-29T17:59:00Z","callSign":null,"station":"main","preset":"psk31","status":"transmitted","heard":true,"error":null,"text":"For my knee"}]}
    """
    return try JSONDecoder().decode(RadioConsole.self, from: Data(json.utf8))
}

private let ptt = #"{"kind":"ptt_failed","level":"problem","detail":"rigctld did not answer","callSign":"N0CALL","since":null}"#
private let now = Keying.date("2026-10-29T18:01:00Z")!

@Suite struct KeyingTests {
    @Test func readsTheWholeConsole() throws {
        let c = try console()
        #expect(c.queue.next.first?.waitingMinutes == 7)
        #expect(c.relays.first?.skipped["duplicate"] == 3)
        #expect(c.beacon.recent.first?.heard.first?.by == "Hilltop")
        #expect(c.log.first?.callSign == nil)
    }

    @Test func holdIsOneClickAndAlwaysThereWhileTransmitting() throws {
        let k = Keying(try console(), now: now)
        #expect(k.state == .onAir)
        #expect(k.canHold && !k.canResume && k.canSendFor && !k.canEndOverride)
        #expect(k.notes.isEmpty)
    }

    @Test func aStuckOrDeadPTTBlocksEverythingThatKeysTheRadio() throws {
        let running = Keying(try console(problems: ptt), now: now)
        #expect(running.canHold && !running.canSendFor)
        #expect(running.notes.contains(.init("macConsole.pttBlocked")))
        let held = Keying(try console(paused: true, problems: ptt), now: now)
        #expect(held.state == .held && !held.canResume && !held.canSendFor)
    }

    @Test func aHoldOutranksSendingOutsideTheWindows() throws {
        let k = Keying(try console(paused: true, onAir: false), now: now)
        #expect(k.canResume && !k.canHold && !k.canSendFor)
        #expect(k.notes == [.init("macConsole.resumeFirst")])
    }

    @Test func sendForNeedsWindowsAndCanBeEnded() throws {
        #expect(!Keying(try console(windows: false), now: now).canSendFor)
        let k = Keying(try console(override: "2026-10-29T18:30:00.000Z"), now: now)
        #expect(k.state == .override && k.canEndOverride)
    }

    @Test func warnsWhenAnIDIsDueNoStationReportsOrTheDishHolds() throws {
        let due = Keying(try console(), now: Keying.date("2026-10-29T18:06:00Z")!)
        #expect(due.notes == [.init("macConsole.idDue", ["callSign": "N0CALL"])])
        #expect(Keying(try console(stations: ""), now: now).notes == [.init("macConsole.noStation")])
        let sky = #"{"target":"moon","name":null,"az":120.5,"el":-4.2,"aboveMinimum":false,"minElevation":10,"holdBelow":true,"next":{"at":"2026-10-29T22:00:00.000Z","rising":true}}"#
        #expect(Keying(try console(sky: sky), now: now).notes == [.init("macConsole.skyHold")])
    }

    @Test func minutesUntilTheNextID() {
        #expect(Keying.minutes(until: "2026-10-29T18:05:00.000Z", now: now) == 4)
        #expect(Keying.minutes(until: "nonsense", now: now) == nil)
    }

    @Test func everyConsoleWordIsThere() {
        let keys = ["macConsole.keying", "macConsole.confirmResume", "macConsole.confirmSendForTitle", "macConsole.pttBlocked", "macConsole.resumeFirst",
                    "macConsole.noStation", "macConsole.idDue", "macConsole.skyHold", "macConsole.health", "macConsole.open", "operatorConsole.hold",
                    "operatorConsole.resume", "operatorConsole.sendFor", "admin.stationAlert.ptt_failed", "admin.healthStation"]
        for k in keys { #expect(Words(.faith)(k) != k, "\(k)") }
        #expect(Words(.faith)("macConsole.problemCount", count: 2) == "2 problems")
    }
}

extension APIClientTests {
    @Test func holdsAndSendsForAWhileThroughTheConsole() async throws {
        StubProtocol.answer = (404, #"{"error":{"code":"not_found","message":"Operator console not found"}}"#)
        await #expect(throws: APIError.self) { try await client().radioConsole() }
        StubProtocol.answer = (200, #"{"enabled":true,"health":null,"acks":{"enabled":false}}"#)
        #expect(try await client().radioHealth().health == nil)
        StubProtocol.answer = (403, #"{"error":{"code":"forbidden","message":"Admins only"}}"#)
        await #expect(throws: APIError.self) { try await client().radioHealth() }
    }

    @Test func sendsOnlyTheOverrideItChanges() async throws {
        StubProtocol.answer = (500, #"{"error":{"code":"x","message":"x"}}"#)
        _ = try? await client().updateRadioConsole(windowOverrideMinutes: 30)
        let req = try #require(StubProtocol.seen.last)
        #expect(req.httpMethod == "PATCH" && req.url?.path == "/radio/console")
        #expect(String(decoding: try #require(req.httpBody), as: UTF8.self) == #"{"windowOverrideMinutes":30}"#)
    }
}

import Foundation

// The operator console for the station's control operator (server radio/console.ts,
// docs/STATION_OPERATOR_GUIDE.md "Operator console"), for the native Mac console app: what is
// waiting, whether the station may transmit and why not, the ID timer, problems, relays, the
// reception beacon, the dish target, the log, and the two overrides. Off (a 404) until an admin
// turns operator_console_enabled on; admins and radio operators use it.

/// A station health alert (server radio/health.ts).
public struct StationAlert: Codable, Sendable, Equatable, Identifiable {
    /// no_audio_device | ptt_failed | burst_failed | burst_overdue | station_silent | listener_silent | queue_empty
    public let kind: String
    /// problem | info
    public let level: String
    public let detail: String
    public let callSign: String?
    public let since: String?
    public var id: String { "\(kind):\(callSign ?? "")" }
}

/// Where the dish points now (server radio/sky.ts); nil while dish pointing is off.
public struct SkyNow: Codable, Sendable, Equatable {
    public struct Next: Codable, Sendable, Equatable {
        public let at: String
        public let rising: Bool
    }
    /// zenith | moon | alpha_centauri | custom
    public let target: String
    public let name: String?
    public let az: Double
    public let el: Double
    public let aboveMinimum: Bool
    public let minElevation: Double
    public let holdBelow: Bool
    public let next: Next?
}

public struct RadioBeacon: Codable, Sendable, Equatable, Identifiable {
    public struct Heard: Codable, Sendable, Equatable {
        public let by: String
        public let snrDb: Double
    }
    public let id: String
    public let sentAt: String?
    public let status: String
    public let callSign: String?
    public let preset: String?
    public let heard: [Heard]
}

public struct RadioConsole: Codable, Sendable, Equatable {
    public struct Schedule: Codable, Sendable, Equatable {
        public let enabled: Bool
        public let timeZone: String
        public let inWindow: Bool
    }
    public struct Waiting: Codable, Sendable, Equatable, Identifiable {
        public let id: String
        public let text: String
        public let urgency: Int
        public let repeats: Int
        public let waitingMinutes: Int
    }
    public struct Queue: Codable, Sendable, Equatable {
        public let queued: Int
        public let sending: Int
        public let oldestMinutes: Int?
        public let next: [Waiting]
    }
    public struct Station: Codable, Sendable, Equatable, Identifiable {
        public let callSign: String
        public let lastHeartbeat: String
        public let lastIdAt: String?
        public let everyMinutes: Int?
        public let nextIdAt: String?
        public var id: String { callSign }
    }
    public struct LogRow: Codable, Sendable, Equatable {
        public let at: String
        public let callSign: String?
        public let station: String
        public let preset: String
        public let status: String
        public let heard: Bool
        public let error: String?
        public let text: String
    }
    public struct Beacon: Codable, Sendable, Equatable {
        public let enabled: Bool
        public let minutes: Int
        public let recent: [RadioBeacon]
    }
    public struct Ceaseless: Codable, Sendable, Equatable {
        public let enabled: Bool
        public let gapMinutes: Int
        public let inRotation: Int
        public let sentLastDay: Int
    }
    public struct Relay: Codable, Sendable, Equatable, Identifiable {
        public let node: String
        public let reportedAt: String
        public let callSign: String
        public let relayedLastHour: Int
        public let secondsLastHour: Double
        public let budgetSeconds: Double
        public let skipped: [String: Int]
        public var id: String { node }
    }

    public let paused: Bool
    public let problems: [StationAlert]
    public let windowOverrideUntil: String?
    public let onAirNow: Bool
    public let schedule: Schedule
    public let queue: Queue
    public let stations: [Station]
    public let log: [LogRow]
    public let beacon: Beacon
    public let sky: SkyNow?
    public let ceaseless: Ceaseless?
    public let relays: [Relay]
}

/// Admin → Radio → Station health (server radio/health.ts overview). `health` is nil while it is off.
public struct StationHealth: Codable, Sendable, Equatable {
    public struct Overview: Codable, Sendable, Equatable {
        public struct Check: Codable, Sendable, Equatable {
            public let name: String
            public let ok: Bool
            public let detail: String
        }
        public struct Station: Codable, Sendable, Equatable, Identifiable {
            public let callSign: String
            public let lastHeartbeat: String?
            public let silent: Bool
            public let checks: [Check]
            public let bursts24h: Int
            public let failed24h: Int
            public let prayers24h: Int
            public let lastBurstAt: String?
            public let lastError: String?
            public var id: String { callSign }
        }
        public struct Queue: Codable, Sendable, Equatable {
            public let queued: Int
            public let sending: Int
            public let oldestMinutes: Int?
        }
        public struct Listener: Codable, Sendable, Equatable, Identifiable {
            public let name: String
            public let lastHeartbeat: String?
            public let silent: Bool
            public var id: String { name }
        }
        public struct Heard: Codable, Sendable, Equatable {
            public let node: String
            public let callSign: String
            public let preset: String
            public let snrDb: Double
            public let at: String
        }
        public struct Snr: Codable, Sendable, Equatable {
            public let callSign: String
            public let preset: String
            public let reports: Int
            public let avgDb: Double
            public let minDb: Double
            public let lastAt: String
        }
        public struct Failure: Codable, Sendable, Equatable {
            public let at: String
            public let callSign: String?
            /// burst | prayer
            public let kind: String
            public let error: String
        }
        public let stations: [Station]
        public let queue: Queue
        public let listeners: [Listener]
        public let lastHeard: [Heard]
        public let snr: [Snr]
        public let failures: [Failure]
    }
    public let enabled: Bool
    public let health: Overview?
}

/// The console's keying controls and their safety rules (docs/CONTROL_OPERATOR_QUICK_START.md:
/// "If the radio is stuck transmitting, press Hold first").
/// - Hold is always offered and never asks: stopping must take one click.
/// - Anything that lets the station key the radio (Resume, Send for N minutes) asks first, and is
///   not offered while the radio failed to key or may be stuck transmitting (a `ptt_failed` problem).
/// - Send for N minutes needs transmission windows (outside them it means nothing) and no hold,
///   since a hold outranks it on the server.
/// - The operator is told when no station has reported in, when a station is due to identify, and
///   when the dish target holds transmissions, since the override does not lift that hold.
public struct Keying: Sendable, Equatable {
    public static let sendForMinutes = [15, 30, 60]

    public enum State: String, Sendable { case held, override, onAir, offAir }

    public let state: State
    public let canHold: Bool
    public let canResume: Bool
    public let canSendFor: Bool
    public let canEndOverride: Bool
    /// Words keys (with values) explaining why something is not offered, or what to watch.
    public let notes: [Note]

    public struct Note: Sendable, Equatable, Hashable {
        public let key: String
        public let vars: [String: String]
        public init(_ key: String, _ vars: [String: String] = [:]) {
            self.key = key
            self.vars = vars
        }
    }

    public init(_ c: RadioConsole, now: Date = .now) {
        state = c.paused ? .held : c.windowOverrideUntil != nil ? .override : c.onAirNow ? .onAir : .offAir
        let pttProblem = c.problems.contains { $0.kind == "ptt_failed" }
        canHold = !c.paused
        canResume = c.paused && !pttProblem
        canSendFor = !c.paused && !pttProblem && c.schedule.enabled
        canEndOverride = c.windowOverrideUntil != nil
        var notes: [Note] = []
        if pttProblem { notes.append(Note("macConsole.pttBlocked")) }
        if c.paused && c.schedule.enabled && !pttProblem { notes.append(Note("macConsole.resumeFirst")) }
        if c.stations.isEmpty { notes.append(Note("macConsole.noStation")) }
        for s in c.stations {
            if let next = s.nextIdAt.flatMap(Keying.date), next <= now { notes.append(Note("macConsole.idDue", ["callSign": s.callSign])) }
        }
        if let sky = c.sky, !sky.aboveMinimum, sky.holdBelow { notes.append(Note("macConsole.skyHold")) }
        self.notes = notes
    }

    /// Server times come with or without fractional seconds.
    public static func date(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }

    /// Minutes from now until an ISO time, rounded as the Expo console does (negative when past).
    public static func minutes(until iso: String, now: Date = .now) -> Int? {
        date(iso).map { Int(($0.timeIntervalSince(now) / 60).rounded()) }
    }
}

private struct ConsolePatch: Encodable {
    let paused: Bool?
    let windowOverrideMinutes: Int?
}

extension APIClient {
    /// A 404 while the operator console switch is off; a 403 for members who aren't operators.
    public func radioConsole() async throws -> RadioConsole { try await get("/radio/console") }
    /// Hold or resume everything, or send outside the windows for 1–240 minutes (0 ends it).
    public func updateRadioConsole(paused: Bool? = nil, windowOverrideMinutes: Int? = nil) async throws -> RadioConsole {
        try await send(body(request("PATCH", "/radio/console"), ConsolePatch(paused: paused, windowOverrideMinutes: windowOverrideMinutes)))
    }
    /// Admins only (a 403 for radio operators).
    public func radioHealth() async throws -> StationHealth { try await get("/admin/radio-health") }
}

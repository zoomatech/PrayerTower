import Foundation

// Admin → Radio, as the Expo admin screen's radio part (apps/mobile/src/app/admin.tsx): how prayers
// go on the air (log only or a station, order, burst size), the Priestly token fund, the radio
// switches, station health and acknowledgements, station alerts, listener and station nodes with
// their SNR reports, and the latest bursts. Admins only. `RadioAdminDemo` is sample data for
// builds with no server or account.

/// `GET /admin/radio-settings`.
public struct AdminRadioSettings: Codable, Sendable, Equatable {
    /// log | station
    public var radio_transmitter: String
    public var radio_station_requires_free: Bool
    public var radio_max_chars: Int
    public var radio_amplify_repeats: Int
    /// oldest | need
    public var radio_order: String
    public var radio_urgent_first: Bool
    /// Most prayers the station may claim at once (burst mode); 1 = one at a time.
    public var radio_batch_max: Int
    public var listen_page_enabled: Bool
    public var radio_receipts_enabled: Bool
    public var on_air_page_enabled: Bool

    public var station: Bool { radio_transmitter == "station" }
    public var burst: Bool { radio_batch_max > 1 }
}

/// `GET /admin/radio-alerts`.
public struct StationAlerts: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var overdueMinutes: Int
    public var alerts: [StationAlert]
}

public struct RadioNode: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    /// listener | station
    public let role: String
    public var enabled: Bool
    public let created_at: String
    public let last_seen_at: String?

    public init(id: String, name: String, role: String, enabled: Bool, created_at: String, last_seen_at: String?) {
        self.id = id
        self.name = name
        self.role = role
        self.enabled = enabled
        self.created_at = created_at
        self.last_seen_at = last_seen_at
    }
}

/// `GET /admin/radio-nodes`: listener nodes (and extra stations) with their latest SNR reports.
public struct RadioNodes: Codable, Sendable, Equatable {
    public struct StationCount: Codable, Sendable, Equatable {
        /// nil is the main station.
        public let node: String?
        public let sending: Int
        public let sent: Int
    }
    public struct Report: Codable, Sendable, Equatable {
        public let node: String
        public let call_sign: String
        public let preset: String
        public let snr_db: Double
        public let heard_at: String
    }
    public var enabled: Bool
    public var multiStation: Bool
    public var signaturesRequired: Bool
    public var stations: [StationCount]
    public var nodes: [RadioNode]
    public var reports: [Report]

    /// As the Expo screen: listeners while listener nodes are on, extra stations while several stations are.
    public var shown: [RadioNode] { nodes.filter { $0.role == "listener" ? enabled : multiStation } }
}

/// One burst the station sent (`GET /admin/radio-bursts`).
public struct StationBurst: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let created_at: String
    public let call_sign: String
    /// audio | fldigi | simulate
    public let mode: String
    public let preset: String
    public let prayers: Int
    public let frames: Int
    public let bytes: Int
    public let seconds: Double
    /// Prayers decoded back from the burst audio (simulate mode); nil when not checked.
    public let decoded: Int?
    public let ok: Bool
    public let error: String?

    /// Failed, or a receiver decoded fewer prayers than went out.
    public var troubled: Bool { !ok || (decoded.map { $0 != prayers } ?? false) }
}

/// The plain on/off radio switches, each `GET` and `PATCH {enabled}` on its own path.
public enum RadioSwitch: String, CaseIterable, Sendable, Identifiable {
    case heardTrail = "heard-trail"
    case scheduledRadio = "scheduled-radio"
    case signalQueue = "signal-queue"
    case console = "radio-console"
    case operatorAlerts = "radio-operator-alerts"
    case operatorLog = "operator-log"
    case listenerMode = "listener-mode"
    case packet = "radio-packet"

    public var id: String { rawValue }
    /// Only for a station transmitter, as the Expo screen.
    public var stationOnly: Bool { ![.heardTrail, .scheduledRadio, .signalQueue].contains(self) }
    public var label: String {
        switch self {
        case .heardTrail: "admin.heardTrail"
        case .scheduledRadio: "admin.scheduledRadio"
        case .signalQueue: "admin.signalQueue"
        case .console: "admin.radioConsoleOn"
        case .operatorAlerts: "admin.operatorAlerts"
        case .operatorLog: "admin.operatorLogOn"
        case .listenerMode: "admin.listenerModeOn"
        case .packet: "packet.on"
        }
    }
    public var hint: String {
        switch self {
        case .heardTrail: "admin.heardTrailHint"
        case .scheduledRadio: "admin.scheduledRadioHint"
        case .signalQueue: "admin.signalQueueHint"
        case .console: "admin.radioConsoleHint"
        case .operatorAlerts: "admin.operatorAlertsHint"
        case .operatorLog: "admin.operatorLogHint"
        case .listenerMode: "admin.listenerModeHint"
        case .packet: "packet.hint"
        }
    }
}

public enum RadioAdmin {
    public static let burstSizes = [1, 10, 50, 100, 500]
    public static let overdueMinutes = [15, 30, 60, 120]
    public static let ackTimeouts = [5, 10, 30, 60]
    public static let ackRetries = [0, 1, 2, 3]
    public static let dailyCaps: [Int?] = [nil, 3, 10, 30]
}

/// Station health with listener acknowledgements (`GET /admin/radio-health`).
public struct StationHealthAdmin: Codable, Sendable, Equatable {
    public struct Acks: Codable, Sendable, Equatable {
        public var enabled: Bool
        public var timeoutMinutes: Int
        public var maxRetries: Int
        public var heard: Int
        public var waiting: Int
        public var unheard: Int
        public var retried: Int
    }
    public var enabled: Bool
    public var health: StationHealth.Overview?
    public var acks: Acks
}

public struct FairAir: Codable, Sendable, Equatable {
    public var everyRequest: Bool
    public var dailyCap: Int?
}

private struct Enabled: Codable { let enabled: Bool }
private struct SettingsWrap: Decodable { let settings: AdminRadioSettings }
private struct Bursts: Decodable { let bursts: [StationBurst] }
private struct NodeWrap: Decodable { let node: RadioNode }
public struct NewRadioNode: Decodable, Sendable, Equatable {
    public let node: RadioNode
    /// Shown once; only its hash is kept.
    public let key: String
}
private struct NewNode: Encodable { let name: String; let role: String }
private struct NodesPatch: Encodable { let enabled: Bool?; let multiStation: Bool?; let signaturesRequired: Bool? }
private struct AlertsPatch: Encodable { let enabled: Bool?; let overdueMinutes: Int? }
private struct AcksPatch: Encodable { let enabled: Bool?; let timeoutMinutes: Int?; let maxRetries: Int? }
private struct HealthPatch: Encodable { let enabled: Bool?; let acks: AcksPatch? }
/// Encodes `dailyCap: null` when asked, since null means no cap.
private struct FairAirPatch: Encodable {
    let everyRequest: Bool?
    let dailyCap: Int??
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(everyRequest, forKey: .everyRequest)
        if let cap = dailyCap { try c.encode(cap, forKey: .dailyCap) }
    }
    enum CodingKeys: String, CodingKey { case everyRequest, dailyCap }
}

extension APIClient {
    public func radioSettings() async throws -> AdminRadioSettings { try await (get("/admin/radio-settings") as SettingsWrap).settings }
    /// Keys as PATCH /admin/radio-settings takes them: transmitter, stationRequiresFree, order, urgentFirst, batchMax, listenPage, receipts, onAirPage.
    public func updateRadioSettings(_ patch: [String: JSONValue]) async throws -> AdminRadioSettings {
        try await (send(body(request("PATCH", "/admin/radio-settings"), patch)) as SettingsWrap).settings
    }
    public func radioSwitch(_ s: RadioSwitch) async throws -> Bool { try await (get("/admin/\(s.rawValue)") as Enabled).enabled }
    public func setRadioSwitch(_ s: RadioSwitch, _ on: Bool) async throws -> Bool {
        try await (send(body(request("PATCH", "/admin/\(s.rawValue)"), Enabled(enabled: on))) as Enabled).enabled
    }
    public func radioAlerts() async throws -> StationAlerts { try await get("/admin/radio-alerts") }
    public func updateRadioAlerts(enabled: Bool? = nil, overdueMinutes: Int? = nil) async throws -> StationAlerts {
        try await send(body(request("PATCH", "/admin/radio-alerts"), AlertsPatch(enabled: enabled, overdueMinutes: overdueMinutes)))
    }
    public func radioHealthAdmin() async throws -> StationHealthAdmin { try await get("/admin/radio-health") }
    public func updateRadioHealth(enabled: Bool? = nil, acksEnabled: Bool? = nil, ackTimeout: Int? = nil, ackRetries: Int? = nil) async throws -> StationHealthAdmin {
        let acks = acksEnabled == nil && ackTimeout == nil && ackRetries == nil ? nil : AcksPatch(enabled: acksEnabled, timeoutMinutes: ackTimeout, maxRetries: ackRetries)
        return try await send(body(request("PATCH", "/admin/radio-health"), HealthPatch(enabled: enabled, acks: acks)))
    }
    public func radioNodes() async throws -> RadioNodes { try await get("/admin/radio-nodes") }
    public func updateRadioNodes(enabled: Bool? = nil, multiStation: Bool? = nil, signaturesRequired: Bool? = nil) async throws -> Ignored {
        try await send(body(request("PATCH", "/admin/radio-nodes"), NodesPatch(enabled: enabled, multiStation: multiStation, signaturesRequired: signaturesRequired)))
    }
    public func addRadioNode(name: String, role: String) async throws -> NewRadioNode {
        try await post("/admin/radio-nodes", body: NewNode(name: name.trimmingCharacters(in: .whitespaces), role: role))
    }
    public func setRadioNode(_ id: String, enabled: Bool) async throws -> RadioNode {
        try await (send(body(request("PATCH", "/admin/radio-nodes/\(id)"), Enabled(enabled: enabled))) as NodeWrap).node
    }
    public func removeRadioNode(_ id: String) async throws -> Ignored { try await send(request("DELETE", "/admin/radio-nodes/\(id)")) }
    public func radioBursts() async throws -> [StationBurst] { try await (get("/admin/radio-bursts") as Bursts).bursts }
    public func fairAir() async throws -> FairAir { try await get("/admin/radio-fair-air") }
    /// `dailyCap: .some(nil)` removes the cap.
    public func updateFairAir(everyRequest: Bool? = nil, dailyCap: Int?? = nil) async throws -> FairAir {
        try await send(body(request("PATCH", "/admin/radio-fair-air"), FairAirPatch(everyRequest: everyRequest, dailyCap: dailyCap)))
    }
}

/// Sample data for Admin → Radio with no server or account: changes stay on the sample.
public struct RadioAdminDemo: Sendable, Equatable {
    public var settings: AdminRadioSettings
    public var tokens: AdminTokenSettings
    public var switches: [RadioSwitch: Bool]
    public var alerts: StationAlerts
    public var health: StationHealthAdmin
    public var nodes: RadioNodes
    public var bursts: [StationBurst]
    public var fairAir: FairAir

    public init(now: Date = .now) {
        let iso = { (minutes: Double) in Keying.isoString(now.addingTimeInterval(minutes * 60)) }
        settings = AdminRadioSettings(radio_transmitter: "station", radio_station_requires_free: false, radio_max_chars: 280, radio_amplify_repeats: 3,
                                      radio_order: "need", radio_urgent_first: true, radio_batch_max: 50, listen_page_enabled: true,
                                      radio_receipts_enabled: true, on_air_page_enabled: false)
        tokens = AdminTokenSettings(priestly_prayers_per_token: 10, verified_prayer_min_gap_seconds: 60, radio_prayer_cost: 1, radio_funding: "free",
                                    verified_prayers_per_day: 50, amplify_paid_cost: nil)
        switches = Dictionary(uniqueKeysWithValues: RadioSwitch.allCases.map { ($0, [.heardTrail, .signalQueue, .console].contains($0)) })
        alerts = StationAlerts(enabled: true, overdueMinutes: 30, alerts: [
            StationAlert(kind: "queue_empty", level: "info", detail: "", callSign: nil, since: iso(-20)),
        ])
        let demo = ConsoleDemo(now: now)
        health = StationHealthAdmin(enabled: true, health: demo.health.health,
                                    acks: .init(enabled: true, timeoutMinutes: 10, maxRetries: 1, heard: 38, waiting: 2, unheard: 1, retried: 1))
        nodes = RadioNodes(enabled: true, multiStation: false, signaturesRequired: false,
                           stations: [.init(node: nil, sending: 0, sent: 42)],
                           nodes: [RadioNode(id: "demo-n1", name: "Hilltop", role: "listener", enabled: true, created_at: iso(-60 * 24 * 7), last_seen_at: iso(-2)),
                                   RadioNode(id: "demo-n2", name: "Church roof", role: "listener", enabled: true, created_at: iso(-60 * 24 * 3), last_seen_at: iso(-9))],
                           reports: [.init(node: "Hilltop", call_sign: "N0CALL", preset: "fm-standard", snr_db: 14.2, heard_at: iso(-4)),
                                     .init(node: "Church roof", call_sign: "N0CALL", preset: "fm-standard", snr_db: 6.8, heard_at: iso(-4))])
        bursts = [
            StationBurst(id: "3", created_at: iso(-4), call_sign: "N0CALL", mode: "simulate", preset: "fm-standard", prayers: 12, frames: 3, bytes: 260,
                         seconds: 1.12, decoded: 12, ok: true, error: nil),
            StationBurst(id: "2", created_at: iso(-30), call_sign: "N0CALL", mode: "simulate", preset: "fm-standard", prayers: 8, frames: 2, bytes: 180,
                         seconds: 0.86, decoded: nil, ok: false, error: "Sample: PTT timed out"),
        ]
        fairAir = FairAir(everyRequest: true, dailyCap: 10)
    }

    public mutating func setFunding(free: Bool) {
        let t = tokens
        tokens = AdminTokenSettings(priestly_prayers_per_token: t.priestly_prayers_per_token, verified_prayer_min_gap_seconds: t.verified_prayer_min_gap_seconds,
                                    radio_prayer_cost: t.radio_prayer_cost, radio_funding: free ? "free" : "tokens",
                                    verified_prayers_per_day: t.verified_prayers_per_day, amplify_paid_cost: t.amplify_paid_cost)
    }

    /// Adds a sample node; the sample never makes a real key.
    public mutating func addNode(name: String, role: String, now: Date = .now) {
        nodes.nodes.append(RadioNode(id: "demo-\(nodes.nodes.count + 1)", name: name.trimmingCharacters(in: .whitespaces), role: role, enabled: true,
                                     created_at: Keying.isoString(now), last_seen_at: nil))
    }
}

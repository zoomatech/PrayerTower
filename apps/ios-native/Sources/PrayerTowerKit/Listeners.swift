import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Listener requests, thank-you cards and the weekly station report (Admin → Radio, and the Mac
// console for radio operators; docs/STATION_OPERATOR_GUIDE.md "Listener sign-up", "Thank-you
// cards", "Weekly station report"). Each is off until an admin turns it on. `ListenerDemo` is
// sample data for when no server or account is set up.

/// One request to run a listener node (`GET /admin/listener-signups`).
public struct ListenerSignup: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let email: String
    public let place: String
    public let lat: Double?
    public let lon: Double?
    /// rtl-sdr | radio | not-sure
    public let receiver: String
    /// pi | mac | other
    public let platform: String
    public let callSign: String?
    public let note: String
    /// prayer-tower | open-circle
    public let edition: String
    /// pending | approved | declined | joined
    public var status: String
    public let setupExpiresAt: String?
    public let nodeId: String?
    public let createdAt: String

    public init(id: String, name: String, email: String, place: String = "", lat: Double? = nil, lon: Double? = nil, receiver: String, platform: String, callSign: String? = nil,
                note: String = "", edition: String = "prayer-tower", status: String = "pending", setupExpiresAt: String? = nil, nodeId: String? = nil, createdAt: String) {
        self.id = id; self.name = name; self.email = email; self.place = place; self.lat = lat; self.lon = lon
        self.receiver = receiver; self.platform = platform; self.callSign = callSign; self.note = note; self.edition = edition
        self.status = status; self.setupExpiresAt = setupExpiresAt; self.nodeId = nodeId; self.createdAt = createdAt
    }
}

public struct ListenerSignups: Codable, Sendable, Equatable {
    public var enabled: Bool
    /// Approving emails the setup link only when email is set up; otherwise the admin sends it.
    public let emailReady: Bool
    public var signups: [ListenerSignup]
}

public struct ListenerApproval: Codable, Sendable, Equatable {
    public let signup: ListenerSignup
    public let setupUrl: String
    public let emailed: Bool
}

/// A thank-you card for confirmed reception (`GET /admin/qsl-cards`).
public struct QslCard: Codable, Sendable, Equatable, Identifiable {
    public var id: String { token }
    public let token: String
    public let path: String
    public let node: String
    public let callSign: String
    public let day: String
    public let serial: Int
    public let preset: String
    public let bestSnrDb: Double
    public let prayers: Int
    public let firstHeardAt: String
    public let lastHeardAt: String
    public let edition: String
}

public struct QslCards: Codable, Sendable, Equatable {
    public var enabled: Bool
    public let cards: [QslCard]
}

/// One week of the station's work (`GET /admin/station-report`), Monday to Sunday, UTC.
public struct StationReport: Codable, Sendable, Equatable {
    public struct Bursts: Codable, Sendable, Equatable {
        public let sent: Int
        public let failed: Int
        public let airSeconds: Int
        public let prayers: Int
        public let presets: [String: Int]
    }
    public struct Prayers: Codable, Sendable, Equatable {
        public let delivered: Int
        public let heard: Int
        public let failed: Int
        public let waiting: Int
    }
    public struct NodeWeek: Codable, Sendable, Equatable {
        public let name: String
        public let receiver: String?
        public let reports: Int
        public let snrDb: Double?
        /// strong | fair | weak | none
        public let quality: String
    }
    public struct Listeners: Codable, Sendable, Equatable {
        public let nodes: Int
        public let reporting: Int
        public let quiet: [String]
        public let placed: Int
        public let signups: Int
        public let joined: Int
        public let cards: Int
        public let perNode: [NodeWeek]
    }
    public struct BurstError: Codable, Sendable, Equatable {
        public let error: String
        public let count: Int
    }
    public struct Problems: Codable, Sendable, Equatable {
        public let total: Int
        public let byKind: [String: Int]
        public let burstErrors: [BurstError]
    }
    public let weekStart: String
    public let bursts: Bursts
    public let prayers: Prayers
    public let listeners: Listeners
    public let problems: Problems

    /// "45 s", or "12 min" from a minute and a half up.
    public var airTime: String { bursts.airSeconds < 90 ? "\(bursts.airSeconds) s" : "\(Int((Double(bursts.airSeconds) / 60).rounded())) min" }
}

public struct StationReportOverview: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var email: Bool
    public let thisWeek: StationReport?
    public let lastWeek: StationReport?
    public let history: [StationReport]
}

private struct OnOff: Encodable { let enabled: Bool }
private struct ReportPatch: Encodable { let enabled: Bool?; let email: Bool? }

extension APIClient {
    public func listenerSignups() async throws -> ListenerSignups { try await get("/admin/listener-signups") }
    public func setListenerSignups(enabled: Bool) async throws -> ListenerSignups {
        try await send(body(request("PATCH", "/admin/listener-signups"), OnOff(enabled: enabled)))
    }
    /// A new one-use setup link (14 days), emailed when email is set up.
    public func approveListener(_ id: String) async throws -> ListenerApproval { try await send(request("POST", "/admin/listener-signups/\(id)/approve")) }
    public func declineListener(_ id: String) async throws {
        let _: [String: ListenerSignup] = try await send(request("POST", "/admin/listener-signups/\(id)/decline"))
    }
    public func qslCards() async throws -> QslCards { try await get("/admin/qsl-cards") }
    public func setQslCards(enabled: Bool) async throws -> QslCards { try await send(body(request("PATCH", "/admin/qsl-cards"), OnOff(enabled: enabled))) }
    /// Admins and radio operators read it; only admins switch it.
    public func stationReport() async throws -> StationReportOverview { try await get("/admin/station-report") }
    public func updateStationReport(enabled: Bool? = nil, email: Bool? = nil) async throws -> StationReportOverview {
        try await send(body(request("PATCH", "/admin/station-report"), ReportPatch(enabled: enabled, email: email)))
    }
}

/// Sample data with no server or account: two requests waiting, cards from the coverage
/// sample's nodes, and two weeks of station reports. Changes stay on the sample.
public struct ListenerDemo: Sendable {
    public var signups: ListenerSignups
    public var cards: QslCards
    public var report: StationReportOverview

    public init(now: Date = .now) {
        let iso = ISO8601DateFormatter()
        func at(_ days: Double) -> String { iso.string(from: now.addingTimeInterval(days * 86_400)) }
        func day(_ days: Double) -> String { String(at(days).prefix(10)) }
        signups = ListenerSignups(enabled: true, emailReady: false, signups: [
            ListenerSignup(id: "demo-s1", name: "Ruth", email: "ruth@example.com", place: "Jacksonville, IL", lat: 39.7, lon: -90.2, receiver: "rtl-sdr", platform: "pi",
                           note: "I have a dongle and an old Pi 4.", createdAt: at(-1)),
            ListenerSignup(id: "demo-s2", name: "Dale", email: "dale@example.com", place: "Lincoln, IL", receiver: "radio", platform: "mac", callSign: "KD9XYZ", createdAt: at(-2)),
            ListenerSignup(id: "demo-s3", name: "Church roof", email: "roof@example.com", place: "Chatham, IL", receiver: "rtl-sdr", platform: "pi", status: "joined",
                           nodeId: "demo-n2", createdAt: at(-9)),
        ])
        func card(_ n: Int, _ node: String, _ d: Double, _ snr: Double, _ count: Int) -> QslCard {
            QslCard(token: "demo-card-\(n)", path: "/qsl/demo-card-\(n)", node: node, callSign: "N0CALL", day: day(d), serial: n, preset: "fm-standard", bestSnrDb: snr, prayers: count,
                    firstHeardAt: at(d), lastHeardAt: at(d), edition: "prayer-tower")
        }
        cards = QslCards(enabled: true, cards: [card(12, "Hilltop", 0, 24.5, 18), card(11, "Church roof, Chatham, IL", 0, 16.0, 15), card(10, "Hilltop", -1, 23.0, 22), card(9, "Farm kitchen", -1, 7.5, 4)])
        func week(_ start: String, sent: Int, air: Int, delivered: Int, heard: Int, reporting: Int, problems: Int, quiet: [String]) -> StationReport {
            StationReport(
                weekStart: start,
                bursts: .init(sent: sent, failed: problems > 0 ? 1 : 0, airSeconds: air, prayers: delivered, presets: ["fm-standard": sent]),
                prayers: .init(delivered: delivered, heard: heard, failed: problems > 1 ? 1 : 0, waiting: 2),
                listeners: .init(nodes: 4, reporting: reporting, quiet: quiet, placed: 4, signups: 2, joined: 1, cards: 7, perNode: [
                    .init(name: "Hilltop", receiver: "sound-card", reports: 31, snrDb: 24.5, quality: "strong"),
                    .init(name: "Church roof", receiver: "rtl-sdr", reports: 28, snrDb: 16.0, quality: "fair"),
                    .init(name: "Farm kitchen", receiver: "rtl-sdr", reports: 12, snrDb: 7.5, quality: "weak"),
                    .init(name: "Lake cabin", receiver: "sound-card", reports: 0, snrDb: nil, quality: "none"),
                ]),
                problems: .init(total: problems, byKind: problems > 0 ? ["listener_silent": 1] : [:], burstErrors: problems > 0 ? [.init(error: "PTT did not key", count: 1)] : []))
        }
        let monday = StationReportDemoDates.monday(of: now)
        report = StationReportOverview(
            enabled: true, email: false,
            thisWeek: week(monday(0), sent: 9, air: 140, delivered: 61, heard: 52, reporting: 3, problems: 0, quiet: ["Lake cabin"]),
            lastWeek: week(monday(-7), sent: 38, air: 610, delivered: 254, heard: 219, reporting: 3, problems: 3, quiet: ["Lake cabin"]),
            history: [])
    }

    public mutating func approve(_ id: String) {
        if let i = signups.signups.firstIndex(where: { $0.id == id }) { signups.signups[i].status = "approved" }
    }
    public mutating func decline(_ id: String) {
        if let i = signups.signups.firstIndex(where: { $0.id == id }) { signups.signups[i].status = "declined" }
    }
}

enum StationReportDemoDates {
    /// "YYYY-MM-DD" of the Monday (UTC) of `now`'s week, shifted by whole days.
    static func monday(of now: Date) -> (Int) -> String {
        var cal = Calendar(identifier: .iso8601)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let start = cal.dateInterval(of: .weekOfYear, for: now)!.start
        return { days in
            let f = DateFormatter()
            f.calendar = cal; f.timeZone = cal.timeZone; f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
            return f.string(from: start.addingTimeInterval(Double(days) * 86_400))
        }
    }
}

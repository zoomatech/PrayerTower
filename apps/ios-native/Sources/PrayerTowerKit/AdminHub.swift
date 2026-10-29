import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Admin home, as the Expo app's admin.tsx (its non-radio parts): metrics, the weekly pilot
// report and its downloads, token and new-member settings, tiers, milestone rules, and people
// with their roles. The radio settings stay with the radio screens.

public enum AdminHub {
    public static let periods = [7, 30, 90]
    public static let reportWeeks = 12
    public static let trend = ["requests_posted", "praying_now_taps", "commitments_made", "commitment_checkins"]
    public static let roles = ["admin", "moderator", "pastor_counselor", "witness", "prayer_partner", "radio_operator"]
    public static let ruleMetrics = ["prayers_for_others", "commitment_checkins", "answered_requests"]
    static let labels = ["ai_flags": "AI flags", "active_pray_ers": "Active pray-ers", "checkins": "Check-ins"]

    /// A metric's name: translated when known, otherwise the server's key made readable.
    public static func label(_ key: String, _ w: Words) -> String {
        let k = "admin.metric.\(key)"
        let t = w(k)
        if t != k { return t }
        if let l = labels[key] { return l }
        let spaced = key.replacingOccurrences(of: "_", with: " ")
        return spaced.prefix(1).uppercased() + spaced.dropFirst()
    }

    /// "12", "3.5" or "—".
    public static func show(_ v: JSONValue) -> String {
        switch v {
        case .int(let i): return String(i)
        case .number(let n): return n.rounded() == n ? String(Int(n)) : String(format: "%.1f", n)
        case .string(let s): return s
        case .bool(let b): return b ? "yes" : "no"
        default: return "—"
        }
    }
}

/// `/admin/metrics`: groups of named numbers, in the server's order where possible.
public struct AdminMetrics: Decodable, Sendable, Equatable {
    public struct Group: Sendable, Equatable, Identifiable {
        public let name: String
        public let values: [(key: String, value: JSONValue)]
        public var id: String { name }
        public static func == (a: Group, b: Group) -> Bool { a.name == b.name && a.values.map(\.key) == b.values.map(\.key) && a.values.map(\.value) == b.values.map(\.value) }
    }
    public let groups: [Group]

    public init(from decoder: Decoder) throws {
        let all = try [String: JSONValue](from: decoder)
        groups = all.keys.sorted().compactMap { name in
            guard case .object(let o) = all[name] else { return nil }
            return Group(name: name, values: o.keys.sorted().map { ($0, o[$0] ?? .null) })
        }
    }
}

public struct PilotWeek: Codable, Sendable, Equatable, Identifiable {
    public let week_start: String
    public let requests_posted: Int
    public let praying_now_taps: Int
    public let commitments_made: Int
    public let commitment_checkins: Int
    public var id: String { week_start }

    public func value(_ column: String) -> Int {
        switch column {
        case "requests_posted": return requests_posted
        case "praying_now_taps": return praying_now_taps
        case "commitments_made": return commitments_made
        default: return commitment_checkins
        }
    }
}

public struct AdminTokenSettings: Codable, Sendable, Equatable {
    public let priestly_prayers_per_token: Int
    public let verified_prayer_min_gap_seconds: Int
    public let radio_prayer_cost: Int
    /// tokens | free
    public let radio_funding: String
    public let verified_prayers_per_day: Int
    public let amplify_paid_cost: Int?
}

public struct AdminSafetySettings: Codable, Sendable, Equatable {
    public let new_member_limits_enabled: Bool
    public let new_member_hours: Int
    public let new_member_min_prayers: Int
    public let new_member_posts_per_day: Int
    public let new_member_comments_per_day: Int
    public let new_member_links_allowed: Bool
    public let posts_per_hour: Int
    public let comments_per_hour: Int
    public let messages_per_minute: Int
}

public struct AdminTier: Codable, Sendable, Equatable, Identifiable {
    public let tier: String
    public let label: String
    public let min_prayer_events: Int?
    public let weekly_allotment: Int?
    public var id: String { tier }
}

public struct MilestoneRule: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let label: String
    public let metric: String
    public let threshold: Int
    public let amount: Int
    /// regular | priestly
    public let currency: String
    public let enabled: Bool
    public let awarded: Int?
}

public struct AdminPerson: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let display_name: String
    public let email: String?
    public var roles: [String]
}

private struct TokenWrap: Decodable { let settings: AdminTokenSettings }
private struct SafetyWrap: Decodable { let settings: AdminSafetySettings }
private struct Weeks: Decodable { let weeks: [PilotWeek] }
private struct Tiers: Decodable { let tiers: [AdminTier] }
private struct Rules: Decodable { let rules: [MilestoneRule] }
private struct RuleWrap: Decodable { let rule: MilestoneRule }
private struct People: Decodable { let people: [AdminPerson] }
private struct Roles: Decodable { let roles: [String] }
private struct NewRule: Encodable { let label: String; let metric: String; let threshold: Int; let amount: Int }
private struct TierPatch: Encodable {
    let minPrayerEvents: Int?
    let weeklyAllotment: Int?
    enum CodingKeys: String, CodingKey { case minPrayerEvents, weeklyAllotment }
    // Blank sends null, which clears the number.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(minPrayerEvents, forKey: .minPrayerEvents)
        try c.encode(weeklyAllotment, forKey: .weeklyAllotment)
    }
}
private let nothing = [String: String]()

extension APIClient {
    /// A file the server makes (CSV, HTML, JSON), as bytes.
    func download(_ path: String, query: [String: String] = [:]) async throws -> Data {
        let (data, response) = try await session.data(for: try await request("GET", path, query: query))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw APIError(status: status, code: "http_\(status)", message: "Something went wrong (\(status))") }
        return data
    }

    public func adminMetrics(days: Int) async throws -> AdminMetrics { try await get("/admin/metrics", query: ["days": String(days)]) }
    public func pilotReport(weeks: Int = AdminHub.reportWeeks) async throws -> [PilotWeek] { try await (get("/admin/pilot-report", query: ["weeks": String(weeks)]) as Weeks).weeks }
    public func pilotCsv(weeks: Int = AdminHub.reportWeeks) async throws -> Data { try await download("/admin/pilot-report", query: ["weeks": String(weeks), "format": "csv"]) }
    public func pilotHtml(weeks: Int = AdminHub.reportWeeks) async throws -> Data { try await download("/admin/pilot-report", query: ["weeks": String(weeks), "format": "html", "lang": "en"]) }

    public func tokenSettings() async throws -> AdminTokenSettings { try await (get("/admin/token-settings") as TokenWrap).settings }
    public func updateTokenSettings(_ patch: [String: JSONValue]) async throws -> AdminTokenSettings {
        try await (send(body(request("PATCH", "/admin/token-settings"), patch)) as TokenWrap).settings
    }
    public func safetySettings() async throws -> AdminSafetySettings { try await (get("/admin/safety-settings") as SafetyWrap).settings }
    public func updateSafetySettings(_ patch: [String: JSONValue]) async throws -> AdminSafetySettings {
        try await (send(body(request("PATCH", "/admin/safety-settings"), patch)) as SafetyWrap).settings
    }

    public func tiers() async throws -> [AdminTier] { try await (get("/admin/tiers") as Tiers).tiers }
    public func updateTier(_ tier: String, min: Int?, weekly: Int?) async throws -> Ignored {
        try await send(body(request("PATCH", "/admin/tiers/\(tier)"), TierPatch(minPrayerEvents: min, weeklyAllotment: weekly)))
    }

    public func milestones() async throws -> [MilestoneRule] { try await (get("/admin/milestones") as Rules).rules }
    public func addMilestone(label: String, metric: String, threshold: Int, amount: Int) async throws -> MilestoneRule {
        try await (post("/admin/milestones", body: NewRule(label: label.trimmingCharacters(in: .whitespaces), metric: metric, threshold: threshold, amount: amount)) as RuleWrap).rule
    }
    public func setMilestone(_ id: String, enabled: Bool) async throws -> MilestoneRule {
        try await (send(body(request("PATCH", "/admin/milestones/\(id)"), ["enabled": enabled])) as RuleWrap).rule
    }

    public func adminPeople(_ q: String) async throws -> [AdminPerson] { try await (get("/admin/people", query: ["q": q.trimmingCharacters(in: .whitespaces)]) as People).people }
    /// Grants or takes away a role; returns the person's roles now.
    public func setRole(_ person: String, _ role: String, on: Bool) async throws -> [String] {
        try await (send(request(on ? "PUT" : "DELETE", "/admin/people/\(person)/roles/\(role)")) as Roles).roles
    }
    public func resetTwoStep(_ person: String) async throws -> Ignored { try await post("/admin/people/\(person)/two-step-reset", body: nothing) }
}

extension Dictionary where Key == String, Value == JSONValue {
    /// Whole numbers typed in fields, leaving out blanks and anything not a number.
    public static func numbers(_ fields: [String: String]) -> [String: JSONValue] {
        fields.compactMapValues { Staff.whole($0).map(JSONValue.int) }
    }
}

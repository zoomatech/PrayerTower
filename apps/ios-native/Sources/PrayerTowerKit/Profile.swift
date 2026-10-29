import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The member's tier on Me (`GET /me/tier`). Labels are server text: show them through `Words.server`.
public struct TierStatus: Codable, Sendable, Equatable {
    public struct Tier: Codable, Sendable, Equatable {
        public let tier: String
        public let label: String
    }
    public struct Next: Codable, Sendable, Equatable {
        public let tier: String
        public let label: String
        public let prayersNeeded: Int
    }
    public struct Upkeep: Codable, Sendable, Equatable {
        public let days: Int
        public let held: Tier?
    }
    public let tier: Tier?
    public let prayers: Int
    public let next: Next?
    public let upkeep: Upkeep?
}

/// Tokens on Me (`GET /me/tokens`).
public struct TokenSummary: Codable, Sendable, Equatable {
    public struct Priestly: Codable, Sendable, Equatable {
        public let balance: Int
        public let towardNext: Int
        public let prayersPerToken: Int
        /// Priestly tokens one radio prayer costs (0 while radio prayers are free).
        public var radioPrayerCost: Int? = nil
        /// How many times Amplify sends it; nil when Amplify isn't available.
        public var amplifyRepeats: Int? = nil
        /// Priestly tokens one Amplify costs; nil when paid Amplify is off.
        public var amplifyCost: Int? = nil
    }
    public let balance: Int
    public let priestly: Priestly
}

/// One settings switch on Me, and the `PATCH /me` field it sets.
public struct SettingSwitch: Sendable, Equatable, Identifiable {
    public let field: String
    public let label: String
    public let hint: String?
    public var id: String { field }
}

public enum ProfileSettings {
    /// The switches in the Expo app's Settings, in its order. Firmer reminders shows only while
    /// reminders are on.
    public static func switches(for p: Profile) -> [SettingSwitch] {
        var out = [
            SettingSwitch(field: "traumaContentOptOut", label: "settings.traumaOptOut", hint: nil),
            SettingSwitch(field: "anonymousByDefault", label: "settings.anonymous", hint: nil),
            SettingSwitch(field: "promptsEnabled", label: "settings.prompts", hint: nil),
        ]
        if p.promptsEnabled == true { out.append(SettingSwitch(field: "promptTone", label: "settings.firm", hint: "settings.firmHint")) }
        out += [
            SettingSwitch(field: "updatesInFirstComment", label: "settings.updatesFirst", hint: nil),
            SettingSwitch(field: "showPrayerStats", label: "stats.toggle", hint: "stats.toggleHint"),
            SettingSwitch(field: "digestEnabled", label: "settings.digest", hint: "settings.digestHint"),
        ]
        return out
    }

    public static func value(_ field: String, in p: Profile) -> Bool {
        switch field {
        case "traumaContentOptOut": p.traumaContentOptOut ?? false
        case "anonymousByDefault": p.anonymousByDefault ?? false
        case "promptsEnabled": p.promptsEnabled ?? false
        case "promptTone": p.promptTone == "firm"
        case "updatesInFirstComment": p.updatesInFirstComment ?? false
        case "showPrayerStats": p.showPrayerStats != false
        case "digestEnabled": p.digestEnabled ?? false
        default: false
        }
    }

    /// The `PATCH /me` body for turning a switch on or off.
    public static func patch(_ field: String, on: Bool) -> [String: JSONValue] {
        field == "promptTone" ? [field: .string(on ? "firm" : "gentle")] : [field: .bool(on)]
    }
}

/// A small JSON value for PATCH bodies that mix types.
public enum JSONValue: Encodable, Sendable, Equatable {
    case bool(Bool)
    case string(String)
    case int(Int)
    case array([JSONValue])
    case object([String: JSONValue])
    case null

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .bool(let b): try c.encode(b)
        case .string(let s): try c.encode(s)
        case .int(let i): try c.encode(i)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        case .null: try c.encodeNil()
        }
    }
}

/// Which phone alerts are on, and quiet hours (`notification_prefs` on the profile).
public struct NotificationPrefs: Codable, Sendable, Equatable {
    public struct Quiet: Codable, Sendable, Equatable {
        public var start: String
        public var end: String
        public var timeZone: String
        public init(start: String, end: String, timeZone: String) {
            self.start = start
            self.end = end
            self.timeZone = timeZone
        }
    }
    /// Categories whose pushes are off; they still appear under Notices.
    public var off: [String]
    public var quietHours: Quiet?

    public init(off: [String] = [], quietHours: Quiet? = nil) {
        self.off = off
        self.quietHours = quietHours
    }

    /// NOTIFICATION_CATEGORIES in packages/shared, in its order.
    public static let categories = ["prayers", "promises", "encouragement", "messages", "community", "tokens"]
    public static let starts = ["20:00", "21:00", "22:00", "23:00"]
    public static let ends = ["06:00", "07:00", "08:00", "09:00"]

    public func isOn(_ category: String) -> Bool { !off.contains(category) }

    public func setting(_ category: String, on: Bool) -> NotificationPrefs {
        var p = self
        p.off = on ? off.filter { $0 != category } : off + [category]
        return p
    }

    /// Quiet hours on or off, or a new start or end; the window follows the phone's time zone.
    public func quiet(on: Bool, start: String? = nil, end: String? = nil, timeZone: String = TimeZone.current.identifier) -> NotificationPrefs {
        var p = self
        p.quietHours = on ? Quiet(start: start ?? quietHours?.start ?? "22:00", end: end ?? quietHours?.end ?? "07:00", timeZone: timeZone) : nil
        return p
    }

    /// The `PATCH /me` body.
    public var patch: [String: JSONValue] {
        let quiet: JSONValue = quietHours.map { .object(["start": .string($0.start), "end": .string($0.end), "timeZone": .string($0.timeZone)]) } ?? .null
        return ["notificationPrefs": .object(["off": .array(off.map(JSONValue.string)), "quietHours": quiet])]
    }
}

private struct ProfileWrapper: Decodable { let profile: Profile }
private struct Donation: Encodable { let amount: Int; let idempotencyKey: String }

extension APIClient {
    public func tier() async throws -> TierStatus { try await get("/me/tier") }
    public func tokens() async throws -> TokenSummary { try await get("/me/tokens") }
    public func updateMe(_ patch: [String: JSONValue]) async throws -> Profile {
        try await (send(body(request("PATCH", "/me"), patch)) as ProfileWrapper).profile
    }
    public func donatePriestly(_ amount: Int = 1) async throws -> Ignored {
        try await post("/tokens/priestly/donate", body: Donation(amount: amount, idempotencyKey: "donate-\(UUID().uuidString)"))
    }
    /// Everything on the member's account, as the JSON file the server sends.
    public func exportMyData() async throws -> Data {
        let r = try await request("GET", "/me/export")
        let (data, response) = try await session.data(for: r)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw APIError(status: status, code: "http_\(status)", message: "Something went wrong (\(status))") }
        return data
    }
    /// Deletes the account at once; the server needs the typed "DELETE".
    public func deleteAccount() async throws -> Ignored { try await send(body(request("DELETE", "/me"), ["confirm": "DELETE"])) }
}

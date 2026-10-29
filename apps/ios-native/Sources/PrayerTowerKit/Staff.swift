import Foundation

// Staff screens (moderators and admins): the moderation queue and appeals, announcements,
// invite codes, the waitlist, tester feedback, the error log, the audit log and operations.
// The server checks every role; the app only hides what a member can't use.

public enum Staff {
    public static let moderatorRoles: Set<String> = ["moderator", "admin"]
    public static func isModerator(_ roles: [String]) -> Bool { roles.contains(where: moderatorRoles.contains) }
    public static func isAdmin(_ roles: [String]) -> Bool { roles.contains("admin") }

    /// Parses a whole number typed into a field; anything else is nil.
    public static func whole(_ s: String) -> Int? {
        let t = s.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty, t.allSatisfy(\.isNumber) else { return nil }
        return Int(t)
    }
}

// MARK: - Moderation

/// A reported or flagged item (`ModerationItem` in packages/shared).
public struct ModerationItem: Codable, Sendable, Equatable, Identifiable {
    public struct History: Codable, Sendable, Equatable {
        public let recent: Int
        public let serious: Int
        public let days: Int
        public let repeat_: Bool
        enum CodingKeys: String, CodingKey { case recent, serious, days, repeat_ = "repeat" }
    }
    public let id: String
    /// post | comment | reaction | message | event
    public let target_type: String
    public let target_id: String
    /// report | ai | crisis | harm
    public let source: String
    public let reason: String?
    public let status: String
    public let content: String?
    public let created_at: String
    public let auto_hidden: Bool?
    public let author_note: String?
    public let history: History?
}

public struct Appeal: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let moderation_item_id: String
    public let target_type: String
    public let rule: String?
    public let message: String
    public let content: String?
    public let suspended_until: String?
    public let created_at: String
}

/// Prayer taps that look automated.
public struct ActivityFlag: Codable, Sendable, Equatable, Identifiable {
    public struct Details: Codable, Sendable, Equatable { public let taps: Int }
    public let id: String
    public let userId: String
    public let name: String
    /// too_many | too_regular
    public let reason: String
    public let details: Details
    public let createdAt: String
}

public struct ModerationDecision: Encodable, Sendable, Equatable {
    /// dismiss | remove
    public let action: String
    public let rule: String?
    public let suspendDays: Int?
    public let note: String?

    public static let keep = ModerationDecision(action: "dismiss", rule: nil, suspendDays: nil, note: nil)
    public static func remove(_ rule: String) -> ModerationDecision { .init(action: "remove", rule: rule, suspendDays: nil, note: nil) }
    public static func removeAndSuspend(_ rule: String) -> ModerationDecision {
        .init(action: "remove", rule: rule, suspendDays: 7, note: "Suspended from the moderation queue")
    }
    /// Someone may be in danger: reach out and keep it up. Never suspend.
    public static let reachedOut = ModerationDecision(action: "dismiss", rule: nil, suspendDays: nil, note: "Crisis support offered")
    public static let removeMethod = ModerationDecision(action: "remove", rule: "safe_messaging", suspendDays: nil, note: "Removed method details (safe messaging)")
}

public enum Moderation {
    /// MODERATION_RULES in packages/shared, in order. safe_messaging is only for crisis items.
    public static let rules = ["harm", "flooding", "ads", "abuse", "safe_messaging", "pressure", "misleading", "automation", "other"]
    /// Rules with a switch are offered only while it is on.
    static let switched = ["pressure": "pressureRule", "misleading": "misleadingRule", "automation": "automationRule"]

    public static func ruleChoices(features: Features) -> [String] {
        rules.filter { $0 != "safe_messaging" && (switched[$0].map { features[$0] } ?? true) }
    }

    /// The goldfish line: how often this author's posts were removed lately.
    public static func goldfish(_ h: ModerationItem.History, words w: Words) -> String {
        var parts = [h.recent > 0 ? w("goldfish.recent", ["days": "\(h.days)"], count: h.recent) : w("goldfish.first", ["days": "\(h.days)"])]
        if h.serious > 0 { parts.append(w("goldfish.serious", count: h.serious)) }
        if h.repeat_ { parts.append(w("goldfish.repeat")) }
        return parts.joined(separator: " ")
    }
}

// MARK: - Announcements, invites, waitlist

public struct Announcement: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    /// banner | notice
    public let kind: String
    public let title: String
    public let body: String
    public let startsAt: String
    public let endsAt: String?
    public let createdAt: String
    public let active: Bool?
    public let dismissals: Int?
}

public struct NewAnnouncement: Encodable, Sendable, Equatable {
    public let kind: String
    public let title: String
    public let body: String
    /// nil: stays up until an admin ends it.
    public let durationHours: Int?

    /// nil when the form isn't ready: a title, and 1 to 2,160 hours or blank.
    public init?(kind: String, title: String, body: String, hours: String) {
        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return nil }
        if hours.trimmingCharacters(in: .whitespaces).isEmpty {
            durationHours = nil
        } else {
            guard let h = Staff.whole(hours), (1...2160).contains(h) else { return nil }
            durationHours = h
        }
        self.kind = kind
        self.title = t
        self.body = kind == "notice" ? body.trimmingCharacters(in: .whitespacesAndNewlines) : ""
    }

    enum CodingKeys: String, CodingKey { case kind, title, body, durationHours }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(kind, forKey: .kind)
        try c.encode(title, forKey: .title)
        try c.encode(body, forKey: .body)
        try c.encode(durationHours, forKey: .durationHours)
    }
}

public struct Invite: Codable, Sendable, Equatable, Identifiable {
    public struct Joins: Codable, Sendable, Equatable {
        public let slug: String
        public let name: String
        public let secular: Bool
    }
    public var id: String { code }
    public let code: String
    public let note: String
    public let maxUses: Int
    public let uses: Int
    public let expiresAt: String?
    /// active | used | expired | revoked
    public let status: String
    public let community: Joins?

    /// The link that opens sign-up with the code filled in.
    public static func link(_ code: String) -> URL {
        var c = URLComponents(string: "prayertower://sign-in")!
        c.queryItems = [URLQueryItem(name: "invite", value: code)]
        return c.url!
    }

    /// The code in an invite link, which opens sign-up with it filled in.
    public static func code(from url: URL) -> String? {
        guard Edition.schemes.contains(url.scheme ?? ""), url.host() == "sign-in" || url.path() == "/sign-in" else { return nil }
        return URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "invite" }?.value.flatMap { $0.isEmpty ? nil : $0 }
    }

    /// A code for a secular community (Open Circle) invites people there by name, with no religious words.
    public func shareMessage(words w: Words) -> String {
        let url = Invite.link(code).absoluteString
        if let community, community.secular { return w("invites.shareMessageTo", ["name": community.name, "code": code, "url": url]) }
        return w("invites.shareMessage", ["code": code, "url": url])
    }
}

public struct NewInvites: Encodable, Sendable, Equatable {
    public let note: String
    public let community: String?
    public let maxUses: Int
    public let expiresInDays: Int?
    public let count: Int

    /// nil outside the limits: 1 to 1,000 people, 1 to 365 days (blank for never) and 1 to 50 codes.
    public init?(note: String, community: String?, maxUses: String, days: String, count: String) {
        guard let uses = Staff.whole(maxUses), (1...1000).contains(uses), let n = Staff.whole(count), (1...50).contains(n) else { return nil }
        if days.trimmingCharacters(in: .whitespaces).isEmpty {
            expiresInDays = nil
        } else {
            guard let d = Staff.whole(days), (1...365).contains(d) else { return nil }
            expiresInDays = d
        }
        self.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        self.community = community.flatMap { $0.isEmpty ? nil : $0 }
        self.maxUses = uses
        self.count = n
    }

    enum CodingKeys: String, CodingKey { case note, community, maxUses, expiresInDays, count }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(note, forKey: .note)
        try c.encodeIfPresent(community, forKey: .community)
        try c.encode(maxUses, forKey: .maxUses)
        try c.encode(expiresInDays, forKey: .expiresInDays)
        try c.encode(count, forKey: .count)
    }
}

public struct InviteList: Decodable, Sendable, Equatable {
    public let inviteOnly: Bool
    public let invites: [Invite]
}

/// A community an invite code can place a new member in.
public struct CommunityChoice: Decodable, Sendable, Equatable, Identifiable {
    public var id: String { slug }
    public let slug: String
    public let name: String
}

public struct WaitlistEntry: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let email: String
    public let name: String
    public let note: String
    /// prayer-tower | open-circle
    public let edition: String
    public let inviteCode: String?
    public let createdAt: String
}

public struct Waitlist: Decodable, Sendable, Equatable {
    public let enabled: Bool
    public let entries: [WaitlistEntry]
}

// MARK: - Feedback, errors, audit log, operations

public struct FeedbackItem: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let kind: String
    public let body: String
    public let platform: String?
    public let appVersion: String?
    public let createdAt: String
    public let name: String
    /// open | closed
    public let status: String
    public let tags: [String]
    public let severity: String?
    public let note: String?
}

public enum FeedbackTriage {
    /// FEEDBACK_TAGS in packages/shared, without spanish: the app is English only for now.
    public static let tags = ["bug", "crash", "idea", "confusing", "content", "notifications", "account", "accessibility", "performance", "praise", "other"]
    public static let severities = ["low", "medium", "high", "blocker"]

    public static func toggled(_ tags: [String], _ tag: String) -> [String] {
        tags.contains(tag) ? tags.filter { $0 != tag } : tags + [tag]
    }
}

/// One change to a feedback item. A nil severity clears it.
public enum FeedbackPatch: Encodable, Sendable, Equatable {
    case tags([String])
    case severity(String?)
    case note(String)

    enum CodingKeys: String, CodingKey { case tags, severity, note }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .tags(let t): try c.encode(t, forKey: .tags)
        case .severity(let s): try c.encode(s, forKey: .severity)
        case .note(let n): try c.encode(n, forKey: .note)
        }
    }
}

public struct ErrorReport: Codable, Sendable, Equatable, Identifiable {
    public struct User: Codable, Sendable, Equatable { public let id: String; public let name: String }
    public let id: String
    /// app | server
    public let source: String
    public let place: String
    public let message: String
    public let detail: String?
    public let platform: String?
    public let appVersion: String?
    public let count: Int
    public let lastUser: User?
    public let firstSeen: String
    public let lastSeen: String
    public let resolvedAt: String?
}

public struct AuditEntry: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let actor_name: String?
    public let action: String
    public let target_id: String?
    public let created_at: String
}

public enum AuditLog {
    public static let page = 50
    /// 'PATCH /admin/token-settings' -> 'PATCH_admin_token-settings' (word keys can't hold '/' or ':').
    public static func actionKey(_ action: String) -> String {
        action.replacingOccurrences(of: "[/:\\s]+", with: "_", options: .regularExpression)
    }
    /// The plain words for an action, or the raw action when there are none.
    public static func describe(_ action: String, words w: Words) -> String {
        let key = "auditLog.action.\(actionKey(action))"
        let said = w(key)
        return said == key ? action : said
    }
    /// Words, moderation only and last 7 days (the moderation tools switch).
    public static func query(words: String, moderationOnly: Bool, lastWeek: Bool, now: Date = .now, before: AuditEntry? = nil) -> [String: String] {
        var q = ["limit": "\(page)"]
        let t = words.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { q["q"] = t }
        if moderationOnly { q["action"] = " /moderation/" }
        if lastWeek {
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            q["since"] = f.string(from: now.addingTimeInterval(-7 * 86_400))
        }
        if let before {
            q["before"] = before.created_at
            q["beforeId"] = before.id
        }
        return q
    }
}

public struct OpsStatus: Codable, Sendable, Equatable {
    public struct Database: Codable, Sendable, Equatable { public let ms: Int }
    public struct Worker: Codable, Sendable, Equatable { public let lastSeen: String?; public let ok: Bool }
    public struct Queue: Codable, Sendable, Equatable {
        public let waiting: Int
        public let running: Int
        public let overdue: Int
        public let oldestOverdueSeconds: Int
        public let failed: Int
        public let retrying: Int
    }
    public struct Errors: Codable, Sendable, Equatable {
        public struct Recent: Codable, Sendable, Equatable { public let at: String; public let method: String; public let route: String; public let status: Int }
        public let lastHour: Int
        public let last24h: Int
        public let recent: [Recent]
    }
    public struct Radio: Codable, Sendable, Equatable {
        public struct Station: Codable, Sendable, Equatable { public let lastSeen: String?; public let ok: Bool? }
        /// log | station
        public let mode: String
        public let queued: Int
        public let sending: Int
        public let sentToday: Int
        public let failedToday: Int
        public let lastSentAt: String?
        public let station: Station
    }
    public let checkedAt: String
    public let database: Database
    public let worker: Worker
    public let queue: Queue
    public let errors: Errors
    public let radio: Radio
    /// worker_down | jobs_overdue | jobs_failed | server_errors | station_silent
    public let problems: [String]
}

// MARK: - API

private struct Items: Decodable { let items: [ModerationItem] }
private struct Appeals: Decodable { let appeals: [Appeal] }
private struct Flags: Decodable { let flags: [ActivityFlag] }
private struct Announcements: Decodable { let announcements: [Announcement] }
private struct Created: Decodable { let invites: [Invite] }
private struct Communities: Decodable { let communities: [CommunityChoice] }
private struct FeedbackList: Decodable { let feedback: [FeedbackItem] }
private struct Errors: Decodable { let errors: [ErrorReport] }
private struct Entries: Decodable { let entries: [AuditEntry] }
private struct Ops: Decodable { let status: OpsStatus }
private struct WaitlistInvite: Decodable { struct Code: Decodable { let code: String }; let invite: Code }
private let empty = [String: String]()

extension APIClient {
    public func moderationQueue() async throws -> [ModerationItem] { try await (get("/moderation/queue") as Items).items }
    public func decide(_ itemId: String, _ d: ModerationDecision) async throws -> Ignored { try await post("/moderation/items/\(itemId)/decision", body: d) }
    /// Sends the report to the admins (Admin → Legal requests). The item stays in the queue.
    public func escalate(_ item: ModerationItem) async throws -> Ignored {
        try await post("/moderation/items/\(item.id)/escalate", body: ["note": "Escalated from the moderation queue. Reason given: \(item.reason ?? "none")"])
    }
    public func appeals() async throws -> [Appeal] { try await (get("/moderation/appeals") as Appeals).appeals }
    /// uphold | overturn
    public func decideAppeal(_ id: String, action: String) async throws -> Ignored { try await post("/moderation/appeals/\(id)/decision", body: ["action": action]) }
    public func activityFlags() async throws -> [ActivityFlag] { try await (get("/moderation/activity-flags") as Flags).flags }
    /// cleared | confirmed
    public func decideActivityFlag(_ id: String, status: String) async throws -> Ignored { try await post("/moderation/activity-flags/\(id)", body: ["status": status]) }

    public func announcements() async throws -> [Announcement] { try await (get("/admin/announcements") as Announcements).announcements }
    public func createAnnouncement(_ a: NewAnnouncement) async throws -> Ignored { try await post("/admin/announcements", body: a) }
    public func endAnnouncement(_ id: String) async throws -> Ignored { try await post("/admin/announcements/\(id)/end", body: empty) }

    public func invites() async throws -> InviteList { try await get("/admin/invites") }
    public func createInvites(_ i: NewInvites) async throws -> [Invite] { try await (post("/admin/invites", body: i) as Created).invites }
    public func revokeInvite(_ code: String) async throws -> Ignored { try await post("/admin/invites/\(code)/revoke", body: empty) }
    public func emailInvite(_ code: String, to email: String, message: String) async throws -> Ignored {
        var b = ["email": email.trimmingCharacters(in: .whitespaces), "language": "en"]
        let m = message.trimmingCharacters(in: .whitespacesAndNewlines)
        if !m.isEmpty { b["message"] = m }
        return try await post("/admin/invites/\(code)/email", body: b)
    }
    public func setInviteOnly(_ on: Bool) async throws -> Ignored { try await send(body(request("PATCH", "/admin/invite-settings"), ["inviteOnly": on])) }
    public func adminCommunities() async throws -> [CommunityChoice] { try await (get("/admin/communities") as Communities).communities }

    public func waitlist() async throws -> Waitlist { try await get("/admin/waitlist") }
    /// Returns the one-use code made for them.
    public func inviteFromWaitlist(_ id: String) async throws -> String { try await (post("/admin/waitlist/\(id)/invite", body: empty) as WaitlistInvite).invite.code }
    public func removeFromWaitlist(_ id: String) async throws -> Ignored { try await send(request("DELETE", "/admin/waitlist/\(id)")) }

    /// status: open | closed | all
    public func feedback(status: String, tag: String?) async throws -> [FeedbackItem] {
        var q = ["status": status]
        if let tag { q["tag"] = tag }
        return try await (get("/admin/feedback", query: q) as FeedbackList).feedback
    }
    public func triageFeedback(_ id: String, _ patch: FeedbackPatch) async throws -> Ignored { try await send(body(request("PATCH", "/admin/feedback/\(id)"), patch)) }
    public func closeFeedback(_ id: String) async throws -> Ignored { try await post("/admin/feedback/\(id)/close", body: empty) }

    /// status: open | resolved | all
    public func errorReports(status: String) async throws -> [ErrorReport] { try await (get("/admin/errors", query: ["status": status]) as Errors).errors }
    public func resolveError(_ id: String) async throws -> Ignored { try await post("/admin/errors/\(id)/resolve", body: empty) }

    public func auditLog(_ query: [String: String]) async throws -> [AuditEntry] { try await (get("/admin/audit-log", query: query) as Entries).entries }
    public func ops() async throws -> OpsStatus { try await (get("/admin/ops") as Ops).status }
}

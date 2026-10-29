import Foundation

// Member screens beyond the feed: the welcome questions and tour, notices, the safety center,
// rules, appeals, sending feedback, someone's profile, and the look-backs (answered and
// remembered, kindness highlights, stories of help).

// MARK: - Welcome and tour

public enum Onboarding {
    /// Stored as these English words; only the labels are translated (onboarding.support.*).
    public static let support = ["Health", "Family", "Grief", "Provision", "Guidance", "Addiction", "Faith", "Relationships"]
    /// PRAY_FOR_SCOPE in packages/shared (onboarding.scopes.*).
    public static let scopes = ["family", "friends", "loved_ones", "neighbors", "church", "community", "enemies", "towns", "cities", "nation", "countries", "world"]
    /// WHY_HERE in packages/shared (enums.whyHere.*).
    public static let whyHere = ["pray_for_others", "prayer_for_myself", "pray_without_ceasing", "extend_reach"]

    public static func toggled(_ list: [String], _ item: String) -> [String] {
        list.contains(item) ? list.filter { $0 != item } : list + [item]
    }

    /// The PATCH /me body that finishes the welcome questions.
    public static func patch(whyHere: [String], wanted: [String], offered: [String], scope: [String], traumaOptOut: Bool, anonymous: Bool) -> [String: JSONValue] {
        [
            "whyHere": .array(whyHere.map(JSONValue.string)),
            "supportWanted": .array(wanted.map(JSONValue.string)),
            "supportOffered": .array(offered.map(JSONValue.string)),
            "prayForScope": .array(scope.map(JSONValue.string)),
            "traumaContentOptOut": .bool(traumaOptOut),
            "anonymousByDefault": .bool(anonymous),
            "completeOnboarding": .bool(true),
        ]
    }
}

public enum Tour {
    public struct Step: Sendable, Equatable { public let icon: String; public let key: String }
    /// Five short cards on how Prayer Tower works (tour.<key>Title / tour.<key>Body).
    public static let steps = [
        Step(icon: "🕊", key: "ask"), Step(icon: "🙏", key: "pray"), Step(icon: "📅", key: "promise"),
        Step(icon: "✨", key: "tokens"), Step(icon: "🛡", key: "safe"),
    ]
    public static func icon(_ step: Step, wording: Wording) -> String { wording == .neutral && step.key == "pray" ? "🤝" : step.icon }

    /// Shown once per member on this device after the welcome questions.
    public static func seen(_ userId: String, in defaults: UserDefaults = .standard) -> Bool { defaults.bool(forKey: "tour-seen:\(userId)") }
    public static func markSeen(_ userId: String, in defaults: UserDefaults = .standard) { defaults.set(true, forKey: "tour-seen:\(userId)") }
}

// MARK: - Notices

public struct AppNotification: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let kind: String
    public let title: String
    public let body: String
    public let data: [String: JSONValue]
    public let read_at: String?
    public let created_at: String

    func string(_ key: String) -> String? { if case let .string(s)? = data[key] { return s } else { return nil } }
    func flag(_ key: String) -> Bool { if case let .bool(b)? = data[key] { return b } else { return false } }

    /// A moderation notice can be appealed; a held post can be explained.
    public var appealItem: String? { kind == "moderation_notice" ? string("itemId") : nil }
    public var pathBackItem: String? { kind == "moderation_notice" && flag("pathBack") ? string("itemId") : nil }
    public var explainItem: String? { kind == "held_for_review" && flag("explainable") ? string("itemId") : nil }
    public var route: AppRoute? { AppRoute.target(data) }
}

/// Where a notice, widget or link opens (lib/notification-target.ts in the Expo app).
public enum AppRoute: Hashable, Sendable {
    case post(String), conversation(String), event(String), circle(String), person(String)
    case care, helpStories, highlights, prayerMinute, prayerList, give, me, circles, feed
    case moderation, ops, notificationSettings, accountSecurity
    /// A screen the native app doesn't have yet; nothing opens.
    case unsupported(String)

    static let screens: [String: AppRoute] = [
        "highlights": .highlights, "prayer-minute": .prayerMinute, "give": .give, "gratitude": .me, "encourager": .me, "partner": .me,
        "prayer-list": .prayerList, "account-security": .accountSecurity, "circle": .circles, "feed": .feed,
        "radio-requests": .unsupported("radio-requests"), "feedback-triage": .unsupported("feedback-triage"), "crosspost": .unsupported("crosspost"),
    ]

    public static func target(_ data: [String: JSONValue]) -> AppRoute? {
        func id(_ k: String) -> String? { if case let .string(s)? = data[k] { return s } else { return nil } }
        if let m = id("mendId") { return .unsupported("mend/\(m)") }
        if id("storyId") != nil { return .helpStories }
        if id("careRequestId") != nil { return .care }
        if let c = id("conversationId") { return .conversation(c) }
        if let e = id("eventId") { return .event(e) }
        if let p = id("postId") { return .post(p) }
        if id("screen") == "circle", let c = id("circleId") { return .circle(c) }
        if let s = id("screen"), let r = screens[s] { return r }
        if let p = id("personId") { return .person(p) }
        if id("awardId") != nil { return .me }
        if id("churchId") != nil { return .unsupported("church") }
        if case .array? = data["itemIds"] { return .moderation }
        if id("reportId") != nil { return .moderation }
        if id("caseId") != nil { return .unsupported("legal") }
        if id("alert") != nil { return .unsupported("operator-console") }
        if id("ledgerCheckId") != nil { return .unsupported("admin") }
        if case .array? = data["problems"] { return .ops }
        if case .array? = data["tasks"] { return .ops }
        return nil
    }

    /// From an app link: prayertower:///post/<id>, prayertower:///conversation/<id>, …
    public init?(url: URL) {
        guard Edition.schemes.contains(url.scheme ?? "") else { return nil }
        let parts = (url.host().map { [$0] } ?? []) + url.pathComponents.filter { $0 != "/" }
        guard parts.count == 2, !parts[1].isEmpty else { return nil }
        switch parts[0] {
        case "post": self = .post(parts[1])
        case "conversation": self = .conversation(parts[1])
        case "event": self = .event(parts[1])
        case "circles": self = .circle(parts[1])
        case "people": self = .person(parts[1])
        default: return nil
        }
    }
}

/// The member's own words from a removed post or comment, to change and share again.
public struct RemovedWords: Codable, Sendable, Equatable {
    /// post | comment
    public let target: String
    public let body: String
    public let postType: String?
    public let postId: String?
}

// MARK: - Safety center

public struct SafetyCenter: Codable, Sendable, Equatable {
    public struct Named: Codable, Sendable, Equatable, Identifiable { public let id: String; public let displayName: String }
    public struct Hidden: Codable, Sendable, Equatable, Identifiable { public let id: String; public let excerpt: String }
    public struct Report: Codable, Sendable, Equatable, Identifiable {
        public let id: String
        public let targetType: String
        public let createdAt: String
        public let reviewed: Bool
    }
    public let blocks: [Named]
    public let mutes: [Named]
    public let hidden: [Hidden]
    public let reports: [Report]

    public static let tools = ["report", "block", "mute", "hide"]
}

// MARK: - Someone's profile

public struct Person: Codable, Sendable, Equatable, Identifiable {
    public struct Pastor: Codable, Sendable, Equatable { public let title: String; public let church: String }
    public let id: String
    public let displayName: String
    public let handle: String?
    public let bio: String?
    public let whyHere: [String]
    public let following: Bool
    public let followers: Int
    public let pastor: Pastor?
    public let supportUrl: String?
    public let squire: Bool?
}

public struct PersonPage: Codable, Sendable, Equatable {
    public let person: Person
    public let posts: [Card]
}

// MARK: - Look-backs

public struct RememberedItem: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let body: String
    public let testimony: String?
    public let answeredAt: String
}

public struct KindnessHighlights: Codable, Sendable, Equatable {
    public struct Week: Codable, Sendable, Equatable, Identifiable {
        public struct Item: Codable, Sendable, Equatable, Identifiable { public let id: String; public let text: String }
        public var id: String { week }
        public let week: String
        public let items: [Item]
    }
    public let enabled: Bool
    public let weeks: [Week]
}

public struct HighlightAsks: Codable, Sendable, Equatable {
    public struct Ask: Codable, Sendable, Equatable, Identifiable {
        public let id: String
        /// asked | consented | picked
        public let status: String
        public let body: String
    }
    public let enabled: Bool
    public let asks: [Ask]
}

public struct HelpStories: Codable, Sendable, Equatable {
    public struct Story: Codable, Sendable, Equatable, Identifiable { public let id: String; public let body: String }
    public let enabled: Bool
    public let stories: [Story]
}

public struct WitnessStory: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let body: String
    /// awaiting_consent | approved | declined
    public let status: String
}

// MARK: - API

private struct Notifications: Decodable { let notifications: [AppNotification] }
private struct SafetyWrap: Decodable { let safety: SafetyCenter }
private struct Muted: Decodable { let muted: Bool }
private struct Direct: Decodable { let conversationId: String }
private struct RememberedList: Decodable { let items: [RememberedItem] }
private struct MyStories: Decodable { let stories: [WitnessStory] }
private let none = [String: String]()

extension APIClient {
    public func notifications() async throws -> [AppNotification] { try await (get("/me/notifications") as Notifications).notifications }
    public func markRead(_ ids: [String]) async throws -> Ignored { try await post("/me/notifications/read", body: ["ids": ids]) }
    public func removedWords(_ itemId: String) async throws -> RemovedWords { try await get("/me/removed/\(itemId)") }

    public func safetyCenter() async throws -> SafetyCenter { try await (get("/me/safety") as SafetyWrap).safety }
    public func unblock(_ userId: String) async throws -> Ignored { try await send(request("DELETE", "/people/\(userId)/block")) }
    public func isMuted(_ userId: String) async throws -> Bool { try await (get("/people/\(userId)/mute") as Muted).muted }
    public func mute(_ userId: String) async throws -> Ignored { try await send(request("PUT", "/people/\(userId)/mute")) }
    public func unmute(_ userId: String) async throws -> Ignored { try await send(request("DELETE", "/people/\(userId)/mute")) }
    public func unhidePost(_ postId: String) async throws -> Ignored { try await send(request("DELETE", "/posts/\(postId)/hide")) }

    public func appeal(_ itemId: String, message: String) async throws -> Ignored {
        try await post("/moderation/items/\(itemId)/appeal", body: ["message": message.trimmingCharacters(in: .whitespacesAndNewlines)])
    }
    /// kind: bug | idea | other
    public func sendFeedback(kind: String, body: String, appVersion: String?) async throws -> Ignored {
        var b = ["kind": kind, "body": body.trimmingCharacters(in: .whitespacesAndNewlines), "platform": "ios"]
        if let appVersion { b["appVersion"] = appVersion }
        return try await post("/feedback", body: b)
    }

    public func person(_ id: String) async throws -> PersonPage { try await get("/people/\(id)") }
    public func follow(_ id: String) async throws -> Ignored { try await send(request("PUT", "/people/\(id)/follow")) }
    public func unfollow(_ id: String) async throws -> Ignored { try await send(request("DELETE", "/people/\(id)/follow")) }
    /// Starts (or reopens) a direct conversation; returns its id.
    public func messagePerson(_ userId: String, body: String) async throws -> String {
        try await (post("/conversations/direct", body: ["userId": userId, "body": body.trimmingCharacters(in: .whitespacesAndNewlines)]) as Direct).conversationId
    }

    public func remembered() async throws -> [RememberedItem] { try await (get("/me/remembered") as RememberedList).items }
    public func hideRemembered(_ postId: String) async throws -> [RememberedItem] { try await (post("/me/remembered/\(postId)/hide", body: none) as RememberedList).items }
    public func kindnessHighlights() async throws -> KindnessHighlights { try await get("/kindness-highlights") }
    public func highlightAsks() async throws -> HighlightAsks { try await get("/me/highlight-asks") }
    public func answerHighlightAsk(_ id: String, yes: Bool) async throws -> HighlightAsks { try await post("/me/highlight-asks/\(id)", body: ["yes": yes]) }
    public func withdrawHighlight(_ id: String) async throws -> HighlightAsks { try await post("/me/highlight-asks/\(id)/withdraw", body: none) }
    public func helpStories() async throws -> HelpStories { try await get("/help-stories") }
    public func myWitnessStories() async throws -> [WitnessStory] { try await (get("/me/witness-stories") as MyStories).stories }
    public func decideWitnessStory(_ id: String, approve: Bool) async throws -> Ignored { try await post("/me/witness-stories/\(id)/decision", body: ["approve": approve]) }
}

import Foundation

/// The same JSON the Expo app reads (packages/shared/src/index.ts). Only the fields the
/// native app uses so far; unknown fields are ignored, so the server can add more freely.

public struct Identity: Codable, Sendable, Equatable {
    public let id: String?
    public let displayName: String
    public let handle: String?
    public let anonymous: Bool
}

public struct CardCounts: Codable, Sendable, Equatable {
    public let prayingNow: Int
    public let prayers: Int
    public let commitments: Int
    public let comments: Int
}

/// One request or post in the feed (`Card` in packages/shared).
public struct Card: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public let author: Identity
    public let isMine: Bool
    public let postType: String
    public let urgency: Int
    public let preview: String
    public let body: String
    public let crisis: Bool
    /// Marked sensitive by its author: never shown on a home or Lock Screen.
    public let isSensitive: Bool?
    public let counts: CardCounts
    public let createdAt: String
    /// The actions this viewer may take, in the server's order (`ACTION_ORDER`). Older servers may leave it out.
    public let actions: [String]?
    /// open | actively_prayed | amplified | answered
    public let state: String?
    public let answeredAt: String?
    /// The poster's own words on how it was answered.
    public let testimony: String?
    public let background: String?
    public let media: [CardMedia]?
    // Radio (Radio.swift). Older servers leave these out.
    /// A lament: it goes on the air only when its author said so (`lamentRadio`).
    public var lament: Bool? = nil
    public var lamentRadio: Bool? = nil
    /// Only on the author's own request: it goes out again when the air is quiet.
    public var keepOnAir: Bool? = nil
    /// Newest few comments, newest first, while comments as leaves is on (the drawn vine and tower).
    public let leafComments: [LeafComment]?
}

/// A photo or video on a post; `url` is a short-lived signed read URL.
public struct CardMedia: Codable, Sendable, Equatable {
    public let kind: String
    public let storagePath: String
    public let url: String?
}

/// A comment shown on a leaf or sub-tablet under its request.
public struct LeafComment: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let body: String
    public let author: Identity
    public let createdAt: String
}

public struct FeedPage: Codable, Sendable, Equatable {
    /// The member's feed skin; nil means the plain column.
    public let theme: FeedTheme?
    public let posts: [Card]
    public let pinnedId: String?
    public let nextPage: Int?
}

public struct Profile: Codable, Sendable, Equatable {
    public let id: String
    public let displayName: String
    /// Compose starts with "Post anonymously" on when this is set.
    public let anonymousByDefault: Bool?
    public let whyHere: [String]?
    public let traumaContentOptOut: Bool?
    public let updatesInFirstComment: Bool?
    public let promptsEnabled: Bool?
    /// gentle | firm; nil = the app default.
    public let promptTone: String?
    public let digestEnabled: Bool?
    /// Missing means on.
    public let showPrayerStats: Bool?
    /// Missing on profiles fetched before the setting existed.
    public let notificationPrefs: NotificationPrefs?

    public init(
        id: String, displayName: String, anonymousByDefault: Bool? = nil, whyHere: [String]? = nil, traumaContentOptOut: Bool? = nil,
        updatesInFirstComment: Bool? = nil, promptsEnabled: Bool? = nil, promptTone: String? = nil, digestEnabled: Bool? = nil, showPrayerStats: Bool? = nil,
        notificationPrefs: NotificationPrefs? = nil
    ) {
        self.id = id
        self.displayName = displayName
        self.anonymousByDefault = anonymousByDefault
        self.whyHere = whyHere
        self.traumaContentOptOut = traumaContentOptOut
        self.updatesInFirstComment = updatesInFirstComment
        self.promptsEnabled = promptsEnabled
        self.promptTone = promptTone
        self.digestEnabled = digestEnabled
        self.showPrayerStats = showPrayerStats
        self.notificationPrefs = notificationPrefs
    }

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case anonymousByDefault = "anonymous_by_default"
        case whyHere = "why_here"
        case traumaContentOptOut = "trauma_content_opt_out"
        case updatesInFirstComment = "updates_in_first_comment"
        case promptsEnabled = "prompts_enabled"
        case promptTone = "prompt_tone"
        case digestEnabled = "digest_enabled"
        case showPrayerStats = "show_prayer_stats"
        case notificationPrefs = "notification_prefs"
    }
}

public struct Community: Codable, Sendable, Equatable {
    public let slug: String
    public let name: String
    /// "faith" = Prayer Tower's wording; "neutral" = Open Circle's, with no religious words.
    public let wording: String
    /// The kinds of post this community has turned on (discussion, news and blog are off by default).
    public let enabledPostTypes: [String]?
    /// Features this community's admin hid (COMMUNITY_FEATURES: groups, events, care, …).
    public let hiddenFeatures: [String]?

    public init(slug: String, name: String, wording: String, enabledPostTypes: [String]? = nil, hiddenFeatures: [String]? = nil) {
        self.slug = slug
        self.name = name
        self.wording = wording
        self.enabledPostTypes = enabledPostTypes
        self.hiddenFeatures = hiddenFeatures
    }

    /// As the Expo app's `useFeature`: on unless the community hid it.
    public func shows(_ feature: String) -> Bool { !(hiddenFeatures ?? []).contains(feature) }
}

public struct Me: Codable, Sendable, Equatable {
    public let profile: Profile
    public let roles: [String]
    public let community: Community?

    public init(profile: Profile, roles: [String], community: Community?) {
        self.profile = profile
        self.roles = roles
        self.community = community
    }
}

public struct PrayingNow: Codable, Sendable, Equatable {
    public let eventId: String
    public let integrityText: String
}

/// Admin switches the app reads (`/features`). Anything missing counts as off.
public struct Features: Sendable, Equatable {
    public let values: [String: Bool]
    /// Number settings that come with the switches (videoMaxSeconds, givingSplitMax…).
    public let numbers: [String: Double]
    public init(values: [String: Bool], numbers: [String: Double] = [:]) {
        self.values = values
        self.numbers = numbers
    }
    public subscript(name: String) -> Bool { values[name] ?? false }
    public func number(_ name: String) -> Double? { numbers[name] }
}

extension Features: Decodable {
    private struct Wrapper: Decodable { let features: [String: FlexibleValue] }
    private enum FlexibleValue: Decodable {
        case bool(Bool), number(Double), other
        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let b = try? c.decode(Bool.self) { self = .bool(b) } else if let n = try? c.decode(Double.self) { self = .number(n) } else { self = .other }
        }
    }
    public init(from decoder: Decoder) throws {
        let w = try Wrapper(from: decoder)
        values = w.features.compactMapValues { if case let .bool(b) = $0 { b } else { nil } }
        numbers = w.features.compactMapValues { if case let .number(n) = $0 { n } else { nil } }
    }
}

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
    public let counts: CardCounts
    public let createdAt: String
    /// The actions this viewer may take, in the server's order (`ACTION_ORDER`). Older servers may leave it out.
    public let actions: [String]?
    /// Newest few comments, newest first, while comments as leaves is on (the drawn vine and tower).
    public let leafComments: [LeafComment]?
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

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
    }
}

public struct Community: Codable, Sendable, Equatable {
    public let slug: String
    public let name: String
    /// "faith" = Prayer Tower's wording; "neutral" = Open Circle's, with no religious words.
    public let wording: String
}

public struct Me: Codable, Sendable, Equatable {
    public let profile: Profile
    public let roles: [String]
    public let community: Community?
}

public struct PrayingNow: Codable, Sendable, Equatable {
    public let eventId: String
    public let integrityText: String
}

/// Admin switches the app reads (`/features`). Anything missing counts as off.
public struct Features: Sendable, Equatable {
    public let values: [String: Bool]
    public init(values: [String: Bool]) { self.values = values }
    public subscript(name: String) -> Bool { values[name] ?? false }
}

extension Features: Decodable {
    private struct Wrapper: Decodable { let features: [String: FlexibleValue] }
    private enum FlexibleValue: Decodable {
        case bool(Bool), other
        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            self = (try? c.decode(Bool.self)).map(FlexibleValue.bool) ?? .other
        }
    }
    public init(from decoder: Decoder) throws {
        let w = try Wrapper(from: decoder)
        values = w.features.compactMapValues { if case let .bool(b) = $0 { b } else { nil } }
    }
}

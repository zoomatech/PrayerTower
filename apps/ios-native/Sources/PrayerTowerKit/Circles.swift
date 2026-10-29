import Foundation

/// Prayer circles: invite-only small groups of up to 12 (`/me/circles`, `/circles/:id`).
public struct CircleSummary: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let about: String?
    public let isOwner: Bool
    public let members: Int
    public let lastPostAt: String?
}

public struct MyCircles: Codable, Sendable, Equatable {
    public let enabled: Bool
    public let circles: [CircleSummary]
}

public struct CirclePerson: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let displayName: String?
}

public struct CircleReply: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let author: CirclePerson
    public let body: String
    public let createdAt: String
}

public struct CirclePost: Codable, Sendable, Equatable, Identifiable {
    public struct Update: Codable, Sendable, Equatable {
        public let text: String?
        public let answered: Bool
        public let at: String
    }
    public let id: String
    public let author: CirclePerson
    public let body: String
    public let createdAt: String
    public let prayedByMe: Bool
    /// Only on the viewer's own posts.
    public let prayed: Int?
    public let replies: [CircleReply]
    /// Circle updates (off by default): how it's going, from the person who shared.
    public let update: Update?
    public var isMine: Bool { prayed != nil }
}

public struct CircleView: Codable, Sendable, Equatable {
    public struct Info: Codable, Sendable, Equatable {
        public let id: String
        public let name: String
        public let about: String?
        public let isOwner: Bool
        public let ownerId: String
        public let full: Bool
    }
    public struct Invite: Codable, Sendable, Equatable {
        public let code: String
        public let expiresAt: String
    }
    public struct Welcome: Codable, Sendable, Equatable {
        public let text: String?
        public let show: Bool
    }
    public let circle: Info
    public let members: [CirclePerson]
    public let invite: Invite?
    public let welcome: Welcome?
    public let posts: [CirclePost]
}

public struct CreatedID: Codable, Sendable, Equatable { public let id: String }
public struct InviteCode: Codable, Sendable, Equatable {
    public let code: String
    public let expiresAt: String
}

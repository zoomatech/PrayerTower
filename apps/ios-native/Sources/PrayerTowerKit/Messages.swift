import Foundation

/// A row in the Messages list (`ConversationSummary` in packages/shared).
public struct ConversationSummary: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    /// prayer | direct | group | care
    public let kind: String
    public let postId: String?
    public let title: String
    public let topic: String?
    public let isPublic: Bool
    /// A message request or group invite waiting on me.
    public let isRequest: Bool
    public let isOwner: Bool
    public let memberCount: Int
    public let lastMessage: String?
    public let lastMessageAt: String?
    public let unread: Int
}

public struct ChatMessage: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let mine: Bool
    public let author: String
    public let body: String
    public let crisis: Bool
    public let createdAt: String
}

/// One conversation and its messages (`GET /conversations/:id`).
public struct ConversationView: Codable, Sendable, Equatable {
    public struct Member: Codable, Sendable, Equatable {
        /// nil for anonymous members.
        public let id: String?
        public let name: String
        public let invited: Bool
        public let isOwner: Bool
    }
    public struct PostRef: Codable, Sendable, Equatable {
        public let id: String
        public let excerpt: String
    }
    public struct Info: Codable, Sendable, Equatable {
        public let id: String
        public let kind: String
        public let title: String
        public let topic: String?
        public let isPublic: Bool
        public let isRequest: Bool
        public let isOwner: Bool
        /// I started it and the other person hasn't replied yet.
        public let awaitingReply: Bool
        public let post: PostRef?
        /// Everyone but me.
        public let members: [Member]

        public var isGroup: Bool { kind == "group" }
        /// The other person in a note or direct message.
        public var other: Member? { isGroup ? nil : members.first }
        /// Who can invite: the owner, or anyone in an open group.
        public var canInvite: Bool { isGroup && !isRequest && (isOwner || isPublic) }
        /// Writing waits until the request is accepted and, for a first message, until they reply.
        public var canWrite: Bool { !isRequest && !awaitingReply }
    }
    public let conversation: Info
    public let messages: [ChatMessage]
}

public struct PublicGroup: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let topic: String?
    public let memberCount: Int
    public let joined: Bool
    public let lastMessageAt: String?
}

public struct Connection: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let displayName: String
    public let handle: String?
    enum CodingKeys: String, CodingKey {
        case id, handle
        case displayName = "display_name"
    }
}

public enum Messages {
    /// MESSAGE_MAX_CHARS in packages/shared.
    public static let maxChars = 2000
    /// New messages are fetched this often while a conversation is open, as in the Expo app.
    public static let pollSeconds = 5

    /// Requests and invites first, then the rest, each in the server's order.
    public static func split(_ all: [ConversationSummary]) -> (requests: [ConversationSummary], rest: [ConversationSummary]) {
        (all.filter(\.isRequest), all.filter { !$0.isRequest })
    }
}

public struct NewGroup: Encodable, Sendable, Equatable {
    public let title: String
    public let topic: String?
    public let isPublic: Bool
    public let memberIds: [String]

    public init(title: String, topic: String?, isPublic: Bool, memberIds: [String] = []) {
        self.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let t = topic?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.topic = t?.isEmpty == false ? t : nil
        self.isPublic = isPublic
        self.memberIds = memberIds
    }
}

public struct SentMessage: Decodable, Sendable {
    public struct Inner: Decodable, Sendable {
        public let id: String
        public let crisis: Bool
    }
    public let message: Inner
    public let coolDown: Bool?
}

private struct Conversations: Decodable { let conversations: [ConversationSummary] }
private struct Groups: Decodable { let groups: [PublicGroup] }
private struct People: Decodable { let people: [Connection] }
private struct Opened: Decodable { let conversationId: String }

extension APIClient {
    public func conversations() async throws -> [ConversationSummary] { try await (get("/me/conversations") as Conversations).conversations }
    public func conversation(_ id: String) async throws -> ConversationView { try await get("/conversations/\(id)") }
    public func sendMessage(_ id: String, body: String) async throws -> SentMessage {
        try await post("/conversations/\(id)/messages", body: ["body": body.trimmingCharacters(in: .whitespacesAndNewlines)])
    }
    public func markConversationRead(_ id: String) async throws -> Ignored { try await post("/conversations/\(id)/read", body: [String: String]()) }
    public func acceptConversation(_ id: String) async throws -> Ignored { try await post("/conversations/\(id)/accept", body: [String: String]()) }
    /// "No thanks", "Leave group" and "Close conversation".
    public func leaveConversation(_ id: String) async throws -> Ignored { try await post("/conversations/\(id)/decline", body: [String: String]()) }
    public func groups() async throws -> [PublicGroup] { try await (get("/groups") as Groups).groups }
    public func joinGroup(_ id: String) async throws -> Ignored { try await post("/conversations/\(id)/join", body: [String: String]()) }
    /// Returns the new group's conversation id.
    public func createGroup(_ g: NewGroup) async throws -> String { try await (post("/conversations/groups", body: g) as Opened).conversationId }
    public func inviteToGroup(_ id: String, userIds: [String]) async throws -> Ignored { try await post("/conversations/\(id)/invite", body: ["userIds": userIds]) }
    public func connections() async throws -> [Connection] { try await (get("/me/connections") as People).people }
    public func block(_ userId: String) async throws -> Ignored { try await send(request("PUT", "/people/\(userId)/block")) }
}

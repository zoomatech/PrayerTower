import Foundation

// Notices (apps/mobile/src/app/(tabs)/notifications.tsx): the member's in-app notes, newest
// first. With `pathBack`, a removal notice offers "Post again with changes": the author's own
// words open in the composer to change and share again.

public struct AppNotice: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let kind: String
    public let title: String
    public let body: String
    public let data: [String: JSONValue]
    public let readAt: String?
    public let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, kind, title, body, data
        case readAt = "read_at"
        case createdAt = "created_at"
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decode(String.self, forKey: .kind)
        title = try c.decode(String.self, forKey: .title)
        body = try c.decodeIfPresent(String.self, forKey: .body) ?? ""
        data = (try? c.decode([String: JSONValue].self, forKey: .data)) ?? [:]
        readAt = try c.decodeIfPresent(String.self, forKey: .readAt)
        createdAt = try c.decode(String.self, forKey: .createdAt)
    }

    func string(_ k: String) -> String? { if case let .string(s) = data[k] { s } else { nil } }
    func flag(_ k: String) -> Bool { if case let .bool(b) = data[k] { b } else { false } }

    /// The post this notice is about, to open on tap.
    public var postId: String? { string("postId") }

    /// The removed post or comment the author may post again, when the moderator allowed it.
    public var postAgainItem: String? {
        kind == "moderation_notice" && flag("pathBack") ? string("itemId") : nil
    }
}

/// The author's own removed words (`GET /me/removed/:id`).
public struct RemovedWords: Codable, Sendable, Equatable {
    public let target: String
    public let body: String
    public let postType: String?
    public let postId: String?

    /// For a removed post: a new post to start from, the same type when it was a praise.
    public var newPost: NewPost? {
        guard target == "post" else { return nil }
        var p = NewPost()
        p.body = body
        if postType == "praise" { p.postType = "praise" }
        return p
    }
}

struct Notices: Codable { let notifications: [AppNotice] }
private struct ReadBody: Encodable { let ids: [String] }

extension APIClient {
    public func notices() async throws -> [AppNotice] { try await (get("/me/notifications") as Notices).notifications }
    public func markRead(_ ids: [String]) async throws {
        let _: Ignored = try await post("/me/notifications/read", body: ReadBody(ids: ids))
    }
    public func removedWords(_ itemId: String) async throws -> RemovedWords { try await get("/me/removed/\(itemId)") }
}

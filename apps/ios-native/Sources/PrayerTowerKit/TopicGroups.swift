import Foundation

// Groups (Steve, 2026-10-31): open topic groups like Facebook groups, starting with Cancer
// survivors. A feed of posts with comments and prayers, not a chat room (that is circles).
// Server: apps/server/src/modules/groups.

public struct GroupPerson: Codable, Sendable, Equatable {
    public let id: String
    public let displayName: String?
}

public struct TopicGroup: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let about: String?
    public let members: Int
    public let joined: Bool
    public let isLeader: Bool
    /// nil = led by Prayer Tower.
    public let leader: GroupPerson?
}

public struct TopicGroupComment: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let author: GroupPerson
    public let body: String
    public let createdAt: String
    public let canRemove: Bool
}

public struct TopicGroupPost: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let author: GroupPerson
    public let body: String
    public let createdAt: String
    public let prayed: Int
    public let prayedByMe: Bool
    public let canRemove: Bool
    public let comments: [TopicGroupComment]
}

public struct TopicGroupView: Codable, Sendable, Equatable {
    public let group: TopicGroup
    public let posts: [TopicGroupPost]
}

private struct TopicGroupList: Decodable { let groups: [TopicGroup] }

extension APIClient {
    public func topicGroups() async throws -> [TopicGroup] { try await (get("/topic-groups") as TopicGroupList).groups }
    public func topicGroup(_ id: String) async throws -> TopicGroupView { try await get("/topic-groups/\(id)") }
    public func createTopicGroup(name: String, about: String?) async throws -> CreatedID {
        var body = ["name": name]
        if let about, !about.isEmpty { body["about"] = about }
        return try await post("/topic-groups", body: body)
    }
    public func joinTopicGroup(_ id: String) async throws -> Ignored { try await post("/topic-groups/\(id)/join", body: [String: String]()) }
    public func leaveTopicGroup(_ id: String) async throws -> Ignored { try await post("/topic-groups/\(id)/leave", body: [String: String]()) }
    public func topicGroupPost(_ id: String, body text: String) async throws -> CreatedID { try await post("/topic-groups/\(id)/posts", body: ["body": text]) }
    public func topicGroupComment(postId: String, body text: String) async throws -> CreatedID { try await post("/topic-group-posts/\(postId)/comments", body: ["body": text]) }
    public func topicGroupPray(postId: String) async throws -> Ignored { try await post("/topic-group-posts/\(postId)/pray", body: [String: String]()) }
    public func removeTopicGroupPost(_ id: String) async throws -> Ignored { try await send(request("DELETE", "/topic-group-posts/\(id)")) }
    public func removeTopicGroupComment(_ id: String) async throws -> Ignored { try await send(request("DELETE", "/topic-group-comments/\(id)")) }
}

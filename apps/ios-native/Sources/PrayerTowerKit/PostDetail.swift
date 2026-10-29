import Foundation

/// One comment under a post (`Comment` in packages/shared).
public struct Comment: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let parentId: String?
    public let body: String
    /// The poster's own update on how things are going.
    public let isUpdate: Bool
    public let createdAt: String
    public let isMine: Bool?
    public let author: Identity
}

/// A comment in thread order, with how far to indent it.
public struct ThreadedComment: Sendable, Equatable, Identifiable {
    public let comment: Comment
    public let depth: Int
    public var id: String { comment.id }
}

public enum CommentThread {
    /// Each reply right after its parent, oldest first, indented at most `maxDepth` (as the
    /// Expo app's comment list, which stops indenting at the third level). A reply whose parent
    /// is gone is shown at the top level.
    public static func ordered(_ comments: [Comment], maxDepth: Int = 2) -> [ThreadedComment] {
        let ids = Set(comments.map(\.id))
        var children: [String?: [Comment]] = [:]
        for c in comments { children[c.parentId.flatMap { ids.contains($0) ? $0 : nil }, default: []].append(c) }
        var out: [ThreadedComment] = []
        func walk(_ parent: String?, _ depth: Int) {
            for c in (children[parent] ?? []).sorted(by: { $0.createdAt < $1.createdAt }) {
                out.append(ThreadedComment(comment: c, depth: min(depth, maxDepth)))
                walk(c.id, depth + 1)
            }
        }
        walk(nil, 0)
        return out
    }
}

/// Who prayed for a request (`GET /posts/:id/prayers`); anonymous people have no id.
public struct Prayers: Codable, Sendable, Equatable {
    public struct Person: Codable, Sendable, Equatable {
        public let id: String?
        public let displayName: String
    }
    public let count: Int
    public let people: [Person]
}

public struct NewComment: Encodable, Sendable, Equatable {
    public let body: String
    public let parentId: String?
    public let isUpdate: Bool?

    public init(body: String, parentId: String? = nil, isUpdate: Bool? = nil) {
        self.body = body.trimmingCharacters(in: .whitespacesAndNewlines)
        self.parentId = parentId
        self.isUpdate = isUpdate
    }
}

public struct AddedComment: Decodable, Sendable {
    public struct Inner: Decodable, Sendable {
        public let id: String
        public let crisis: Bool
        public let harm: HarmNote?
    }
    public let comment: Inner
    /// The thread is heated: a gentle note to take a breath.
    public let coolDown: Bool?
    /// The conversation is resting for a moment.
    public let resting: Bool?
}

/// Why someone reports a post: the Expo app's reasons, in the same order (actions.reasons.N).
public enum ReportReason {
    public static let all = ["Harmful or abusive", "Spam or selling", "Not a prayer or praise", "Someone may be in danger", "Something else"]
}

private struct PostWrapper: Decodable { let post: Card }
private struct CommentsWrapper: Decodable { let comments: [Comment] }
private struct Testimony: Encodable { let testimony: String? }

extension APIClient {
    public func post(_ id: String) async throws -> Card { try await (get("/posts/\(id)") as PostWrapper).post }
    public func comments(postId: String) async throws -> [Comment] { try await (get("/posts/\(postId)/comments") as CommentsWrapper).comments }
    public func addComment(postId: String, _ c: NewComment) async throws -> AddedComment { try await post("/posts/\(postId)/comments", body: c) }
    public func deleteComment(_ id: String) async throws -> Ignored { try await send(request("DELETE", "/comments/\(id)")) }
    public func prayers(postId: String) async throws -> Prayers { try await get("/posts/\(postId)/prayers") }
    /// Only the poster: marks it answered, with their testimony if they wrote one.
    public func markAnswered(postId: String, testimony: String? = nil) async throws -> Card {
        let t = testimony?.trimmingCharacters(in: .whitespacesAndNewlines)
        return try await (post("/posts/\(postId)/answered", body: Testimony(testimony: t?.isEmpty == false ? t : nil)) as PostWrapper).post
    }
    public func setTestimony(postId: String, _ body: String) async throws -> Card {
        try await (send(self.body(request("PUT", "/posts/\(postId)/testimony"), ["body": body])) as PostWrapper).post
    }
    public func removeTestimony(postId: String) async throws -> Card {
        try await (send(request("DELETE", "/posts/\(postId)/testimony")) as PostWrapper).post
    }
    public func deletePost(_ id: String) async throws -> Ignored { try await send(request("DELETE", "/posts/\(id)")) }
    public func report(targetType: String, targetId: String, reason: String) async throws -> Ignored {
        try await post("/reports", body: ["targetType": targetType, "targetId": targetId, "reason": reason])
    }
}

/// The pilot country's crisis line (`crisisLine('US')` in packages/shared), shown on requests and
/// comments that mention suicide or self-harm.
public enum CrisisLine {
    public static let title = "You are not alone"
    public static let body = "If you or someone you love is thinking about suicide or self-harm, talk to someone now. The 988 Suicide & Crisis Lifeline is free, confidential and open 24/7."
    public static let actions: [(label: String, url: String)] = [
        ("Call 988", "tel:988"), ("Text 988", "sms:988"), ("Chat online", "https://988lifeline.org/chat/"),
    ]
}

import Foundation

// Who can reply (`replyChoice`, reply-choice.tsx): the person who asked chooses everyone, only
// people who prayed, or no comments. Others who can't comment see a gentle note instead of the box.

public enum ReplyAudience: String, Codable, Sendable, CaseIterable { case everyone, supporters, none }

public struct ReplyChoiceState: Codable, Sendable, Equatable {
    public let enabled: Bool
    public let audience: ReplyAudience
    public let canComment: Bool
    public let isMine: Bool

    /// The comment box shows unless the switch is on and this member may not comment.
    public static func showsComposer(_ s: ReplyChoiceState?) -> Bool { s?.enabled != true || s!.canComment }

    /// The note shown in place of the box.
    public var noteKey: String { audience == .none ? "replyChoice.noneNote" : "replyChoice.supportersNote" }
}

private struct AudienceBody: Encodable { let audience: ReplyAudience }

extension APIClient {
    public func replyChoice(postId: String) async throws -> ReplyChoiceState { try await get("/posts/\(postId)/reply-choice") }
    public func setReplyChoice(postId: String, _ audience: ReplyAudience) async throws -> ReplyChoiceState {
        try await send(body(request("PUT", "/posts/\(postId)/reply-choice"), AudienceBody(audience: audience)))
    }
}

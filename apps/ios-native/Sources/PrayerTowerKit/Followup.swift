import Foundation

// "Share how it's going?" (`followupNudge`, followup-card.tsx): once, some days after a request
// someone prayed for, its author may tell the pray-ers how it's going. "Prefer not to say" is
// always there and closes it quietly.

public enum FollowupAnswer: String, Sendable, Codable, CaseIterable {
    case grateful, still, changed, `private`

    /// The three that open a box for a few words; "private" closes it quietly.
    public static let sharing: [FollowupAnswer] = [.grateful, .still, .changed]

    public var wordKey: String {
        switch self {
        case .grateful: "practices.followupGrateful"
        case .still: "practices.followupStill"
        case .changed: "practices.followupChanged"
        case .private: "practices.followupPrivate"
        }
    }

    /// What the author sees once it's sent.
    public var doneKey: String { self == .private ? "practices.followupQuiet" : "practices.followupThanks" }
}

public struct FollowupStatus: Codable, Sendable, Equatable { public let enabled: Bool; public let pending: Bool }
public struct FollowupResult: Codable, Sendable, Equatable { public let answer: FollowupAnswer; public let crisis: Bool }
private struct FollowupBody: Encodable { let answer: FollowupAnswer; let body: String? }

extension APIClient {
    public func followup(postId: String) async throws -> FollowupStatus { try await get("/posts/\(postId)/followup") }
    /// A few words are optional; blank sends none.
    public func answerFollowup(postId: String, _ answer: FollowupAnswer, body text: String? = nil) async throws -> FollowupResult {
        let words = text?.trimmingCharacters(in: .whitespacesAndNewlines)
        return try await post("/posts/\(postId)/followup", body: FollowupBody(answer: answer, body: words?.isEmpty == false ? words : nil))
    }
}

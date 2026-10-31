import Foundation

// Prayer resolution (`prayerResolution`, resolution-card.tsx; server modules/resolution): on the
// author's own request, "Has this prayer been answered?". Yes opens a two-answer survey; "Not
// yet" offers to repost or reword the prayer, and a free broadcast token when Admin offers one.
// Whether the prayer went out by radio is looked up on the server, never asked.

public enum ResolutionOutcome: String, Sendable, Codable, CaseIterable {
    case hoped
    case hisWill = "his_will"

    public var wordKey: String { self == .hoped ? "resolution.hoped" : "resolution.hisWill" }
    public var shortKey: String { self == .hoped ? "resolution.outcomeHoped" : "resolution.outcomeHisWill" }
}

public struct ResolutionStatus: Codable, Sendable, Equatable {
    public var enabled: Bool
    /// "Has this prayer been answered?" is waiting for an answer.
    public var pending: Bool
    /// nil: not answered yet; false: "not yet"; true: answered.
    public var answered: Bool?
    public var outcome: ResolutionOutcome?
    public var canRepost: Bool
    /// Free broadcast tokens the author may take now (0 = none).
    public var freeTokens: Int
    public var tokenClaimed: Bool
    public var repostedPostId: String?

    /// After "not yet": what the card still offers.
    public var notYet: Bool { answered == false && !pending }
    public var offersRepost: Bool { notYet && canRepost }
    public var offersToken: Bool { notYet && freeTokens > 0 }
    /// Whether the card has anything to show.
    public var showsCard: Bool { enabled && (pending || offersRepost || offersToken) }
}

public struct ResolutionReport: Codable, Sendable, Equatable {
    public struct Answered: Codable, Sendable, Equatable, Identifiable {
        public let postId: String
        public let who: String?
        public let outcome: ResolutionOutcome
        public let prayercast: Bool
        public let prayercastCount: Int
        public let prayercastAt: String?
        public let answeredAt: String
        public var id: String { postId }
    }
    public let totals: [String: Int]
    public let answered: [Answered]
}

public struct ResolutionToken: Codable, Sendable, Equatable { public let amount: Int; public let priestly: Int }

private struct ResolutionYes: Encodable { let answered = true; let outcome: ResolutionOutcome }
private struct ResolutionNotYet: Encodable { let answered = false }
private struct RepostBody: Encodable { let body: String? }
private struct RepostWrap: Decodable { let post: Card }
private struct Empty: Encodable {}

extension APIClient {
    public func resolution(postId: String) async throws -> ResolutionStatus { try await get("/posts/\(postId)/resolution") }
    /// nil outcome answers "Not yet".
    public func answerResolution(postId: String, outcome: ResolutionOutcome?) async throws -> ResolutionStatus {
        if let outcome { return try await post("/posts/\(postId)/resolution", body: ResolutionYes(outcome: outcome)) }
        return try await post("/posts/\(postId)/resolution", body: ResolutionNotYet())
    }
    /// Repost the request as it was, or with new words; returns the new request.
    public func repostResolution(postId: String, body text: String? = nil) async throws -> Card {
        let words = text?.trimmingCharacters(in: .whitespacesAndNewlines)
        return try await (post("/posts/\(postId)/resolution/repost", body: RepostBody(body: words?.isEmpty == false ? words : nil)) as RepostWrap).post
    }
    public func claimResolutionToken(postId: String) async throws -> ResolutionToken { try await post("/posts/\(postId)/resolution/token", body: Empty()) }
    public func resolutionReport() async throws -> ResolutionReport { try await get("/admin/resolution") }
}

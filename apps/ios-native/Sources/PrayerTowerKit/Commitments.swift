import Foundation

/// A promise to pray for (or check in on) a request on a schedule (`Commitment` in packages/shared).
public struct Commitment: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let postId: String
    public let frequency: String
    public let vowText: String
    /// active | completed | cancelled
    public let status: String
    public let nextReminderAt: String?
    public let committedCount: Int
    public let completedCount: Int
    public let endsAt: String?
    public let postExcerpt: String?

    enum CodingKeys: String, CodingKey {
        case id, frequency, status
        case postId = "post_id"
        case vowText = "vow_text"
        case nextReminderAt = "next_reminder_at"
        case committedCount = "committed_count"
        case completedCount = "completed_count"
        case endsAt = "ends_at"
        case postExcerpt = "post_excerpt"
    }

    public var isActive: Bool { status == "active" }
}

/// The week in kindness at the top of My Promises.
public struct WeeklyReview: Codable, Sendable, Equatable {
    public let prayers: Int
    public let checkins: Int
    public let people: Int
    public let active: Int
    public let kept: Int
    public let message: String
}

public enum Commitments {
    /// FREQUENCIES in packages/shared, in the same order.
    public static let frequencies = ["weekly", "daily", "three_daily"]
    public static let maxVow = 500
    public static let maxDays = 365

    /// The promise the sheet starts with (actions.promiseName / promiseYou).
    public static func defaultVow(for card: Card, words: Words) -> String {
        card.author.anonymous ? words("actions.promiseYou") : words("actions.promiseName", ["name": card.author.displayName])
    }

    /// "For how many days": blank or 0 means no end; anything else is kept within 1–365.
    public static func days(_ text: String) -> Int? {
        guard let n = Int(text.trimmingCharacters(in: .whitespaces)), n > 0 else { return nil }
        return min(n, maxDays)
    }
}

public struct NewCommitment: Encodable, Sendable, Equatable {
    public let frequency: String
    public let vowText: String
    public let durationDays: Int?

    public init(frequency: String, vowText: String, durationDays: Int? = nil) {
        self.frequency = frequency
        self.vowText = vowText.trimmingCharacters(in: .whitespacesAndNewlines)
        self.durationDays = durationDays
    }
}

/// A change from the Edit panel; only the fields set are sent.
public struct CommitmentEdit: Encodable, Sendable, Equatable {
    public var frequency: String?
    public var vowText: String?
    public var status: String?
    public var completedCount: Int?

    public init(frequency: String? = nil, vowText: String? = nil, status: String? = nil, completedCount: Int? = nil) {
        self.frequency = frequency
        self.vowText = vowText?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.status = status
        self.completedCount = completedCount
    }
}

public struct CommitmentList: Decodable, Sendable {
    public let commitments: [Commitment]
    public let note: String
}

private struct OneCommitment: Decodable { let commitment: Commitment }

extension APIClient {
    public func commit(postId: String, _ c: NewCommitment) async throws -> Commitment {
        try await (post("/posts/\(postId)/commitments", body: c) as OneCommitment).commitment
    }
    public func commitments() async throws -> CommitmentList { try await get("/me/commitments") }
    public func weeklyReview() async throws -> WeeklyReview { try await get("/me/commitments/review") }
    public func checkIn(_ id: String) async throws -> Commitment {
        try await (post("/commitments/\(id)/check-in", body: [String: Int]()) as OneCommitment).commitment
    }
    public func snooze(_ id: String, minutes: Int = 60) async throws -> Commitment {
        try await (post("/commitments/\(id)/snooze", body: ["minutes": minutes]) as OneCommitment).commitment
    }
    public func editCommitment(_ id: String, _ edit: CommitmentEdit) async throws -> Commitment {
        try await (send(body(request("PATCH", "/commitments/\(id)"), edit)) as OneCommitment).commitment
    }
}

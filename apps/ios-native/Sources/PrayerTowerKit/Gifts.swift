import Foundation

/// A donated pool a member can draw from for a request (`GET /token-pools?postId=`).
public struct TokenPool: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let drawAmount: Int
    public let balance: Int
    /// Only when listed for a request: why the member can't draw, or nil.
    public let blockedReason: String?
}

/// A token gift set to go to a request later (`GET /me/scheduled-spends`).
public struct ScheduledSpend: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let postId: String
    public let amount: Int
    public let nextRunAt: String
    public let repeatWeeks: Int
    public let runs: Int
    /// reach gives tokens; radio and amplify send the request by radio at that time.
    public let action: String?
    /// active | done | cancelled | failed
    public let status: String
    public let error: String?
    public let excerpt: String

    enum CodingKeys: String, CodingKey {
        case id, amount, runs, action, status, error, excerpt
        case postId = "post_id"
        case nextRunAt = "next_run_at"
        case repeatWeeks = "repeat_weeks"
    }
}

/// The gift sheet's choices, as apps/mobile/src/lib/schedule.ts.
public enum GiftSchedule {
    public struct When: Sendable, Equatable, Identifiable {
        public let key: String
        /// 0 = Sunday.
        public let weekday: Int
        public let hour: Int
        public var id: String { key }
    }

    public static let whens = [When(key: "fri", weekday: 5, hour: 19), When(key: "sat", weekday: 6, hour: 9), When(key: "sun", weekday: 0, hour: 9)]
    public static let repeats = [1, 4, 12]

    /// The next given weekday at hour:00 in `calendar`'s time zone, at least a minute away.
    public static func next(_ w: When, from: Date = .now, calendar: Calendar = .current) -> Date {
        var d = calendar.date(bySettingHour: w.hour, minute: 0, second: 0, of: from)!
        let today = calendar.component(.weekday, from: from) - 1
        d = calendar.date(byAdding: .day, value: (w.weekday - today + 7) % 7, to: d)!
        if d.timeIntervalSince(from) <= 60 { d = calendar.date(byAdding: .day, value: 7, to: d)! }
        return d
    }

    /// The pools worth offering: drawable, fullest first, at most three.
    public static func offered(_ pools: [TokenPool]) -> [TokenPool] {
        Array(pools.filter { $0.blockedReason == nil }.sorted { $0.balance > $1.balance }.prefix(3))
    }
}

private struct NewSpend: Encodable { let amount: Int; let runAt: String; let repeatWeeks: Int }
private struct Pools: Decodable { let pools: [TokenPool] }
private struct Schedules: Decodable { let schedules: [ScheduledSpend] }
private struct Boost: Encodable { let amount: Int; let idempotencyKey: String }

extension APIClient {
    /// Gives tokens to a request now.
    public func boost(postId: String, amount: Int) async throws -> Ignored {
        try await post("/posts/\(postId)/boost", body: Boost(amount: amount, idempotencyKey: "\(postId):\(UUID().uuidString)"))
    }
    public func scheduleSpend(postId: String, amount: Int, at: Date, repeatWeeks: Int) async throws -> Ignored {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return try await post("/posts/\(postId)/scheduled-spends", body: NewSpend(amount: amount, runAt: f.string(from: at), repeatWeeks: repeatWeeks))
    }
    public func scheduledSpends() async throws -> [ScheduledSpend] { try await (get("/me/scheduled-spends") as Schedules).schedules }
    public func cancelScheduledSpend(_ id: String) async throws -> Ignored { try await send(request("DELETE", "/scheduled-spends/\(id)")) }
    public func tokenPools(postId: String) async throws -> [TokenPool] { try await (get("/token-pools", query: ["postId": postId]) as Pools).pools }
    public func drawFromPool(_ id: String, postId: String) async throws -> Ignored { try await post("/token-pools/\(id)/draw", body: ["postId": postId]) }
}

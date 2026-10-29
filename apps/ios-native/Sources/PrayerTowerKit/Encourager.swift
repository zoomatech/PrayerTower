import Foundation

// Encourager (docs/GROWTH_PRACTICES.md, `encourager`): a newcomer can ask for one welcoming
// volunteer for their first weeks. Either side ends it with one tap and no reason, and it ends on
// its own. With `encouragerCheckin`, both are asked once, "How is it going?". No streaks, and
// never "they're waiting".

public struct EncouragerMatch: Codable, Sendable, Equatable, Identifiable {
    public struct Other: Codable, Sendable, Equatable { public let id: String; public let displayName: String }
    public let id: String
    /// This member's side: "newcomer" (they have an encourager) or "encourager".
    public let role: String
    public let other: Other
    public let endsAt: String
    public let checkInDue: Bool?

    public var isNewcomer: Bool { role == "newcomer" }

    /// "Your encourager is Ruth" / "You're encouraging Sam", and the line under it with the end date.
    public func lines(_ w: Words, endDate: String) -> (title: String, hint: String) {
        let name = ["name": other.displayName]
        return isNewcomer
            ? (w("practices.encYours", name), w("practices.encYoursHint", ["date": endDate]))
            : (w("practices.encYouEncourage", name), w("practices.encYouEncourageHint", ["date": endDate]))
    }
}

/// `GET /me/encourager`: `enabled` false while the switch is off.
public struct EncouragerState: Codable, Sendable, Equatable {
    public let enabled: Bool
    public let volunteer: Bool
    public let canAsk: Bool
    public let matches: [EncouragerMatch]
    /// After asking: false when no volunteer was free.
    public let matched: Bool?

    enum CodingKeys: String, CodingKey { case enabled, volunteer, canAsk, matches, matched }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try c.decode(Bool.self, forKey: .enabled)
        volunteer = try c.decodeIfPresent(Bool.self, forKey: .volunteer) ?? false
        canAsk = try c.decodeIfPresent(Bool.self, forKey: .canAsk) ?? false
        matches = try c.decodeIfPresent([EncouragerMatch].self, forKey: .matches) ?? []
        matched = try c.decodeIfPresent(Bool.self, forKey: .matched)
    }
}

public enum CheckInAnswer: String, Sendable, CaseIterable, Encodable { case good, okay, change }

/// "October 30", as the Expo card shows the end date.
public func encouragerDay(_ iso: String, locale: Locale = .current) -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    guard let date else { return iso }
    let out = DateFormatter()
    out.locale = locale
    out.setLocalizedDateFormatFromTemplate("MMMMd")
    return out.string(from: date)
}

private struct VolunteerBody: Encodable { let on: Bool; let agree: Bool? }
private struct CheckInBody: Encodable { let answer: CheckInAnswer }
private struct Empty: Encodable {}

extension APIClient {
    public func encourager() async throws -> EncouragerState { try await get("/me/encourager") }
    /// Volunteering needs the member to agree to the encourager's few rules first.
    public func setVolunteer(_ on: Bool) async throws -> EncouragerState {
        try await send(body(request("PUT", "/me/encourager/volunteer"), VolunteerBody(on: on, agree: on ? true : nil)))
    }
    public func askForEncourager() async throws -> EncouragerState { try await post("/me/encourager/ask", body: Empty()) }
    public func endEncouragerMatch(_ id: String) async throws -> EncouragerState {
        try await send(request("DELETE", "/me/encourager/matches/\(id)"))
    }
    public func encouragerCheckIn(_ id: String, _ answer: CheckInAnswer) async throws -> EncouragerState {
        try await post("/me/encourager/matches/\(id)/check-in", body: CheckInBody(answer: answer))
    }
}

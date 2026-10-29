import Foundation

// "Three good things" (docs/GROWTH_PRACTICES.md, `gratitudeCard`): a private weekly card on Me,
// with an optional reminder on the day the member picks. A skipped week is never mentioned.

/// `GET /me/gratitude`: `enabled` false while the switch is off.
public struct Gratitude: Codable, Sendable, Equatable {
    public let enabled: Bool
    /// 0 = Sunday … 6 = Saturday; nil for no reminder.
    public let weekday: Int?
    public let weekStart: String?
    public let items: [String]
    /// Weeks the member has kept it (gratitude count), when that is on.
    public let weeks: Int?

    enum CodingKeys: String, CodingKey { case enabled, weekday, weekStart, items, weeks }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try c.decode(Bool.self, forKey: .enabled)
        weekday = try c.decodeIfPresent(Int.self, forKey: .weekday)
        weekStart = try c.decodeIfPresent(String.self, forKey: .weekStart)
        items = try c.decodeIfPresent([String].self, forKey: .items) ?? []
        weeks = try c.decodeIfPresent(Int.self, forKey: .weeks)
    }

    /// The three boxes, filled from what's saved this week.
    public var boxes: [String] { (0..<3).map { $0 < items.count ? items[$0] : "" } }

    /// What gets saved or shared: the boxes with words in them, trimmed.
    public static func filled(_ boxes: [String]) -> [String] {
        boxes.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
    }

    /// A praise post with the good things, one per line, for "Share as praise".
    public static func praise(_ boxes: [String]) -> NewPost {
        var p = NewPost()
        p.postType = "praise"
        p.body = filled(boxes).joined(separator: "\n")
        return p
    }
}

private struct GratitudeItems: Encodable { let items: [String]; let timeZone: String }
private struct GratitudeDay: Encodable {
    let weekday: Int?
    let timeZone: String
    // Sends "weekday": null to turn the reminder off.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(weekday, forKey: .weekday)
        try c.encode(timeZone, forKey: .timeZone)
    }
    enum CodingKeys: String, CodingKey { case weekday, timeZone }
}

extension APIClient {
    public func gratitude(timeZone: String = TimeZone.current.identifier) async throws -> Gratitude {
        try await get("/me/gratitude", query: ["tz": timeZone])
    }
    public func saveGratitude(_ items: [String], timeZone: String = TimeZone.current.identifier) async throws -> Gratitude {
        try await send(body(request("PUT", "/me/gratitude"), GratitudeItems(items: items, timeZone: timeZone)))
    }
    public func setGratitudeDay(_ weekday: Int?, timeZone: String = TimeZone.current.identifier) async throws -> Gratitude {
        try await send(body(request("PUT", "/me/gratitude/day"), GratitudeDay(weekday: weekday, timeZone: timeZone)))
    }
}

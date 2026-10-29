import Foundation

/// Fresh starts on days that matter: up to three of a member's own dates (`/me/fresh-days`).
public struct FreshStartDay: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let month: Int
    public let day: Int
    public let label: String
}

public struct FreshDays: Codable, Sendable, Equatable {
    public let days: [FreshStartDay]
}

public enum FreshDayRules {
    public static let maxDays = 3
    public static let maxLabel = 40

    /// The same checks as the server: a label of 1 to 40 characters and a date that exists in a leap year.
    public static func isValid(month: Int, day: Int, label: String) -> Bool {
        let name = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= maxLabel, (1...12).contains(month), day >= 1 else { return false }
        var c = DateComponents()
        c.year = 2024
        c.month = month
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        guard let first = cal.date(from: c), let range = cal.range(of: .day, in: .month, for: first) else { return false }
        return range.contains(day)
    }
}

/// Today's fresh start, from `GET /me/prayer-stats` (`stats.freshDay`): the member's own day, or
/// in faith wording the first day of Advent, Lent or Easter. Nil on every other day.
public struct FreshDay: Codable, Sendable, Equatable {
    public let label: String?
    public let season: String?

    /// The same words as `freshDays.today` and the season lines in apps/mobile en.ts.
    public var line: String? {
        let ask = "A fresh start: want to pick one small intention?"
        if let label { return "Today is \(label). \(ask)" }
        switch season {
        case "advent": return "Advent begins today. \(ask)"
        case "lent": return "Lent begins today. \(ask)"
        case "easter": return "Easter today. \(ask)"
        default: return nil
        }
    }
}

struct StatsWrapper: Decodable {
    struct Stats: Decodable { let freshDay: FreshDay? }
    let stats: Stats
}

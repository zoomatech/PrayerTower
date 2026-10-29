import Foundation

// Admin → Kindness (admin.tsx): the kindness starter set, which turns the no-cost kindness
// tools on or off in one tap (each keeps its own switch), and the kindness weather, one line a
// week from totals only, with quiet weeks folded.

public struct KindnessStarter: Codable, Sendable, Equatable {
    public struct Item: Codable, Sendable, Equatable { public let key: String; public let on: Bool }
    public let items: [Item]
    public let allOn: Bool
    public let anyOn: Bool

    public var onCount: Int { items.filter(\.on).count }
}

public struct WeatherWeek: Codable, Sendable, Equatable, Identifiable {
    public let weekStart: String
    /// sunny, fair, cloudy, stormy or quiet.
    public let weather: String
    public let comments: Int?
    public let warm: Int?
    public let heated: Int?
    public let prayers: Int?
    public let people: Int?
    public var id: String { weekStart }

    public var sky: String { ["sunny": "☀️", "fair": "🌤️", "cloudy": "☁️", "stormy": "⛈️", "quiet": "🌫️"][weather] ?? "🌫️" }

    /// "Week of 2026-10-26: Sunny", and the totals line unless the week was too quiet to show numbers.
    public func lines(_ w: Words) -> (title: String, numbers: String?) {
        let title = "\(w("weather.week", ["date": weekStart])): \(w("weather.\(weather)"))"
        guard let comments else { return (title, nil) }
        let n = ["comments": comments, "warm": warm ?? 0, "heated": heated ?? 0, "lifts": prayers ?? 0, "people": people ?? 0].mapValues(String.init)
        return (title, w("weather.numbers", n))
    }
}

public struct KindnessWeather: Codable, Sendable, Equatable { public let enabled: Bool; public let weeks: [WeatherWeek] }
private struct StarterBody: Encodable { let on: Bool }

extension APIClient {
    public func kindnessStarter() async throws -> KindnessStarter { try await get("/admin/kindness-starter") }
    public func setKindnessStarter(_ on: Bool) async throws -> KindnessStarter { try await post("/admin/kindness-starter", body: StarterBody(on: on)) }
    public func kindnessWeather(weeks: Int = 12) async throws -> KindnessWeather {
        try await get("/admin/kindness-weather", query: ["weeks": String(weeks)])
    }
}

import Foundation

// Parallels and reading plans from the library, as the Expo app's parallels.tsx and reading-plans.tsx
// (docs/LIBRARY_SEARCH.md). Both are off unless an admin turns them on; the server leaves the Bible out
// for Open Circle.

/// Passages from one place in a collection, with their citation.
public struct LibraryExcerpt: Codable, Sendable, Equatable {
    public let collection: String
    public let collectionTitle: String
    public let work: LibraryHit.Work
    public let ref: String
    public let text: String
    public let citation: String
}

public struct ParallelThemes: Decodable, Sendable, Equatable {
    public struct Theme: Codable, Sendable, Equatable, Identifiable {
        public let id: String
        public let title: String
        public let intro: String
        public let texts: [String]
    }
    public let enabled: Bool
    public let themes: [Theme]
    enum CodingKeys: String, CodingKey { case enabled, themes }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try c.decode(Bool.self, forKey: .enabled)
        themes = try c.decodeIfPresent([Theme].self, forKey: .themes) ?? []
    }
}

public struct ParallelTheme: Decodable, Sendable, Equatable {
    public struct Side: Decodable, Sendable, Equatable {
        public let label: String?
        public let excerpt: LibraryExcerpt
        public init(from decoder: Decoder) throws {
            label = try decoder.container(keyedBy: Key.self).decodeIfPresent(String.self, forKey: .label)
            excerpt = try LibraryExcerpt(from: decoder)
        }
        enum Key: String, CodingKey { case label }
    }
    public let id: String
    public let title: String
    public let intro: String
    public let sides: [Side]
}

public struct PlanProgress: Codable, Sendable, Equatable {
    public struct Circle: Codable, Sendable, Equatable {
        public let id: String
        public let name: String
    }
    public let read: Int
    /// The first day not yet read; nil once every day is read.
    public let next: Int?
    public let finished: Bool
    public let reminders: Bool
    public let circle: Circle?
}

public struct LibraryPlan: Codable, Sendable, Equatable, Identifiable {
    public struct CircleReading: Codable, Sendable, Equatable, Identifiable {
        public let id: String
        public let name: String
        public let readers: Int
    }
    public let id: String
    public let title: String
    public let intro: String
    public let days: Int
    public let faith: Bool
    public let following: PlanProgress?
    public let circles: [CircleReading]
}

public struct LibraryPlanList: Decodable, Sendable, Equatable {
    public let enabled: Bool
    public let circles: [PlanProgress.Circle]
    public let plans: [LibraryPlan]
    enum CodingKeys: String, CodingKey { case enabled, circles, plans }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try c.decode(Bool.self, forKey: .enabled)
        circles = try c.decodeIfPresent([PlanProgress.Circle].self, forKey: .circles) ?? []
        plans = try c.decodeIfPresent([LibraryPlan].self, forKey: .plans) ?? []
    }
}

public struct LibraryPlanDay: Codable, Sendable, Equatable {
    public struct Plan: Codable, Sendable, Equatable {
        public let id: String
        public let title: String
        public let days: Int
    }
    public struct Circle: Codable, Sendable, Equatable {
        public let id: String
        public let name: String
        public let readers: Int
        public let reading: Int
    }
    public let plan: Plan
    public let day: Int
    public let reading: LibraryExcerpt
    public let read: Bool
    public let following: PlanProgress?
    public let circle: Circle?
}

private struct FollowPlan: Encodable {
    let circleId: String?
    let reminders: Bool?
}

extension APIClient {
    public func parallels() async throws -> ParallelThemes { try await get("/library/parallels") }
    public func parallel(_ id: String) async throws -> ParallelTheme { try await get("/library/parallels/\(id)") }
    public func readingPlans() async throws -> LibraryPlanList { try await get("/library/plans") }
    public func followPlan(_ id: String, circleId: String? = nil, reminders: Bool? = nil) async throws -> LibraryPlanList {
        try await send(body(request("PUT", "/library/plans/\(id)/follow"), FollowPlan(circleId: circleId, reminders: reminders)))
    }
    public func unfollowPlan(_ id: String) async throws -> LibraryPlanList { try await send(request("DELETE", "/library/plans/\(id)/follow")) }
    public func planDay(_ id: String, day: Int) async throws -> LibraryPlanDay { try await get("/library/plans/\(id)/days/\(day)") }
    public func readPlanDay(_ id: String, day: Int) async throws -> LibraryPlanDay {
        try await send(body(request("POST", "/library/plans/\(id)/days/\(day)/read"), [String: String]()))
    }
}

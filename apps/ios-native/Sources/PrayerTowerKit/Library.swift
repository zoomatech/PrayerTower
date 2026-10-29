import Foundation

// Scripture and ancient writings search, as the Expo app's library.tsx (docs/LIBRARY_SEARCH.md):
// off unless an admin turns it on. The King James Bible for faith communities, the public-domain
// ancient writings for everyone; members type words and get passages, best first.

public struct LibraryCollection: Codable, Sendable, Equatable, Identifiable {
    /// bible-kjv | ancient-writings
    public let id: String
    public let title: String
    public let faith: Bool
}

public struct LibraryOverview: Decodable, Sendable, Equatable {
    public let enabled: Bool
    public let collections: [LibraryCollection]
    enum CodingKeys: String, CodingKey { case enabled, collections }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        enabled = try c.decode(Bool.self, forKey: .enabled)
        collections = try c.decodeIfPresent([LibraryCollection].self, forKey: .collections) ?? []
    }
}

public struct LibraryHit: Codable, Sendable, Equatable {
    public struct Work: Codable, Sendable, Equatable {
        public let id: String
        public let title: String
        public let author: String
    }
    public let ref: String
    public let text: String
    /// False when the passage holds only some of the words ("near matches").
    public let complete: Bool
    public let work: Work
}

public struct LibraryResults: Codable, Sendable, Equatable {
    public let total: Int
    public let source: String
    public let hits: [LibraryHit]
}

public enum Library {
    public static let page = 20
    public static let bible = "bible-kjv"
}

private struct LibrarySwitch: Codable { let enabled: Bool }

extension APIClient {
    public func library() async throws -> LibraryOverview { try await get("/library") }
    public func searchLibrary(_ q: String, collection: String, offset: Int = 0, limit: Int = Library.page) async throws -> LibraryResults {
        try await get("/library/search", query: ["q": q.trimmingCharacters(in: .whitespaces), "collection": collection, "offset": String(offset), "limit": String(limit)])
    }
    /// Admin: the library's on/off switch.
    public func libraryOn() async throws -> Bool { try await (get("/admin/library") as LibrarySwitch).enabled }
    public func setLibrary(_ on: Bool) async throws -> Bool { try await (send(body(request("PATCH", "/admin/library"), LibrarySwitch(enabled: on))) as LibrarySwitch).enabled }
}

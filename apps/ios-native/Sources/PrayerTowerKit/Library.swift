import Foundation

/// Scripture and ancient writings search (`/library`, docs/LIBRARY_SEARCH.md). Off by default.
public struct LibraryCollection: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let faith: Bool
}

public struct LibraryOverview: Codable, Sendable, Equatable {
    public let enabled: Bool
    public let collections: [LibraryCollection]?
}

public struct LibraryHit: Codable, Sendable, Equatable {
    public struct Work: Codable, Sendable, Equatable {
        public let id: String
        public let title: String
        public let author: String
    }
    public let ref: String
    public let text: String
    public let complete: Bool
    public let work: Work
}

public struct LibraryResults: Codable, Sendable, Equatable {
    public let total: Int
    public let source: String
    public let hits: [LibraryHit]
}

extension APIClient {
    public func library() async throws -> LibraryOverview { try await get("/library") }
    /// The word search, best first, a page at a time.
    public func searchLibrary(_ q: String, collection: String, offset: Int = 0, limit: Int = 20) async throws -> LibraryResults {
        try await get("/library/search", query: ["q": q, "collection": collection, "offset": String(offset), "limit": String(limit)])
    }
}

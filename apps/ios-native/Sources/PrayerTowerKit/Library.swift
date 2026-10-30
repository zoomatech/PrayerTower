import Foundation

// Scripture and ancient writings search, as the Expo app's library.tsx (docs/LIBRARY_SEARCH.md):
// off unless an admin turns it on. The King James Bible for faith communities, the public-domain
// ancient writings for everyone; members type words and get passages, best first.

public struct LibraryCollection: Codable, Sendable, Equatable, Identifiable {
    /// bible-kjv | apocrypha-kjv | ancient-writings | oldest-texts | world-classics
    public let id: String
    public let title: String
    public let faith: Bool
    public init(id: String, title: String, faith: Bool) {
        self.id = id
        self.title = title
        self.faith = faith
    }
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
    public init(enabled: Bool, collections: [LibraryCollection]) {
        self.enabled = enabled
        self.collections = collections
    }
}

public struct LibraryHit: Codable, Sendable, Equatable {
    public struct Work: Codable, Sendable, Equatable {
        public let id: String
        public let title: String
        public let author: String
        public init(id: String, title: String, author: String) {
            self.id = id
            self.title = title
            self.author = author
        }
    }
    public let ref: String
    public let text: String
    /// False when the passage holds only some of the words ("near matches").
    public let complete: Bool
    public let work: Work
    /// "Psalms 23:1 (King James Bible)": what a shared passage is credited to.
    public let citation: String?
    /// The passage's lasting name, for highlights and notes; nil from an older server or an offline copy.
    public var key: String? = nil

    public init(ref: String, text: String, complete: Bool, work: Work, citation: String?, key: String? = nil) {
        self.ref = ref
        self.text = text
        self.complete = complete
        self.work = work
        self.citation = citation
        self.key = key
    }

    /// The citation, or the work's title from a server too old to send one.
    public var credit: String { citation ?? (ref.isEmpty ? work.title : "\(work.title), \(ref)") }
}

/// Today's passage for the feed card (GET /library/daily), the same all day.
public struct LibraryDaily: Decodable, Sendable, Equatable {
    public let enabled: Bool
    public let day: String?
    /// Whether the card may offer Share.
    public let share: Bool?
    public let passage: LibraryHit?
}

/// Admin: text search and its extras: sharing, the daily card, parallels, reading plans, word study, notes and offline texts.
/// Nil fields are left as they are.
public struct LibrarySettings: Codable, Sendable, Equatable {
    public var enabled: Bool?
    public var shareEnabled: Bool?
    public var dailyEnabled: Bool?
    public var parallelsEnabled: Bool?
    public var plansEnabled: Bool?
    public var wordsEnabled: Bool?
    public var notesEnabled: Bool?
    public var offlineEnabled: Bool?
    public var listenEnabled: Bool?
    public var studiesEnabled: Bool?
    public init(
        enabled: Bool? = nil, shareEnabled: Bool? = nil, dailyEnabled: Bool? = nil, parallelsEnabled: Bool? = nil, plansEnabled: Bool? = nil,
        wordsEnabled: Bool? = nil, notesEnabled: Bool? = nil, offlineEnabled: Bool? = nil, listenEnabled: Bool? = nil, studiesEnabled: Bool? = nil
    ) {
        self.enabled = enabled
        self.shareEnabled = shareEnabled
        self.dailyEnabled = dailyEnabled
        self.parallelsEnabled = parallelsEnabled
        self.plansEnabled = plansEnabled
        self.wordsEnabled = wordsEnabled
        self.notesEnabled = notesEnabled
        self.offlineEnabled = offlineEnabled
        self.listenEnabled = listenEnabled
        self.studiesEnabled = studiesEnabled
    }
}

public struct LibraryResults: Codable, Sendable, Equatable {
    public let total: Int
    public let source: String
    public let hits: [LibraryHit]
}

public enum Library {
    public static let page = 20
    public static let bible = "bible-kjv"

    /// A new post holding the passage in quotes and where it is from, for the member to edit (Share a passage).
    public static func shared(_ text: String, citation: String) -> NewPost {
        var post = NewPost()
        post.body = String("“\(text.trimmingCharacters(in: .whitespacesAndNewlines))”\n— \(citation)".prefix(5000))
        return post
    }
}

extension APIClient {
    public func library() async throws -> LibraryOverview { try await get("/library") }
    public func searchLibrary(_ q: String, collection: String, offset: Int = 0, limit: Int = Library.page) async throws -> LibraryResults {
        try await get("/library/search", query: ["q": q.trimmingCharacters(in: .whitespaces), "collection": collection, "offset": String(offset), "limit": String(limit)])
    }
    public func libraryDaily() async throws -> LibraryDaily { try await get("/library/daily") }
    /// Admin: the library's switches.
    public func librarySettings() async throws -> LibrarySettings { try await get("/admin/library") }
    public func setLibrary(_ patch: LibrarySettings) async throws -> LibrarySettings { try await send(body(request("PATCH", "/admin/library"), patch)) }
}

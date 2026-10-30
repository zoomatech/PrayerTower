import Foundation

// Listening and circle study rooms, as the Expo app's listen-passage.tsx and study-rooms.tsx
// (docs/LIBRARY_SEARCH.md). Both are off unless an admin turns them on; study rooms also need prayer circles.

/// A public-domain LibriVox recording of the place a passage is in.
public struct LibraryRecording: Codable, Sendable, Equatable {
    public let url: String
    public let title: String
    public let project: String
    public let readers: [String]
    public let seconds: Int
    /// "Read by … for LibriVox: Bible (KJV) 19: Psalms, “…”. Public domain."
    public let credit: String
    public let projectUrl: String
}

struct RecordingAnswer: Decodable { let recording: LibraryRecording? }

public struct LibraryStudy: Codable, Sendable, Equatable, Identifiable {
    public struct Person: Codable, Sendable, Equatable {
        public let id: String
        public let displayName: String?
    }
    public struct Passage: Codable, Sendable, Equatable {
        public let collection: String
        public let ref: String
        public let key: String
        public let quote: String
        public let citation: String
    }
    public struct Plan: Codable, Sendable, Equatable {
        public let id: String
        public let title: String
        public let day: Int
    }
    public let id: String
    public let circleId: String
    public let prompt: String
    public let author: Person
    public let createdAt: String
    public let passage: Passage
    public let plan: Plan?
    public let replies: Int
    public let lastReplyAt: String?
    public let canRemove: Bool
}

public struct StudyList: Codable, Sendable, Equatable {
    public struct Circle: Codable, Sendable, Equatable {
        public let id: String
        public let name: String
    }
    public let circle: Circle
    public let studies: [LibraryStudy]
}

public struct StudyReply: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let author: LibraryStudy.Person
    public let body: String
    public let createdAt: String
    public let canRemove: Bool
    /// Answers to this reply (one level deep); nil on an answer itself.
    public let answers: [StudyReply]?
}

public struct StudyRoom: Codable, Sendable, Equatable {
    public let study: LibraryStudy
    public let replies: [StudyReply]
}

/// What a study is of: a passage, or a day of a reading plan.
public enum StudySubject: Sendable, Equatable {
    case passage(collection: String, key: String)
    case planDay(planId: String, day: Int)
}

struct StartStudy: Encodable {
    let circleId: String
    let prompt: String
    var collection: String?
    var key: String?
    var planId: String?
    var day: Int?
}

struct NewStudyReply: Encodable {
    let body: String
    let parentId: String?
}

struct MadeId: Decodable { let id: String }

extension APIClient {
    public func libraryRecording(collection: String, key: String) async throws -> LibraryRecording? {
        try await (get("/library/listen", query: ["collection": collection, "key": key]) as RecordingAnswer).recording
    }
    public func studies(circle: String) async throws -> StudyList { try await get("/library/studies", query: ["circle": circle]) }
    /// Starts a study and returns its id.
    public func startStudy(circleId: String, prompt: String, of subject: StudySubject) async throws -> String {
        var body = StartStudy(circleId: circleId, prompt: prompt.trimmingCharacters(in: .whitespacesAndNewlines))
        switch subject {
        case let .passage(collection, key):
            body.collection = collection
            body.key = key
        case let .planDay(planId, day):
            body.planId = planId
            body.day = day
        }
        return try await (post("/library/studies", body: body) as MadeId).id
    }
    public func study(_ id: String) async throws -> StudyRoom { try await get("/library/studies/\(id)") }
    public func removeStudy(_ id: String) async throws {
        let _: [String: Bool] = try await send(request("DELETE", "/library/studies/\(id)"))
    }
    public func studyReply(_ id: String, body: String, parentId: String? = nil) async throws {
        let _: MadeId = try await post("/library/studies/\(id)/replies", body: NewStudyReply(body: body.trimmingCharacters(in: .whitespacesAndNewlines), parentId: parentId))
    }
    public func removeStudyReply(_ id: String) async throws {
        let _: [String: Bool] = try await send(request("DELETE", "/library/study-replies/\(id)"))
    }
}

import Foundation

/// A meeting, meet-up, seminar or outreach (`PrayerEvent` in packages/shared).
public struct PrayerEvent: Codable, Sendable, Equatable, Identifiable {
    public struct Host: Codable, Sendable, Equatable {
        public let id: String
        public let name: String
    }
    public let id: String
    public let kind: String
    public let title: String
    public let description: String
    public let startsAt: String
    public let durationMinutes: Int
    /// Shown only once you RSVP (or host).
    public let videoUrl: String?
    public let hasVideo: Bool
    public let location: String?
    public let groupId: String?
    public let groupTitle: String?
    public let host: Host
    public let isHost: Bool
    public let going: Int
    /// going | maybe
    public let myRsvp: String?
    public let cancelled: Bool
    /// From 10 minutes before the start until the end.
    public let live: Bool
}

public struct NewEvent: Encodable, Sendable, Equatable {
    public let kind: String
    public let title: String
    public let description: String?
    public let startsAt: String
    public let durationMinutes: Int
    public let videoUrl: String?
    public let location: String?
    public let groupId: String?

    public init(kind: String, title: String, description: String, startsAt: Date, minutes: String, videoUrl: String, location: String, groupId: String?) {
        func clean(_ s: String) -> String? {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? nil : t
        }
        self.kind = kind
        self.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        self.description = clean(description)
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        self.startsAt = f.string(from: startsAt)
        self.durationMinutes = Int(minutes.trimmingCharacters(in: .whitespaces)).flatMap { $0 > 0 ? $0 : nil } ?? 60
        self.videoUrl = clean(videoUrl)
        self.location = clean(location)
        self.groupId = groupId
    }
}

public enum Events {
    public static let memberKinds = ["prayer_meeting", "meetup", "seminar", "outreach"]
    /// Restorative circles are scheduled by moderators and pastors only.
    public static let staffKinds = memberKinds + ["circle"]
    public static let staffRoles: Set<String> = ["admin", "moderator", "pastor_counselor"]
    /// Wednesday 7 pm, then the gift sheet's times.
    public static let whens = [GiftSchedule.When(key: "wed", weekday: 3, hour: 19)] + GiftSchedule.whens

    public static func kinds(roles: [String]) -> [String] { roles.contains(where: staffRoles.contains) ? staffKinds : memberKinds }

    /// Hosting needs a title and either a video link or a place.
    public static func canHost(title: String, videoUrl: String, location: String) -> Bool {
        let t = { (s: String) in !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        return t(title) && (t(videoUrl) || t(location))
    }
}

/// Talk with someone (`CareRequest` in packages/shared).
public struct CareRequest: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    /// pray_with_me | pastor | confession
    public let kind: String
    public let body: String
    /// open | claimed | closed
    public let status: String
    public let conversationId: String?
    public let createdAt: String
}

public struct CareQueueItem: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let kind: String
    public let body: String
    public let crisis: Bool
    public let name: String
    public let createdAt: String
}

public struct CareOptions: Codable, Sendable, Equatable {
    public let enabled: Bool
    public let kinds: [String]
    public let confessionRetentionDays: Int?
    /// Partners and counselors see the queue.
    public static let staffRoles: Set<String> = ["prayer_partner", "pastor_counselor"]
}

private struct EventsList: Decodable { let events: [PrayerEvent] }
private struct OneEvent: Decodable { let event: PrayerEvent }
private struct CareList: Decodable { let requests: [CareRequest] }
private struct CareQueue: Decodable { let requests: [CareQueueItem] }
private struct Asked: Decodable { let id: String; let crisis: Bool }
private struct Claimed: Decodable { let conversationId: String }

extension APIClient {
    public func events(groupId: String? = nil) async throws -> [PrayerEvent] {
        try await (get("/events", query: groupId.map { ["groupId": $0] } ?? [:]) as EventsList).events
    }
    public func event(_ id: String) async throws -> PrayerEvent { try await (get("/events/\(id)") as OneEvent).event }
    public func createEvent(_ e: NewEvent) async throws -> PrayerEvent { try await (post("/events", body: e) as OneEvent).event }
    public func rsvp(_ id: String, status: String) async throws -> PrayerEvent {
        try await (send(body(request("PUT", "/events/\(id)/rsvp"), ["status": status])) as OneEvent).event
    }
    public func unrsvp(_ id: String) async throws -> PrayerEvent { try await (send(request("DELETE", "/events/\(id)/rsvp")) as OneEvent).event }
    public func cancelEvent(_ id: String) async throws -> Ignored { try await post("/events/\(id)/cancel", body: [String: String]()) }

    public func careOptions() async throws -> CareOptions { try await get("/care") }
    public func myCareRequests() async throws -> [CareRequest] { try await (get("/me/care-requests") as CareList).requests }
    /// Returns whether the words mentioned a crisis, so the crisis line shows.
    public func askForCare(kind: String, body: String) async throws -> Bool {
        try await (post("/care-requests", body: ["kind": kind, "body": body.trimmingCharacters(in: .whitespacesAndNewlines)]) as Asked).crisis
    }
    public func careQueue() async throws -> [CareQueueItem] { try await (get("/care/queue") as CareQueue).requests }
    /// Returns the conversation to open with the member.
    public func claimCare(_ id: String) async throws -> String { try await (post("/care-requests/\(id)/claim", body: [String: String]()) as Claimed).conversationId }
    public func closeCare(_ id: String) async throws -> Ignored { try await post("/care-requests/\(id)/close", body: [String: String]()) }
}

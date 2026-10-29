import Foundation

// Screens from Me beyond the prayer tools: the Hall of Prayer Warriors, my branch, podcasts,
// live video rooms, the Prayer Squire board, the Bible reading plan, church partners and their
// review, and the Witness team.

public struct AwardHall: Codable, Sendable, Equatable {
    public struct Winner: Codable, Sendable, Equatable {
        public let rank: Int
        public let name: String?
        public let prayers: Int
        public let peoplePrayedFor: Int
    }
    public struct Year: Codable, Sendable, Equatable, Identifiable {
        public let year: Int
        public let winners: [Winner]
        public var id: Int { year }
    }
    public let enabled: Bool
    public let years: [Year]
}

public struct PodcastEpisode: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let description: String
    public let audioUrl: String
    public let durationSeconds: Int?
    /// Nil: a draft.
    public let publishedAt: String?

    /// Whole minutes, or nil when unknown or under a minute.
    public var minutes: Int? { durationSeconds.flatMap { $0 >= 60 ? Int((Double($0) / 60).rounded()) : nil } }
}

public struct PodcastShow: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let description: String
    public let author: String
    public let episodes: [PodcastEpisode]
}

public struct LiveRoom: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let roomUrl: String
    public let hostName: String
    public let isMine: Bool
}

public struct LiveNow: Codable, Sendable, Equatable {
    public let enabled: Bool
    public let canHost: Bool
    public let canCreateRoom: Bool
    public let rooms: [LiveRoom]
}

public struct SquireBoard: Codable, Sendable, Equatable {
    public struct Entry: Codable, Sendable, Equatable, Identifiable {
        public let rank: Int
        public let personId: String
        public let name: String
        public let prayers: Int
        public let peoplePrayedFor: Int
        public let you: Bool
        public var id: String { personId }
    }
    public let enabled: Bool
    public let days: Int?
    public let onBoard: Bool?
    public let canJoin: Bool?
    public let entries: [Entry]?
}

public struct ReadingPlanToday: Codable, Sendable, Equatable {
    public struct Reading: Codable, Sendable, Equatable {
        public let reference: String
        public let url: String
        public let read: Bool
        public let readers: Int
    }
    public struct Plan: Codable, Sendable, Equatable {
        public let id: String
        public let title: String
        public let day: Int
        public let days: Int
        public let conversationId: String?
        public let reading: Reading?
    }
    public let enabled: Bool
    public let plan: Plan?
}

public struct StaffReadingPlan: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let startsOn: String
    public let days: Int
    public let readers: Int
    public let archived: Bool
}

public enum ReadingPlans {
    /// One passage per line; blank lines dropped.
    public static func references(_ text: String) -> [String] {
        text.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }
    public static func validDate(_ s: String) -> Bool {
        s.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
    }
}

public struct Church: Codable, Sendable, Equatable, Identifiable {
    public struct Applicant: Codable, Sendable, Equatable {
        public let displayName: String
        public let email: String?
    }
    public let id: String
    public let name: String
    public let denomination: String?
    public let pastorTitle: String
    public let city: String
    public let region: String?
    public let country: String
    public let website: String?
    public let phone: String?
    public let about: String?
    /// pending | verified | declined
    public let status: String
    public let reviewNote: String?
    /// Only in the admin's review list.
    public let applicant: Applicant?

    public static let statuses = ["pending", "verified", "declined"]

    /// "Pastor · Baptist · Austin, TX, US"
    public func line(withTitle: Bool) -> String {
        let place = [city, region ?? "", country].filter { !$0.isEmpty }.joined(separator: ", ")
        return [withTitle ? pastorTitle : "", denomination ?? "", place].filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

/// The pastor's application form. Optional fields go as nil when blank.
public struct ChurchForm: Equatable, Sendable {
    public var name = "", pastorTitle = "", denomination = "", city = "", region = "", country = "", website = "", phone = "", about = ""
    public init() {}
    public init(_ c: Church) {
        name = c.name
        pastorTitle = c.pastorTitle
        denomination = c.denomination ?? ""
        city = c.city
        region = c.region ?? ""
        country = c.country
        website = c.website ?? ""
        phone = c.phone ?? ""
        about = c.about ?? ""
    }
    public var ready: Bool {
        name.trimmingCharacters(in: .whitespaces).count >= 2 && !city.trimmingCharacters(in: .whitespaces).isEmpty
            && country.trimmingCharacters(in: .whitespaces).count >= 2
    }
    var body: [String: String] {
        let all = ["name": name, "pastorTitle": pastorTitle, "denomination": denomination, "city": city, "region": region,
                   "country": country, "website": website, "phone": phone, "about": about]
        return all.mapValues { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.value.isEmpty }
    }
}

public struct WitnessCase: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let postId: String
    /// watching | reaching_out | helped | closed
    public let status: String
    public let postBody: String
    public let posterName: String
    public let anonymousPost: Bool
    public let assignedTo: String?
    public let helpCount: Int
    public let lastNote: String?

    public static let statuses = ["watching", "reaching_out", "helped", "closed"]
}

public struct WitnessNote: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let body: String
    public let helpKind: String?
    public let author: String
}

private struct Branch: Decodable { let posts: [Card] }
private struct Shows: Decodable { let shows: [PodcastShow] }
private struct Started: Decodable { let roomUrl: String }
private struct StaffPlans: Decodable { let plans: [StaffReadingPlan] }
private struct ChurchWrap: Decodable { let church: Church? }
private struct Churches: Decodable { let churches: [Church] }
private struct Cases: Decodable { let cases: [WitnessCase] }
private struct Notes: Decodable { let notes: [WitnessNote] }
private struct NewPlan: Encodable { let title: String; let startsOn: String; let references: [String] }
private struct CaseUpdate: Encodable { let status: String; let assignToMe: Bool? }
private let nothing = [String: String]()

extension APIClient {
    public func awardHall() async throws -> AwardHall { try await get("/awards") }
    public func myBranch() async throws -> [Card] { try await (get("/me/branch") as Branch).posts }
    public func podcasts() async throws -> [PodcastShow] { try await (get("/podcasts") as Shows).shows }

    public func liveNow() async throws -> LiveNow { try await get("/live") }
    /// Opens a room; with a link (Zoom, Meet), that link is the room.
    public func startLive(title: String, link: String) async throws -> URL? {
        let l = link.trimmingCharacters(in: .whitespaces)
        var body = ["title": title.trimmingCharacters(in: .whitespaces)]
        if !l.isEmpty { body["link"] = l }
        return URL(string: try await (post("/live", body: body) as Started).roomUrl)
    }
    public func endLive(_ id: String) async throws -> Ignored { try await post("/live/\(id)/end", body: nothing) }

    public func squireBoard() async throws -> SquireBoard { try await get("/squire-board") }
    public func setSquireBoard(_ on: Bool) async throws -> SquireBoard { try await send(body(request("PUT", "/me/squire-board"), ["public": on])) }

    public func readingPlan() async throws -> ReadingPlanToday { try await get("/reading-plan") }
    public func markReadingRead(_ planId: String) async throws -> ReadingPlanToday { try await post("/reading-plan/\(planId)/read", body: nothing) }
    public func staffReadingPlans() async throws -> [StaffReadingPlan] { try await (get("/staff/reading-plans") as StaffPlans).plans }
    public func createReadingPlan(title: String, startsOn: String, references: [String]) async throws -> Ignored {
        try await post("/staff/reading-plans", body: NewPlan(title: title.trimmingCharacters(in: .whitespaces), startsOn: startsOn, references: references))
    }
    public func archiveReadingPlan(_ id: String) async throws -> Ignored { try await post("/staff/reading-plans/\(id)/archive", body: nothing) }

    public func myChurch() async throws -> Church? { try await (get("/me/church") as ChurchWrap).church }
    /// Applies, or (while waiting for review) changes the application.
    public func applyChurch(_ form: ChurchForm, editing: Bool) async throws -> Church? {
        try await (send(body(request(editing ? "PUT" : "POST", "/me/church"), form.body)) as ChurchWrap).church
    }
    public func withdrawChurch() async throws -> Ignored { try await send(request("DELETE", "/me/church")) }
    public func churchesForReview(_ status: String) async throws -> [Church] { try await (get("/admin/churches", query: ["status": status]) as Churches).churches }
    /// verify | decline | revoke; decline and revoke need a note.
    public func decideChurch(_ id: String, _ decision: String, note: String) async throws -> Ignored {
        let n = note.trimmingCharacters(in: .whitespacesAndNewlines)
        return try await post("/admin/churches/\(id)/decision", body: n.isEmpty ? ["decision": decision] : ["decision": decision, "note": n])
    }

    public func witnessCases(_ status: String?) async throws -> [WitnessCase] {
        try await (get("/witness/cases", query: status.map { ["status": $0] } ?? [:]) as Cases).cases
    }
    public func witnessNotes(_ id: String) async throws -> [WitnessNote] { try await (get("/witness/cases/\(id)/notes") as Notes).notes }
    public func addWitnessNote(_ id: String, body text: String, helpKind: String) async throws -> Ignored {
        let h = helpKind.trimmingCharacters(in: .whitespaces)
        var b = ["body": text.trimmingCharacters(in: .whitespacesAndNewlines)]
        if !h.isEmpty { b["helpKind"] = h }
        return try await post("/witness/cases/\(id)/notes", body: b)
    }
    public func updateWitnessCase(_ id: String, status: String, assignToMe: Bool = false) async throws -> Ignored {
        try await send(body(request("PATCH", "/witness/cases/\(id)"), CaseUpdate(status: status, assignToMe: assignToMe ? true : nil)))
    }
    public func draftWitnessStory(_ caseId: String, body text: String) async throws -> Ignored {
        try await post("/witness/cases/\(caseId)/story", body: ["body": text.trimmingCharacters(in: .whitespacesAndNewlines)])
    }
}

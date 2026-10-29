import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// Surveys (members answer; admins write them), and the admin's legal requests, CSV import and
// podcasts, as the Expo app's survey/[id], surveys, legal, import and podcasts-admin screens.

// MARK: - Surveys

public struct SurveyQuestion: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    /// single | multi | scale | text
    public let kind: String
    public let prompt: String
    /// Choices; for a scale, its two end labels (or none).
    public let options: [String]
    public let required: Bool
}

public struct Survey: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let intro: String?
    /// draft | open | closed
    public let status: String
    public let anonymous: Bool
    public let community: String?
    public let questions: [SurveyQuestion]
    /// Only in the admin's list.
    public let responses: Int?
}

/// One member's answer to one question while they fill in a survey.
public struct SurveyDraft: Equatable, Sendable {
    public var choices: [String] = []
    public var value: Int?
    public var text = ""
    public init() {}

    public var answered: Bool { !choices.isEmpty || value != nil || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    /// A tap on a choice: one answer replaces, several answers toggle.
    public mutating func tap(_ option: String, single: Bool) {
        if choices.contains(option) { choices.removeAll { $0 == option } } else { choices = single ? [option] : choices + [option] }
    }
}

public struct SurveyAnswer: Encodable, Sendable, Equatable {
    public let questionId: String
    public let choices: [String]?
    public let value: Int?
    public let text: String?

    /// The answers to send: only questions with an answer.
    public static func from(_ survey: Survey, _ drafts: [String: SurveyDraft]) -> [SurveyAnswer] {
        survey.questions.compactMap { q in
            guard let d = drafts[q.id], d.answered else { return nil }
            let t = d.text.trimmingCharacters(in: .whitespacesAndNewlines)
            return SurveyAnswer(questionId: q.id, choices: d.choices.isEmpty ? nil : d.choices, value: d.value, text: t.isEmpty ? nil : t)
        }
    }

    public static func ready(_ survey: Survey, _ drafts: [String: SurveyDraft]) -> Bool {
        survey.questions.allSatisfy { !$0.required || drafts[$0.id]?.answered == true }
    }
}

/// A question the admin is writing.
public struct QuestionDraft: Equatable, Sendable, Identifiable {
    public let id = UUID()
    public var kind = "single"
    public var prompt = ""
    /// One per line.
    public var options = ""
    public var required = false
    public init() {}

    public static let kinds = ["single", "multi", "scale", "text"]
    var lines: [String] { options.split(whereSeparator: \.isNewline).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty } }

    public var valid: Bool {
        guard !prompt.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        switch kind {
        case "single", "multi": return lines.count >= 2
        case "scale": return lines.isEmpty || lines.count == 2
        default: return true
        }
    }

    public static func == (a: QuestionDraft, b: QuestionDraft) -> Bool {
        a.kind == b.kind && a.prompt == b.prompt && a.options == b.options && a.required == b.required
    }
}

public struct NewSurvey: Encodable, Sendable {
    struct Question: Encodable { let kind: String; let prompt: String; let options: [String]; let required: Bool }
    let title: String
    let intro: String?
    let anonymous: Bool
    let community: String?
    let questions: [Question]

    /// nil until the title, every question and the optional community short name are valid.
    public init?(title: String, intro: String, anonymous: Bool, community: String, questions: [QuestionDraft]) {
        let t = title.trimmingCharacters(in: .whitespaces), c = community.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty, !questions.isEmpty, questions.allSatisfy(\.valid) else { return nil }
        guard c.isEmpty || c.range(of: #"^[a-z0-9-]{3,40}$"#, options: .regularExpression) != nil else { return nil }
        let i = intro.trimmingCharacters(in: .whitespacesAndNewlines)
        self.title = t
        self.intro = i.isEmpty ? nil : i
        self.anonymous = anonymous
        self.community = c.isEmpty ? nil : c
        self.questions = questions.map { Question(kind: $0.kind, prompt: $0.prompt.trimmingCharacters(in: .whitespaces), options: $0.lines, required: $0.required) }
    }

    enum CodingKeys: String, CodingKey { case title, intro, anonymous, community, questions }
    public func encode(to encoder: Encoder) throws {
        var k = encoder.container(keyedBy: CodingKeys.self)
        try k.encode(title, forKey: .title)
        try k.encode(intro, forKey: .intro)
        try k.encode(anonymous, forKey: .anonymous)
        try k.encode(community, forKey: .community)
        try k.encode(questions, forKey: .questions)
    }
}

public struct SurveyResults: Codable, Sendable, Equatable {
    public struct Question: Codable, Sendable, Equatable, Identifiable {
        public let id: String
        public let prompt: String
        public let counts: [String: Int]?
        public let average: Double?
        public let texts: [String]?
    }
    public let survey: Survey
    /// False while an anonymous survey has too few answers to show.
    public let shown: Bool
    public let questions: [Question]
}

// MARK: - Legal requests

public struct LegalCase: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    /// preservation | legal_process | emergency | referral
    public let kind: String
    /// open | closed
    public let status: String
    public let agency: String?
    public let reference: String?
    public let subjectId: String?
    public let subjectName: String?
    public let summary: String
    public let createdAt: String
    public let activeHolds: Int

    public static let kinds = ["preservation", "legal_process", "emergency", "referral"]
}

public struct LegalCaseDetail: Codable, Sendable, Equatable {
    public struct Note: Codable, Sendable, Equatable, Identifiable {
        public let id: String
        public let body: String
        public let createdAt: String
        public let author: String?
    }
    public struct Hold: Codable, Sendable, Equatable, Identifiable {
        public let id: String
        public let expiresAt: String
        public let releasedAt: String?
        public let items: Int
    }
    public let `case`: LegalCase
    public let notes: [Note]
    public let holds: [Hold]
}

// MARK: - CSV import

public struct ImportResult: Codable, Sendable, Equatable {
    public struct Row: Codable, Sendable, Equatable, Identifiable {
        public let line: Int
        /// ok | invited | emailed | posted | skipped | error
        public let status: String
        public let reason: String?
        public let email: String?
        public let name: String?
        public let code: String?
        public let request: String?
        public var id: Int { line }
    }
    public let kind: String
    public let dryRun: Bool
    public let error: String?
    public let rows: [Row]
    public let counts: [String: Int]

    public func count(_ status: String) -> Int { counts[status] ?? 0 }
}

// MARK: - API

private struct SurveysWrap: Decodable { let surveys: [Survey] }
private struct LegalSettings: Decodable { struct S: Decodable { let enabled: Bool }; let settings: S }
private struct LegalCases: Decodable { let cases: [LegalCase] }
private struct AdminShows: Decodable { let enabled: Bool; let shows: [PodcastShow] }
private struct Answers: Encodable { let answers: [SurveyAnswer] }
private struct ImportBody: Encodable { let kind: String; let csv: String; let dryRun: Bool; let note: String; let sendEmails: Bool }
private struct NewCase: Encodable { let kind: String; let agency: String?; let reference: String?; let subject: String?; let summary: String }
private struct NewShow: Encodable { let slug: String; let title: String; let description: String; let author: String; let imageUrl: String?; let community: String? }
private struct NewEpisode: Encodable { let title: String; let audioUrl: String; let durationSeconds: Int?; let publish: Bool }
private let nothing = [String: String]()

private func blankToNil(_ s: String) -> String? {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    return t.isEmpty ? nil : t
}

public enum Podcasts {
    public static func validSlug(_ s: String) -> Bool { s.range(of: #"^[a-z0-9-]{3,40}$"#, options: .regularExpression) != nil }
}

extension APIClient {
    /// Open surveys the member hasn't answered.
    public func surveys() async throws -> [Survey] { try await (get("/surveys") as SurveysWrap).surveys }
    public func answerSurvey(_ id: String, _ answers: [SurveyAnswer]) async throws -> Ignored { try await post("/surveys/\(id)/responses", body: Answers(answers: answers)) }

    public func adminSurveys() async throws -> [Survey] { try await (get("/admin/surveys") as SurveysWrap).surveys }
    public func createSurvey(_ s: NewSurvey) async throws -> Ignored { try await post("/admin/surveys", body: s) }
    public func setSurveyStatus(_ id: String, _ status: String) async throws -> Ignored { try await send(body(request("PATCH", "/admin/surveys/\(id)"), ["status": status])) }
    public func deleteSurvey(_ id: String) async throws -> Ignored { try await send(request("DELETE", "/admin/surveys/\(id)")) }
    public func surveyResults(_ id: String) async throws -> SurveyResults { try await get("/admin/surveys/\(id)/results") }

    public func legalEnabled() async throws -> Bool { try await (get("/admin/legal/settings") as LegalSettings).settings.enabled }
    public func setLegalEnabled(_ on: Bool) async throws -> Ignored { try await send(body(request("PATCH", "/admin/legal/settings"), ["enabled": on])) }
    public func legalCases() async throws -> [LegalCase] { try await (get("/admin/legal/cases") as LegalCases).cases }
    public func legalCase(_ id: String) async throws -> LegalCaseDetail { try await get("/admin/legal/cases/\(id)") }
    public func createLegalCase(kind: String, agency: String, reference: String, subject: String, summary: String) async throws -> LegalCaseDetail {
        try await post("/admin/legal/cases", body: NewCase(kind: kind, agency: blankToNil(agency), reference: blankToNil(reference), subject: blankToNil(subject), summary: summary.trimmingCharacters(in: .whitespacesAndNewlines)))
    }
    public func addLegalNote(_ id: String, _ text: String) async throws -> LegalCaseDetail { try await post("/admin/legal/cases/\(id)/notes", body: ["body": text.trimmingCharacters(in: .whitespacesAndNewlines)]) }
    public func closeLegalCase(_ id: String) async throws -> LegalCaseDetail { try await post("/admin/legal/cases/\(id)/close", body: nothing) }
    public func placeHold(_ caseId: String) async throws -> LegalCaseDetail { try await post("/admin/legal/cases/\(caseId)/holds", body: nothing) }
    public func refreshHold(_ id: String) async throws -> LegalCaseDetail { try await post("/admin/legal/holds/\(id)/refresh", body: nothing) }
    public func releaseHold(_ id: String) async throws -> LegalCaseDetail { try await post("/admin/legal/holds/\(id)/release", body: nothing) }
    /// The hold's copy, as JSON to save.
    public func exportHold(_ id: String) async throws -> Data {
        let (data, response) = try await session.data(for: try await request("GET", "/admin/legal/holds/\(id)/export"))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw APIError(status: status, code: "http_\(status)", message: "Something went wrong (\(status))") }
        return data
    }

    /// members | requests. With dryRun, nothing changes.
    public func importCsv(kind: String, csv: String, dryRun: Bool, note: String, sendEmails: Bool) async throws -> ImportResult {
        try await post("/admin/import", body: ImportBody(kind: kind, csv: csv, dryRun: dryRun, note: note.trimmingCharacters(in: .whitespaces), sendEmails: kind == "members" && sendEmails))
    }

    public func adminPodcasts() async throws -> (enabled: Bool, shows: [PodcastShow]) {
        let r: AdminShows = try await get("/admin/podcasts")
        return (r.enabled, r.shows)
    }
    public func createPodcast(slug: String, title: String, description: String, author: String, imageUrl: String, community: String) async throws -> Ignored {
        try await post("/admin/podcasts", body: NewShow(slug: slug, title: title.trimmingCharacters(in: .whitespaces), description: description.trimmingCharacters(in: .whitespacesAndNewlines),
                                                       author: author.trimmingCharacters(in: .whitespaces), imageUrl: blankToNil(imageUrl), community: blankToNil(community)))
    }
    public func setPodcastPublished(_ id: String, _ on: Bool) async throws -> Ignored { try await send(body(request("PATCH", "/admin/podcasts/\(id)"), ["published": on])) }
    public func addEpisode(show: String, title: String, audioUrl: String, minutes: Int?, publish: Bool) async throws -> Ignored {
        try await post("/admin/podcasts/\(show)/episodes", body: NewEpisode(title: title.trimmingCharacters(in: .whitespaces), audioUrl: audioUrl.trimmingCharacters(in: .whitespaces), durationSeconds: minutes.map { $0 * 60 }, publish: publish))
    }
    public func setEpisodePublished(_ id: String, _ on: Bool) async throws -> Ignored { try await send(body(request("PATCH", "/admin/podcast-episodes/\(id)"), ["published": on])) }
    public func removeEpisode(_ id: String) async throws -> Ignored { try await send(request("DELETE", "/admin/podcast-episodes/\(id)")) }
}

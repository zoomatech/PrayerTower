import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct AdminToolsTests {
    let survey = try! JSONDecoder().decode(Survey.self, from: Data(#"""
    {"id":"s","title":"Pilot","intro":null,"status":"open","anonymous":true,"community":null,"closesAt":null,"questions":[
     {"id":"a","position":0,"kind":"single","prompt":"One?","options":["x","y"],"required":true},
     {"id":"b","position":1,"kind":"multi","prompt":"Many?","options":["x","y"],"required":false},
     {"id":"c","position":2,"kind":"text","prompt":"Say","options":[],"required":false}]}
    """#.utf8))

    @Test func answeringASurvey() {
        var drafts: [String: SurveyDraft] = [:]
        #expect(!SurveyAnswer.ready(survey, drafts))
        drafts["a", default: SurveyDraft()].tap("x", single: true)
        drafts["a", default: SurveyDraft()].tap("y", single: true)
        #expect(drafts["a"]?.choices == ["y"])
        drafts["b", default: SurveyDraft()].tap("x", single: false)
        drafts["b", default: SurveyDraft()].tap("y", single: false)
        drafts["b", default: SurveyDraft()].tap("x", single: false)
        #expect(drafts["b"]?.choices == ["y"])
        drafts["c", default: SurveyDraft()].text = "  "
        #expect(SurveyAnswer.ready(survey, drafts))
        let answers = SurveyAnswer.from(survey, drafts)
        #expect(answers.map(\.questionId) == ["a", "b"])
    }

    @Test func writingASurvey() {
        var q = QuestionDraft()
        q.prompt = "Pick"
        q.options = "one"
        #expect(!q.valid)
        q.options = "one\n\ntwo"
        #expect(q.valid)
        q.kind = "scale"
        #expect(q.valid)
        q.options = "a\nb\nc"
        #expect(!q.valid)
        q.options = ""
        #expect(q.valid)
        #expect(NewSurvey(title: "T", intro: "", anonymous: true, community: "Bad Name", questions: [q]) == nil)
        #expect(NewSurvey(title: "T", intro: "", anonymous: true, community: "grace-church", questions: [q]) != nil)
        #expect(NewSurvey(title: " ", intro: "", anonymous: true, community: "", questions: [q]) == nil)
    }

    @Test func importAndLegalShapes() throws {
        let r = try JSONDecoder().decode(ImportResult.self, from: Data(#"{"kind":"members","dryRun":true,"rows":[{"line":2,"status":"ok","email":"a@b.c"}],"counts":{"ok":1,"skipped":0,"error":0,"invited":0,"emailed":0,"posted":0}}"#.utf8))
        #expect(r.count("ok") == 1 && r.rows.first?.email == "a@b.c")
        let d = try JSONDecoder().decode(LegalCaseDetail.self, from: Data(#"{"case":{"id":"c","kind":"referral","status":"open","agency":null,"reference":null,"receivedAt":null,"subjectId":"u","subjectName":"Ana","moderationItemId":null,"summary":"x","createdAt":"2026-10-29T00:00:00Z","closedAt":null,"activeHolds":1},"notes":[],"holds":[{"id":"h","userId":"u","createdAt":"2026-10-29T00:00:00Z","expiresAt":"2027-01-29T00:00:00Z","releasedAt":null,"items":12}]}"#.utf8))
        #expect(d.holds.first?.items == 12)
        #expect(Podcasts.validSlug("morning-prayer") && !Podcasts.validSlug("Mo"))
    }
}

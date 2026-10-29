import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct StaffTests {
    let w = Words(.faith)

    @Test func rulesWithASwitchShowOnlyWhenOn() {
        let off = Moderation.ruleChoices(features: Features(values: [:]))
        #expect(off == ["harm", "flooding", "ads", "abuse", "other"])
        let on = Moderation.ruleChoices(features: Features(values: ["pressureRule": true, "automationRule": true]))
        #expect(on == ["harm", "flooding", "ads", "abuse", "pressure", "automation", "other"])
        #expect(w("enums.moderationRule.harm") == "Pray for good, never for harm")
    }

    @Test func decisionsEncodeLikeTheExpoApp() throws {
        let enc = JSONEncoder()
        enc.outputFormatting = .sortedKeys
        let keep = String(decoding: try enc.encode(ModerationDecision.keep), as: UTF8.self)
        #expect(keep == #"{"action":"dismiss"}"#)
        let suspend = String(decoding: try enc.encode(ModerationDecision.removeAndSuspend("ads")), as: UTF8.self)
        #expect(suspend == #"{"action":"remove","note":"Suspended from the moderation queue","rule":"ads","suspendDays":7}"#)
    }

    @Test func goldfishLine() {
        let h = ModerationItem.History(recent: 2, serious: 1, days: 30, repeat_: true)
        #expect(Moderation.goldfish(h, words: w) == "2 removed in the last 30 days. 1 for serious harm (these never fade). This keeps happening: an admin has been told.")
        let first = ModerationItem.History(recent: 0, serious: 0, days: 14, repeat_: false)
        #expect(Moderation.goldfish(first, words: w) == "No removals for this person in the last 14 days.")
    }

    @Test func moderationItemDecodes() throws {
        let json = #"{"items":[{"id":"m1","target_type":"post","target_id":"p1","source":"crisis","reason":null,"status":"open","content":"hi","created_at":"2026-10-29T10:00:00Z","history":{"recent":1,"serious":0,"days":30,"repeat":false}}]}"#
        struct Items: Decodable { let items: [ModerationItem] }
        let item = try JSONDecoder().decode(Items.self, from: Data(json.utf8)).items[0]
        #expect(item.source == "crisis")
        #expect(item.history?.recent == 1)
    }

    @Test func announcementForm() throws {
        #expect(NewAnnouncement(kind: "banner", title: "  ", body: "", hours: "") == nil)
        #expect(NewAnnouncement(kind: "banner", title: "Hi", body: "", hours: "0") == nil)
        #expect(NewAnnouncement(kind: "banner", title: "Hi", body: "", hours: "2161") == nil)
        let a = try #require(NewAnnouncement(kind: "banner", title: " Hi ", body: "ignored", hours: ""))
        #expect(a.title == "Hi" && a.body == "" && a.durationHours == nil)
        let enc = JSONEncoder()
        enc.outputFormatting = .sortedKeys
        #expect(String(decoding: try enc.encode(a), as: UTF8.self) == #"{"body":"","durationHours":null,"kind":"banner","title":"Hi"}"#)
        #expect(NewAnnouncement(kind: "notice", title: "T", body: " Body ", hours: "48")?.body == "Body")
    }

    @Test func inviteForm() throws {
        #expect(NewInvites(note: "", community: "", maxUses: "0", days: "", count: "1") == nil)
        #expect(NewInvites(note: "", community: "", maxUses: "1", days: "366", count: "1") == nil)
        #expect(NewInvites(note: "", community: "", maxUses: "1", days: "", count: "51") == nil)
        #expect(NewInvites(note: "", community: "", maxUses: "x", days: "", count: "1") == nil)
        let i = try #require(NewInvites(note: " Grace ", community: "", maxUses: "10", days: "30", count: "5"))
        #expect(i.note == "Grace" && i.community == nil && i.maxUses == 10 && i.expiresInDays == 30 && i.count == 5)
    }

    @Test func inviteShareUsesCommunityNameWhenSecular() throws {
        let json = #"{"code":"ABC","note":"","maxUses":1,"uses":0,"expiresAt":null,"status":"active","community":{"slug":"oc","name":"Open Circle","secular":true}}"#
        let invite = try JSONDecoder().decode(Invite.self, from: Data(json.utf8))
        let message = invite.shareMessage(words: w)
        #expect(message.contains("Open Circle"))
        #expect(message.contains("prayertower://sign-in?invite=ABC"))
    }

    @Test func auditActionWords() {
        #expect(AuditLog.actionKey("PATCH /admin/token-settings") == "PATCH_admin_token-settings")
        #expect(AuditLog.describe("PATCH /admin/token-settings", words: w) == "Changed token settings")
        #expect(AuditLog.describe("POST /something/new", words: w) == "POST /something/new")
        let q = AuditLog.query(words: " sam ", moderationOnly: true, lastWeek: false)
        #expect(q == ["limit": "50", "q": "sam", "action": " /moderation/"])
    }

    @Test func feedbackTagsAndPatch() throws {
        #expect(!FeedbackTriage.tags.contains("spanish"))
        #expect(FeedbackTriage.toggled(["bug"], "bug") == [])
        #expect(FeedbackTriage.toggled(["bug"], "idea") == ["bug", "idea"])
        #expect(String(decoding: try JSONEncoder().encode(FeedbackPatch.severity(nil)), as: UTF8.self) == #"{"severity":null}"#)
    }

    @Test func opsStatusDecodes() throws {
        let json = #"{"status":{"checkedAt":"2026-10-29T10:00:00Z","database":{"ms":3},"worker":{"lastSeen":null,"ok":false},"queue":{"waiting":1,"running":0,"overdue":0,"oldestOverdueSeconds":0,"failed":0,"retrying":0},"errors":{"lastHour":0,"last24h":0,"recent":[]},"radio":{"mode":"log","queued":0,"sending":0,"sentToday":0,"failedToday":0,"lastSentAt":null,"station":{"lastSeen":null,"ok":null}},"problems":["worker_down"]}}"#
        struct Wrap: Decodable { let status: OpsStatus }
        let s = try JSONDecoder().decode(Wrap.self, from: Data(json.utf8)).status
        #expect(s.problems == ["worker_down"])
        #expect(s.radio.station.ok == nil)
    }
}

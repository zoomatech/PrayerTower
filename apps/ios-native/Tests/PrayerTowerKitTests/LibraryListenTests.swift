import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct LibraryListenTests {
    @Test func readsARecordingOrNone() throws {
        let json = #"{"recording":{"url":"https://www.archive.org/download/x/p.mp3","title":"Chapter 07 - Psalms 21 - 23","project":"Bible (KJV) 19: Psalms (version 2)","readers":["peaceuntoyou"],"seconds":600,"credit":"Read by peaceuntoyou for LibriVox.","projectUrl":"https://librivox.org/x"}}"#
        #expect(try JSONDecoder().decode(RecordingAnswer.self, from: Data(json.utf8)).recording?.readers == ["peaceuntoyou"])
        #expect(try JSONDecoder().decode(RecordingAnswer.self, from: Data(#"{"recording":null}"#.utf8)).recording == nil)
    }

    @Test func readsAStudyRoomWithAnswers() throws {
        let json = #"{"study":{"id":"s1","circleId":"c1","prompt":"Which line?","author":{"id":"u1","displayName":"Ruth"},"createdAt":"2026-10-30T00:00:00Z","passage":{"collection":"bible-kjv","ref":"Psalms 1–5","key":"k","quote":"Blessed is the man","citation":"Psalms 1–5 (King James Bible)"},"plan":{"id":"psalms-30","title":"Psalms in 30 days","day":1},"replies":2,"lastReplyAt":null,"canRemove":true},"replies":[{"id":"r1","author":{"id":"u2","displayName":"Sam"},"body":"A tree.","createdAt":"","canRemove":false,"answers":[{"id":"r2","author":{"id":"u1","displayName":null},"body":"Yes.","createdAt":"","canRemove":true}]}]}"#
        let room = try JSONDecoder().decode(StudyRoom.self, from: Data(json.utf8))
        #expect(room.study.plan?.day == 1)
        #expect(room.replies[0].answers?.first?.body == "Yes." && room.replies[0].answers?.first?.answers == nil)
    }

    @Test func startsAStudyOfAPassageOrAPlanDay() throws {
        var passage = StartStudy(circleId: "c1", prompt: "Thoughts?")
        passage.collection = "bible-kjv"
        passage.key = "k"
        let a = try JSONSerialization.jsonObject(with: JSONEncoder().encode(passage)) as! [String: Any]
        #expect(a["collection"] as? String == "bible-kjv" && a["planId"] == nil)
        var day = StartStudy(circleId: "c1", prompt: "Thoughts?")
        day.planId = "psalms-30"
        day.day = 4
        let b = try JSONSerialization.jsonObject(with: JSONEncoder().encode(day)) as! [String: Any]
        #expect(b["day"] as? Int == 4 && b["key"] == nil)
    }

    @Test func readsTheListeningHistoryAndWritesAPlace() throws {
        let json = #"{"resume":{"collection":"bible-kjv","key":"k","ref":"Psalms 23:1","citation":"Psalms 23:1 (King James Bible)","text":"The LORD is my shepherd","kind":"recording","position":312.5,"duration":1500,"finished":false,"recording":{"url":"https://www.archive.org/download/x/p.mp3","title":"Chapter 07 - Psalms 21 - 23","project":"Bible (KJV) 19: Psalms (version 2)","readers":[],"seconds":1500,"credit":"Read for LibriVox.","projectUrl":"https://librivox.org/x"},"updatedAt":"2026-10-31T19:00:00Z"},"history":[{"collection":"bible-kjv","key":"r","ref":"Ruth 1:16","citation":"Ruth 1:16","text":"whither thou goest","kind":"voice","position":18,"duration":null,"finished":true,"recording":null,"updatedAt":"2026-10-30T19:00:00Z"}]}"#
        let h = try JSONDecoder().decode(ListeningHistory.self, from: Data(json.utf8))
        #expect(h.resume?.kind == .recording && h.resume?.position == 312.5 && h.resume?.recording?.seconds == 1500)
        #expect(h.history[0].id == "bible-kjv/r/voice" && h.history[0].finished && h.history[0].duration == nil)
        let place = try JSONSerialization.jsonObject(with: JSONEncoder().encode(ListenPlace(collection: "bible-kjv", key: "k", kind: .voice, position: 40))) as! [String: Any]
        #expect(place["kind"] as? String == "voice" && place["position"] as? Double == 40 && place["finished"] == nil)
    }
}

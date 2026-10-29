import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct SkinMakerTests {
    @Test func buildsTheVineTokensAsTheExpoMakerDoes() {
        var m = SkinMaker()
        m.shape = .star
        m.style = .neon
        m.width = 9
        m.glowing = true
        m.fairytale = true
        let t = m.tokens
        #expect(t["stem"] == .string("#6E8B4E") && t["branch"] == .string("#6E8B4E") && t["tendril"] == .string("#6E8B4E"))
        #expect(t["leafShape"] == .string("star") && t["vineStyle"] == .string("neon") && t["scenery"] == .string("fairytale"))
        #expect(t["stemWidth"] == .number(9) && t["stemGlow"] == .bool(true) && t["stemDouble"] == .bool(false))
        // The preview draws it with the same look the feed uses.
        let look = VineLook(m.preview)
        #expect(look.vineStyle == .neon && look.fairytale && look.leafShape == .star)
    }

    @Test func eachLayoutKeepsItsOwnColors() {
        var m = SkinMaker()
        m.setColor("backdrop", "#000000")
        m.layout = .tower
        #expect(m.color("backdrop") == "#EAF2F8")
        #expect(Set(m.tokens.keys) == ["stone", "mortar", "backdrop"])
        m.layout = .circuit
        #expect(m.tokens["tilt"] == .number(10))
        m.layout = .vine
        #expect(m.color("backdrop") == "#000000")
    }

    @Test func savesOnlyFinishedReadableColorsAndANameAndDescription() {
        var m = SkinMaker()
        #expect(!m.canSave)
        m.name = "Moss"
        m.description = "Soft greens"
        #expect(m.canSave)
        m.setColor("leaf", "#A9C0")
        #expect(!m.colorsOk && !m.canSave)
        // A half-typed color drops out of the preview, so the layout's own shows instead.
        #expect(m.preview.tokens["leaf"] == nil)
        m.setColor("leaf", "#A9C08A")
        m.setColor("leafSoft", "#333333")
        #expect(!m.commentsReadable && !m.canSave)
    }

    @Test func hasTwoSampleRequestsWithCommentsInEachWording() {
        let faith = SkinMaker.sampleCards(.faith), neutral = SkinMaker.sampleCards(.neutral)
        #expect(faith.count == 2 && neutral.count == 2)
        #expect(faith.allSatisfy { $0.leafComments?.count == 1 })
        let words = neutral.flatMap { [$0.body] + ($0.leafComments ?? []).map(\.body) }.joined(separator: " ")
        #expect(words.range(of: "pray", options: .caseInsensitive) == nil)
    }
}

extension APIClientTests {
    @Test func savesASkinAndListsTheMembersSkins() async throws {
        let one = ##"{"id":"tp1","name":"Moss","description":"Soft greens","layout":"vine","colors":{},"tokens":{},"status":"pending","reviewNote":null,"themeSlug":"moss-1a2b","createdAt":"2026-10-29T08:00:00Z"}"##
        StubProtocol.answer = (201, ##"{"proposal":"## + one + "}")
        var m = SkinMaker()
        m.name = " Moss "
        m.description = "Soft greens"
        let saved = try await client().proposeTheme(m)
        #expect(saved.themeSlug == "moss-1a2b" && saved.statusLine.contains("use it now"))
        let sent = try JSONSerialization.jsonObject(with: StubProtocol.seen.last!.httpBody!) as! [String: Any]
        #expect(sent["name"] as? String == "Moss" && sent["layout"] as? String == "vine")
        #expect((sent["tokens"] as? [String: Any])?["leafShape"] as? String == "round")
        #expect(StubProtocol.seen.last?.httpMethod == "POST")

        StubProtocol.answer = (200, ##"{"proposals":["## + one + "]}")
        #expect(try await client().myThemeProposals().map(\.name) == ["Moss"])
    }
}

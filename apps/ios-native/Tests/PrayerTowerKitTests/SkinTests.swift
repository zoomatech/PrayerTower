import Foundation
import Testing
@testable import PrayerTowerKit

private func theme(_ layout: String, _ json: String) throws -> FeedTheme {
    try JSONDecoder().decode(FeedTheme.self, from: Data(##"{"slug":"s","name":"S","layout":"\##(layout)","tokens":\##(json)}"##.utf8))
}

@Suite struct SkinTests {
    @Test func readsVineTokensAndIgnoresWrongTypes() throws {
        let look = VineLook(try theme("vine", ##"{"leaf":"#8CC152","stem":"#4F8A2E","leafSoft":"#EEF7E3","stemWidth":40,"leafShape":"blob","vineStyle":"beanstalk","stemGlow":"yes","backdrop":"#F6FBF1"}"##))
        #expect(look.leaf == RGB(hex: "#8CC152"))
        #expect(look.stemWidth == 14)  // clamped to 2...14
        #expect(look.leafShape == .round)  // unknown shape
        #expect(look.vineStyle == .beanstalk)
        #expect(!look.stemGlow)  // a string is the wrong type
        #expect(look.backdrop?.hex == "#F6FBF1")
        #expect(VineLook(nil).stem.hex == "#6E8B4E")
    }

    @Test func tintsTheLeafBoxOnlyAsFarAsTextStaysReadable() throws {
        // Reference values from leafBox() in apps/mobile/src/components/vine-flow.tsx.
        let beanstalk = VineLook(try theme("vine", ##"{"leaf":"#8CC152","leafSoft":"#EEF7E3"}"##))
        #expect(beanstalk.leafBox(.faith).hex == "#DFEFCD")
        let golden = VineLook(try theme("vine", ##"{"leaf":"#D9B648","leafSoft":"#FBF5E1"}"##))
        #expect(golden.leafBox(.faith).hex == "#F6ECCA")
        #expect(VineLook(nil).leafBox(.faith).hex == "#EEF3E6")
        for look in [beanstalk, golden, VineLook(nil)] {
            #expect(Skin.readable(on: look.leafBox(.faith), .faith))
            #expect(Skin.readable(on: look.leafBox(.neutral), .neutral))
        }
    }

    @Test func picksAReadableTabletFace() throws {
        let tower = TowerLook(try theme("tower", ##"{"stone":"#B9AE9C","mortar":"#8F8574","climber":"🧗"}"##))
        #expect(tower.face(.faith).hex == "#F1EFEB")
        #expect(Skin.readable(on: tower.face(.faith), .faith))
        #expect(TowerLook(nil).climber == "🧗")
    }

    @Test func clampsTheCircuitTiltAndAlternatesIt() throws {
        let c = CircuitLook(try theme("circuit", ##"{"tilt":45,"wire":"#00E5FF"}"##))
        #expect(c.tilt == 20)
        #expect(c.lean(0) == -20 && c.lean(1) == 20)
        #expect(CircuitLook(try theme("circuit", ##"{"tilt":-3}"##)).tilt == 0)
    }

    @Test func matchesTheSharedContrastRatio() {
        // contrastRatio('#2B2433', '#FFFFFF') in packages/shared is 14.9693.
        #expect(abs(RGB.commentText.contrast(.white) - 14.9693) < 0.0001)
        #expect(RGB(hex: "#0B0820")!.isDark && !RGB(hex: "#FFFCF2")!.isDark)
        #expect(RGB(hex: "#12345") == nil && RGB(hex: "123456x") == nil)
    }

    @Test func fallsBackToTheColumnForUnknownLayouts() throws {
        #expect(try theme("carousel", "{}").kind == .carousel)
        #expect(try theme("tower", "{}").kind == .tower)
        #expect(try theme("something-new", "{}").kind == .column)
        #expect(try JSONDecoder().decode(FeedTheme.self, from: Data(##"{"slug":"x","name":"X","layout":"vine","tokens":null}"##.utf8)).tokens.isEmpty)
    }

    @Test func givesOpenCircleThePlainEndOfFeedLine() throws {
        let look = VineLook(try theme("vine", ##"{"tipText":"You have reached the top of the wreath. Keep watch, and come back soon."}"##))
        #expect(Skin.tip(look, .faith).contains("wreath"))
        #expect(!Skin.tip(look, .neutral).contains("wreath"))
    }
}

extension APIClientTests {
    @Test func readsTheFeedsSkinAndLeafComments() async throws {
        StubProtocol.answer = (200, """
        {"theme":{"slug":"beanstalk","name":"Beanstalk","layout":"vine","cardTemplates":{},"animations":{},"tokens":{"leaf":"#8CC152","stemWidth":12}},
         "posts":[{"id":"p1","author":{"id":null,"displayName":"Someone","handle":null,"anonymous":true},"isMine":false,"postType":"prayer_request",
          "urgency":0,"preview":"x","body":"x","crisis":false,"counts":{"prayingNow":0,"prayers":0,"commitments":0,"comments":1},
          "createdAt":"2026-10-29T08:00:00Z","leafComments":[{"id":"c1","parentId":null,"body":"Holding you up.","isUpdate":false,"createdAt":"2026-10-29T09:00:00Z",
          "author":{"id":"u2","displayName":"Ruth","handle":null,"anonymous":false}}]}],"pinnedId":null,"nextPage":null}
        """)
        let page = try await client().feed()
        #expect(page.theme?.kind == .vine)
        #expect(VineLook(page.theme).stemWidth == 12)
        #expect(page.posts.first?.leafComments?.first?.author.displayName == "Ruth")
    }

    @Test func choosesAFeedSkinOrGoesBackToTheUsualFeed() async throws {
        StubProtocol.answer = (200, ##"{"themes":[{"slug":"wall","name":"Wall","layout":"wall","status":"active","is_default":false}],"current":"wall","theme":null}"##)
        let r = try await client().chooseFeedTheme("wall")
        #expect(r.current == "wall")
        _ = try await client().chooseFeedTheme(nil)
        let bodies = StubProtocol.seen.compactMap { $0.httpBody.map { String(decoding: $0, as: UTF8.self) } }
        #expect(bodies == [##"{"slug":"wall"}"##, ##"{"slug":null}"##])
        #expect(StubProtocol.seen.first?.httpMethod == "PUT")
    }
}

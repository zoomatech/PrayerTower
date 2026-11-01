import Foundation
import Testing
@testable import PrayerTowerKit

/// The Ceramic Figurine skin (Steve, 2026-10-31), matching layouts/ceramic.test.tsx in the Expo app.
@Suite struct CeramicTests {
    @Test func isItsOwnSkin() {
        let theme = FeedTheme(slug: "ceramic-figurine", name: "Ceramic Figurine", layout: "ceramic", tokens: ["backdrop": .string("#EAE6F1")])
        #expect(theme.kind == .ceramic)
        #expect(CeramicLook(theme).backdrop == RGB(hex: "#EAE6F1")!)
    }

    @Test func mixesTheFiveLooksOrKeepsTheMembersChoice() {
        #expect(Ceramic.choices.count == 6)
        #expect(Set((0..<5).map { Ceramic.look("mix", $0) }).count == 5)
        #expect((0..<9).allSatisfy { Ceramic.look("shepherd", $0) == .shepherd })
    }

    @Test func aStatuePointsAtEveryThirdPostAndAngelsAlternateSides() {
        let posts = (0..<9).map { Ceramic.figures("mix", index: $0) }
        #expect(posts.enumerated().filter { $0.element.statue != nil }.map(\.offset) == [1, 4, 7])
        #expect(posts[0].left && !posts[1].left)
        // The statue never wears the same look as the angel hauling that post.
        #expect(posts[1].statue != posts[1].angel)
    }

    @Test func gathersEveryReplyUnderAComment() {
        func n(_ id: String, _ p: String?) -> Beanstalk.Note { .init(id: id, parentId: p, body: id, author: "A", createdAt: "") }
        let kids = ["c": [n("r1", "c"), n("r2", "c")], "r1": [n("r1a", "r1")]]
        #expect(Ceramic.replies(to: "c", in: kids).map(\.id) == ["r1", "r1a", "r2"])
        #expect(Ceramic.replies(to: "x", in: kids).isEmpty)
    }

    @Test func findsTheCenteredPost() {
        #expect(Ceramic.centered([0: 100, 1: 420, 2: 900], screen: 800) == 1)
        #expect(Ceramic.centered([:], screen: 800) == nil)
    }

    @Test func readsTheDesignsOutlines() {
        #expect(SVGPath.parse("M1 2L3 4H5V6Z") == [.move(1, 2), .line(3, 4), .line(5, 4), .line(5, 6), .close])
        #expect(SVGPath.parse("m10 10l5 0h-2v3z") == [.move(10, 10), .line(15, 10), .line(13, 10), .line(13, 13), .close])
        #expect(SVGPath.parse("M0 0Q5 5 10 0T20 0") == [.move(0, 0), .quad(5, 5, 10, 0), .quad(15, -5, 20, 0)])
        #expect(SVGPath.parse("M0 0C1 1 2 1 3 0S5-1 6 0") == [.move(0, 0), .cubic(1, 1, 2, 1, 3, 0), .cubic(4, -1, 5, -1, 6, 0)])
        // Packed numbers like the design writes them: "M23.5 58Q17.5 67 19 76", "a11 11 0 0 0-2-21.6".
        #expect(SVGPath.parse("M.5.5l1-1").count == 2)
        let arc = SVGPath.parse("M0 0a10 10 0 0 1 20 0")
        guard case let .cubic(_, _, _, _, x, y) = arc.last else { Issue.record("no arc"); return }
        #expect(abs(x - 20) < 1e-9 && abs(y) < 1e-9)
        #expect(arc.count >= 3)
    }
}

import Foundation
import Testing
@testable import PrayerTowerKit

/// The same cases as apps/mobile/src/layouts/__tests__/beanstalk.test.tsx.
@Suite struct BeanstalkTests {
    private func n(_ id: String, _ mins: Int, _ parent: String? = nil) -> Beanstalk.Note {
        Beanstalk.Note(id: id, parentId: parent, body: id, author: id, createdAt: String(format: "2026-10-30T00:%02d:00.000Z", mins))
    }

    @Test func cutsLongWordsAndLeavesShortOnesWhole() {
        #expect(Beanstalk.fit("He answers prayer.", max: 40) == ("He answers prayer.", false))
        let long = Beanstalk.fit("Praying for you and your family tonight. You are not alone in this.", max: 40)
        #expect(long.cut)
        #expect(long.text.hasSuffix(".."))
        #expect(long.text.count <= 40)
    }

    @Test func hangsThreeLeavesAndSproutsRepliesThreeLevelsDeep() {
        let all = [n("a", 1), n("b", 2), n("c", 3), n("d", 4), n("r1", 5, "d"), n("r2", 6, "d"), n("r3", 7, "d"), n("r4", 8, "d"), n("rr", 9, "r1"), n("rrr", 10, "rr")]
        let (top, kids) = Beanstalk.tree(all)
        #expect(top.map(\.id) == ["d", "c", "b", "a"])
        let page = Array(top.prefix(Beanstalk.perPage))
        let closed = Beanstalk.rows(page: page, kids: kids, open: [])
        #expect(closed.map(\.id) == ["d", "c", "b"])
        #expect(closed.map(\.right) == [false, true, false])
        let open = Beanstalk.rows(page: page, kids: kids, open: ["d", "r1", "rr"])
        #expect(open.map { "\($0.id):\($0.level)" } == ["d:0", "r1:1", "rr:2", "r2:1", "r3:1", "c:0", "b:0"])
        #expect(open.map(\.level).max() == Beanstalk.maxLevel)
    }
}

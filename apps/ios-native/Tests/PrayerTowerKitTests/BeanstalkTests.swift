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

/// The same cases as the Expo app's: the design's frame vine, the leaves below a post, the sway.
@Suite struct BeanDrawTests {
    private func n(_ id: String, _ mins: Int, _ parent: String? = nil) -> Beanstalk.Note {
        Beanstalk.Note(id: id, parentId: parent, body: id, author: id, createdAt: String(format: "2026-10-30T00:%02d:00.000Z", mins))
    }

    private func points(_ d: BeanDraw.Drawing) -> [(Double, Double)] {
        d.flatMap { s -> [(Double, Double)] in
            switch s {
            case let .move(x, y), let .line(x, y): return [(x, y)]
            case let .curve(a, b, c, e, x, y): return [(a, b), (c, e), (x, y)]
            case let .circle(x, y, r): return [(x - r, y - r), (x + r, y + r)]
            case .close: return []
            }
        }
    }

    @Test func windsTheFrameVineFromTheBottomMiddleToTheTopWithRoomForEveryLeaf() {
        let v = BeanDraw.frameVine(w: 360, h: 240)
        #expect(v.w == 412 && v.h == 292)
        for s in v.s1 + v.s2 {
            let p = points(s)
            #expect(abs(p.first!.0 - 206) < 1 && abs(p.first!.1 - 266) < 1)
            #expect(abs(p.last!.0 - 206) < 1 && abs(p.last!.1 - 26) < 1)
        }
        for d in v.la + v.lb + [v.tendrils, v.flower] {
            for p in points(d) { #expect(p.0 >= 0 && p.0 <= v.w && p.1 >= 0 && p.1 <= v.h) }
        }
        #expect(v.la.filter { !$0.isEmpty }.count == 5)
    }

    @Test func setsEachPostOffTheCentreLineByTurnsWithinFifteenPercent() {
        for lane in [320.0, 375, 430, 760] {
            #expect(BeanDraw.maxShift(lane) <= lane * 0.15)
            #expect((lane - BeanDraw.frameWidth(lane)) / 2 - BeanDraw.maxShift(lane) >= 30)
            let s = ["a", "bb", "ccc", "dddd"].enumerated().map { BeanDraw.postShift(id: $1, index: $0, lane: lane) }
            #expect(s.map { $0 < 0 } == [true, false, true, false])
        }
        // The same amount as the Expo app's for the same id.
        #expect(abs(BeanDraw.postShift(id: "abc", index: 1, lane: 430) - BeanDraw.postShift(id: "abc", index: 3, lane: 430)) < 0.0001)
    }

    @Test func hangsThreeLeavesBelowThePostAndSproutsRepliesThreeLevelsDeep() {
        let all = [n("a", 1), n("b", 2), n("c", 3), n("d", 4), n("r1", 5, "d"), n("r2", 6, "d"), n("r3", 7, "d"), n("r4", 8, "d"), n("rr", 9, "r1"), n("rrr", 10, "rr")]
        let (top, kids) = Beanstalk.tree(all)
        let closed = BeanDraw.hanging(w: 360, top: top, kids: kids, cv: .init(), seed: 0)
        #expect(closed.leaves.map(\.id) == ["d", "c", "b"])
        #expect(closed.leaves.map(\.side) == [-1, 1, -1])
        #expect(closed.pager && closed.pages == 2)
        #expect(BeanDraw.hanging(w: 360, top: top, kids: kids, cv: .init(page: 1), seed: 0).leaves.map(\.id) == ["a"])
        let open = BeanDraw.hanging(w: 360, top: top, kids: kids, cv: .init(open: 0, open2: 0), seed: 0)
        #expect(open.leaves.map { "\($0.id):\($0.level)" } == ["d:1", "c:1", "b:1", "r1:2", "rr:3", "r2:2", "r3:2"])
        #expect(open.H > closed.H)
    }

    @Test func bendsTheStalkOverToTheNextPost() {
        let (top, kids) = Beanstalk.tree([n("a", 1)])
        let bent = BeanDraw.hanging(w: 360, top: top, kids: kids, cv: .init(), seed: 0, bend: 40)
        let first = points(bent.s1).first!, last = points(bent.s1).last!
        #expect(first.0 == 180 && first.1 == 0)
        #expect(last.0 == 220 && last.1 == bent.H)
    }
}

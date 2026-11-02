import XCTest
@testable import PrayerTowerKit

/// Comments laid out Facebook style (Steve, 2026-11-02).
final class FacebookThreadTests: XCTestCase {
    private func n(_ id: String, _ parent: String?, _ at: String) -> Beanstalk.Note {
        Beanstalk.Note(id: id, parentId: parent, body: "Words \(id)", author: "Name \(id)", createdAt: "2026-11-02T10:\(at):00Z")
    }

    func testCountsEveryHiddenCommentRepliesIncluded() {
        let notes = [n("a", nil, "00"), n("b", "a", "01"), n("c", nil, "02")]
        XCTAssertEqual(FacebookThread.hidden(notes, total: 2), 2)
        XCTAssertEqual(FacebookThread.hidden(notes, total: 9), 8)
        XCTAssertEqual(FacebookThread.hidden([n("a", nil, "00")], total: 1), 0)
    }

    func testStopsRepliesAtTheThirdLevelLiningDeeperOnesUpThere() {
        let notes = [n("a", nil, "00"), n("b", "a", "01"), n("d", "b", "02"), n("e", "d", "03")]
        let kids = Beanstalk.tree(notes).kids
        XCTAssertEqual(FacebookThread.replies(to: "a", level: 1, in: kids).map(\.id), ["b"])
        XCTAssertEqual(FacebookThread.replies(to: "b", level: 2, in: kids).map(\.id), ["d", "e"])
        XCTAssertTrue(FacebookThread.replies(to: "d", level: 3, in: kids).isEmpty)
        XCTAssertEqual(FacebookThread.descendants(of: "a", in: kids), 3)
    }

    func testOnlyTopLevelCommentsGetReply() {
        XCTAssertTrue(FacebookThread.canReply(level: 1))
        XCTAssertFalse(FacebookThread.canReply(level: 2))
        XCTAssertFalse(FacebookThread.canReply(level: 3))
    }
}

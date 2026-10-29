import Foundation
import Testing
@testable import PrayerTowerKit

@Suite struct NeonArtTests {
    @Test func readsMovesLinesCurvesAndClose() {
        let ops = SVGPath.parse("M 68 150 L 68 126 Q 80 110 92 126 C 1 2, 3 4, 5 6 Z M 0 -10 L 94 -6")
        #expect(ops == [
            .move(68, 150), .line(68, 126), .quad(92, 126, cx: 80, cy: 110),
            .cubic(5, 6, c1x: 1, c1y: 2, c2x: 3, c2y: 4), .close, .move(0, -10), .line(94, -6),
        ])
    }

    @Test func turnsAHalfCircleArcIntoCurvesOnTheCircle() {
        let ops = SVGPath.parse("M 58 128 A 18 18 0 1 1 22 128")
        #expect(ops.count == 3) // the move, then two quarter turns
        for op in ops.dropFirst() {
            guard case let .cubic(x, y, _, _, _, _) = op else { Issue.record("not a curve"); continue }
            #expect(abs(((x - 40) * (x - 40) + (y - 128) * (y - 128)).squareRoot() - 18) < 0.001)
        }
        guard case let .cubic(x, y, _, _, _, _) = ops.last else { return }
        #expect(abs(x - 22) < 0.001 && abs(y - 128) < 0.001)
        // Sweep 1 turns clockwise on screen (y points down), so from the right side it passes under the center.
        guard case let .cubic(mx, my, _, _, _, _) = ops[1] else { return }
        #expect(abs(mx - 40) < 0.001 && abs(my - 146) < 0.001)
    }

    @Test func everySceneHasTubesThatStayInItsBox() {
        let box = NeonSceneKind.box
        for kind in NeonSceneKind.allCases {
            #expect(!kind.tubes.isEmpty)
            for tube in kind.tubes {
                #expect(!tube.ops.isEmpty)
                for op in tube.ops {
                    let p: (Double, Double)? = switch op {
                    case let .move(x, y), let .line(x, y): (x, y)
                    case let .quad(x, y, _, _), let .cubic(x, y, _, _, _, _): (x, y)
                    case .close: nil
                    }
                    if let (x, y) = p {
                        #expect(x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height, "\(kind) \(x),\(y)")
                    }
                }
            }
        }
    }

    @Test func placesScenesAfterTheSecondCardThenEveryThird() {
        let placed = (0..<12).map { NeonSceneKind.after(card: $0) }
        #expect(placed == [nil, .castle, nil, nil, .coach, nil, nil, .clock, nil, nil, .slipper, nil])
    }
}

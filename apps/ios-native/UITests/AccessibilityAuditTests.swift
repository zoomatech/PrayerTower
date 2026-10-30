import XCTest

/// Xcode's accessibility audit (`performAccessibilityAudit`, iOS 17) on the sign-in screen and on
/// every feed skin, at the default text size and at the largest accessibility size. The audit
/// checks contrast, element descriptions, hit regions, clipped text, Dynamic Type and traits;
/// any issue fails the test. Skins come from the debug-only AuditSamplesView, so no server is needed.
final class AccessibilityAuditTests: XCTestCase {
    static let skins = ["Beanstalk", "Golden Wood", "Moonlit Gate", "Neon Cinderella", "Blossom Garden", "Christmas Star",
                        "Wall", "Prayer Tower", "Neon Circuit", "Swipe to pray", "Flip"]
    static let sizes = ["UICTContentSizeCategoryL", "UICTContentSizeCategoryAccessibilityXXXL"]

    /// Names the element in the log so the issue can be found; every issue still fails the test.
    /// On the main actor, as XCUIElement's properties are; every caller is a @MainActor test.
    @MainActor static func log(_ issue: XCUIAccessibilityAuditIssue, _ place: String) -> Bool {
        let what = issue.element.map { "\($0.elementType) '\($0.label)'" } ?? "screen"
        print("AUDIT \(place): \(issue.compactDescription) on \(what)")
        return false
    }

    override func setUp() {
        continueAfterFailure = true
    }

    @MainActor func testSignInScreen() throws {
        for size in Self.sizes {
            let app = XCUIApplication()
            app.launchArguments = ["-UIPreferredContentSizeCategoryName", size]
            app.launch()
            try app.performAccessibilityAudit { issue in Self.log(issue, "Sign-in at \(size)") }
            app.terminate()
        }
    }

    @MainActor func testEverySkin() throws {
        for size in Self.sizes {
            let app = XCUIApplication()
            app.launchArguments = ["-PTAuditSamples", "-UIPreferredContentSizeCategoryName", size]
            app.launch()
            for name in Self.skins {
                try XCTContext.runActivity(named: "\(name) at \(size)") { _ in
                    let link = app.buttons[name]
                    for _ in 0..<5 where !link.isHittable { app.collectionViews.firstMatch.swipeUp() }
                    link.tap()
                    XCTAssertNoThrow(try app.performAccessibilityAudit { issue in Self.log(issue, "\(name) at \(size)") }, "\(name) at \(size)")
                    app.navigationBars.buttons.element(boundBy: 0).tap()
                }
            }
            app.terminate()
        }
    }
}

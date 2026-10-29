import XCTest

/// Xcode's accessibility audit (`performAccessibilityAudit`, iOS 17) on the sign-in screen and on
/// every feed skin, at the default text size and at the largest accessibility size. The audit
/// checks contrast, element descriptions, hit regions, clipped text, Dynamic Type and traits;
/// any issue fails the test. Skins come from the debug-only AuditSamplesView, so no server is needed.
final class AccessibilityAuditTests: XCTestCase {
    static let skins = ["Beanstalk", "Golden Wood", "Moonlit Gate", "Neon Cinderella", "Blossom Garden", "Christmas Star",
                        "Wall", "Prayer Tower", "Neon Circuit", "Swipe to pray", "Flip"]
    static let sizes = ["UICTContentSizeCategoryL", "UICTContentSizeCategoryAccessibilityXXXL"]

    override func setUp() {
        continueAfterFailure = true
    }

    @MainActor func testSignInScreen() throws {
        for size in Self.sizes {
            let app = XCUIApplication()
            app.launchArguments = ["-UIPreferredContentSizeCategoryName", size]
            app.launch()
            try audit(app, "sign-in at \(size)")
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
                    XCTAssertTrue(link.waitForExistence(timeout: 5), "\(name) link at \(size)")
                    link.tap()
                    try audit(app, "\(name) at \(size)")
                    // Back to the list; a skin whose bar has no back button (seen once at the largest
                    // text) gets a fresh launch instead.
                    let back = app.navigationBars.buttons.firstMatch
                    if back.waitForExistence(timeout: 3) { back.tap() } else {
                        app.terminate()
                        app.launch()
                    }
                }
            }
            app.terminate()
        }
    }

    /// Runs the audit and fails once per issue, naming the element, so CI's annotations say what to fix.
    @MainActor func audit(_ app: XCUIApplication, _ place: String) throws {
        try app.performAccessibilityAudit { issue in
            let element = issue.element
            let what = element.map { "\($0.elementType.rawValue) '\($0.label)' id '\($0.identifier)' at \($0.frame)" } ?? "no element"
            XCTFail("\(place): \(issue.compactDescription) on \(what). \(issue.detailedDescription)")
            return true
        }
    }
}

import XCTest

/// Xcode's accessibility audit (`performAccessibilityAudit`, iOS 17) on the sign-in screen and on
/// every feed skin, at the default text size and at the largest accessibility size. The audit
/// checks contrast, element descriptions, hit regions, clipped text, Dynamic Type and traits;
/// any issue fails the test. Skins come from the debug-only AuditSamplesView, so no server is needed.
final class AccessibilityAuditTests: XCTestCase {
    static let skins = ["Beanstalk", "Golden Wood", "Moonlit Gate", "Neon Cinderella", "Blossom Garden", "Christmas Star",
                        "Wall", "Prayer Tower", "Neon Circuit", "Swipe to pray", "Flip"]
    static let sizes = ["UICTContentSizeCategoryL", "UICTContentSizeCategoryAccessibilityXXXL"]

    /// Issues WCAG doesn't count, left aside by every audit here: Apple's own warnings for its
    /// system colors and list text ("nearly passed", "partially unsupported"), contrast on a
    /// switched-off control (a Sign in button before anything is typed), and decorative symbols
    /// with no words in them (the dove, a star).
    @MainActor static func exempt(_ issue: XCUIAccessibilityAuditIssue) -> Bool {
        let text = issue.compactDescription
        if text.contains("nearly passed") || text.contains("partially unsupported") { return true }
        guard let element = issue.element else { return false }
        if issue.auditType == .contrast, !element.isEnabled { return true }
        let label = element.label
        return !label.isEmpty && !label.contains { $0.isLetter || $0.isNumber }
    }

    /// Names the element in the log so the issue can be found; every other issue fails the test.
    @MainActor static func log(_ issue: XCUIAccessibilityAuditIssue, _ place: String) -> Bool {
        if exempt(issue) { return true }
        let what = issue.element.map { "\($0.elementType) '\($0.label)'" } ?? "screen"
        print("AUDIT \(place): \(issue.compactDescription) on \(what). \(issue.detailedDescription)")
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

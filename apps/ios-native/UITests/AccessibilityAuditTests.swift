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
                    // Let the push finish before the audit: mid-slide, text is half faded.
                    _ = app.navigationBars[name].waitForExistence(timeout: 5)
                    sleep(1)
                    try audit(app, "\(name) at \(size)")
                    // Then the end of the feed, so its last lines are checked on screen, not cut by the edge.
                    // Press-and-drag, which stops dead when the finger lifts: a swipe leaves the feed
                    // gliding, and the audit's picture then no longer matches where the words are.
                    let window = app.windows.firstMatch
                    for _ in 0..<3 {
                        window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
                            .press(forDuration: 0.1, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2)),
                                   withVelocity: .slow, thenHoldForDuration: 0.5)
                    }
                    sleep(2)
                    try audit(app, "\(name) at \(size), scrolled to the end")
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
        // Only what is wholly on screen, between the bars and clear of the bottom edge: a line half
        // under the navigation bar, or one at the very bottom that the audit's larger text pushes
        // off the screen, can't be measured there; it is checked at the other scroll position.
        let window = app.windows.firstMatch.frame
        let top = app.navigationBars.firstMatch.exists ? app.navigationBars.firstMatch.frame.maxY : window.minY
        let bottom = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : window.maxY - 80
        let visible = CGRect(x: window.minX, y: top, width: window.width, height: bottom - top)
        try app.performAccessibilityAudit { issue in
            let element = issue.element
            if let frame = element?.frame, !visible.contains(frame) { return true }
            let what = element.map { "\($0.elementType.rawValue) '\($0.label)' id '\($0.identifier)' at \($0.frame)" } ?? "no element"
            XCTFail("\(place): \(issue.compactDescription) on \(what). \(issue.detailedDescription)")
            return true
        }
    }
}

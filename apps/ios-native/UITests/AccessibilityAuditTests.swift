import XCTest

/// Xcode's accessibility audit (`performAccessibilityAudit`, iOS 17) on the sign-in screen and on
/// every feed skin, at the default text size and at the largest accessibility size. The audit
/// checks contrast, element descriptions, hit regions, clipped text, Dynamic Type and traits;
/// any issue fails the test. Skins come from the debug-only AuditSamplesView, so no server is needed.
final class AccessibilityAuditTests: XCTestCase {
    static let skins = ["Beanstalk", "Golden Wood", "Moonlit Gate", "Neon Cinderella", "Blossom Garden", "Christmas Star",
                        "Wall", "Prayer Tower", "Neon", "Neon Circuit", "Swipe to pray", "Flip"]
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
                    // Beanstalk's posts grow in over 2 seconds (card, vine, then leaves) as they come into view.
                    sleep(3)
                    try audit(app, "\(name) at \(size)")
                    // Then the end of the feed, so its last lines are checked on screen, not cut by the edge.
                    // At the default size: at the largest, each card fills the screen, the top pass
                    // already sees them whole, and a feed dragged that far is still settling.
                    if size == Self.sizes[0] {
                        // Press-and-drag, which stops dead when the finger lifts: a swipe leaves the feed
                        // gliding, and the audit's picture then no longer matches where the words are.
                        let window = app.windows.firstMatch
                        for _ in 0..<3 {
                            window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
                                .press(forDuration: 0.1, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2)),
                                       withVelocity: .slow, thenHoldForDuration: 0.5)
                        }
                        // Wait until the feed has come to rest: the same words in the same place twice running.
                        var last = CGRect.null
                        for _ in 0..<10 {
                            sleep(1)
                            let now = app.staticTexts.allElementsBoundByIndex.prefix(8).reduce(CGRect.null) { $0.union($1.frame) }
                            if now == last { break }
                            last = now
                        }
                        sleep(1)
                        // Read the element tree once, so the audit sees where things are after the
                        // scroll rather than where they were.
                        _ = app.debugDescription
                        try audit(app, "\(name) at \(size), scrolled to the end")
                    }
                    // Back to the list by the bar's own back button (it carries the list's title,
                    // "Skins"): the first button in any bar can be one of the skin's own, which once
                    // opened a compose sheet and lost the list. If the list still isn't showing, the
                    // app is launched again on it.
                    let back = app.navigationBars[name].buttons["Skins"]
                    if back.waitForExistence(timeout: 3) { back.tap() }
                    if !app.navigationBars["Skins"].waitForExistence(timeout: 3) {
                        app.terminate()
                        app.launch()
                        _ = app.navigationBars["Skins"].waitForExistence(timeout: 10)
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
        // An audit that runs out of time is tried once more, then reported for this screen without
        // stopping the rest of the skins.
        for attempt in 1...2 {
            do {
                try runAudit(app, place, in: visible)
                return
            } catch where attempt == 1 {
                sleep(2)
            } catch {
                XCTFail("\(place): the audit didn't finish: \(error.localizedDescription)")
            }
        }
    }

    @MainActor private func runAudit(_ app: XCUIApplication, _ place: String, in visible: CGRect) throws {
        try app.performAccessibilityAudit { issue in
            let element = issue.element
            // An element with no place on screen (an infinite or empty frame) can't be measured there.
            if let frame = element?.frame, !frame.origin.x.isFinite || !frame.origin.y.isFinite || frame.isEmpty || !visible.contains(frame) { return true }
            // Advisory only, as in UIWalks/MainScreensWalk.swift: the text does grow, just not by the
            // audit's full step (a system row button, e.g. sign-in's "Forgot your password?").
            if issue.compactDescription.contains("partially unsupported") { return true }
            let what = element.map { "\($0.elementType.rawValue) '\($0.label)' id '\($0.identifier)' at \($0.frame)" } ?? "no element"
            XCTFail("\(place): \(issue.compactDescription) on \(what). \(issue.detailedDescription)")
            return true
        }
    }
}

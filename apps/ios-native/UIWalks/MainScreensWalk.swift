import XCTest

/// Walks the main native screens on the iOS Simulator with the app's on-device sample data
/// (-PTSampleData, SampleServer in PrayerTowerKit): no server, no account, no network.
/// scripts/mac-build-native.sh runs it headless; no Simulator window opens.
final class MainScreensWalk: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-PTSampleData"]
        app.launch()
    }

    private func shows(_ text: String, timeout: TimeInterval = 10) -> Bool {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch.waitForExistence(timeout: timeout)
    }

    private func tab(_ name: String) {
        let button = app.tabBars.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: 10), "No \(name) tab")
        button.tap()
    }

    func testFeedOpensARequestWithItsComments() {
        XCTAssertTrue(shows("Please pray for my mother's surgery"), "The feed didn't show the sample request")
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Please pray for my mother's surgery")).firstMatch.tap()
        XCTAssertTrue(shows("Holding you and your mother up today."), "The request didn't show its comment")
        XCTAssertTrue(shows("Ruth"))
    }

    func testEveryTabOpens() {
        XCTAssertTrue(shows("Please pray for my mother's surgery"))
        tab("My Promises")
        XCTAssertTrue(shows("I will pray for Ruth's mother."), "My Promises didn't show the sample promise")
        tab("Messages")
        XCTAssertTrue(shows("Sam"), "Messages didn't show the sample conversation")
        tab("Notices")
        XCTAssertTrue(shows("Sam prayed for you"), "Notices didn't show the sample notice")
        tab("Me")
        XCTAssertTrue(app.tabBars.buttons["Me"].isSelected)
        tab("Feed")
        XCTAssertTrue(shows("Asking for strength for my new job."))
    }

    /// Apple's accessibility audit (contrast, Dynamic Type, hit areas, labels…) on every tab and a
    /// request. Every issue is collected and listed, so one run shows them all.
    func testEveryScreenPassesTheAccessibilityAudit() throws {
        XCTAssertTrue(shows("Please pray for my mother's surgery"))
        var issues: [String] = []
        func audit(_ screen: String) throws {
            try app.performAccessibilityAudit { issue in
                // Left aside: Apple's own warnings for its system colors and list text ("nearly
                // passed", "partially unsupported"), and contrast on a switched-off control, which
                // WCAG exempts (a Comment button before anything is typed).
                let text = issue.compactDescription
                if text.contains("nearly passed") || text.contains("partially unsupported") { return true }
                if issue.auditType == .contrast, issue.element?.isEnabled == false { return true }
                let what = issue.element.map { "\($0.elementType) '\($0.label)'" } ?? "screen"
                issues.append("\(screen): \(issue.compactDescription) on \(what). \(issue.detailedDescription)")
                return true
            }
        }
        try audit("Feed")
        for name in ["My Promises", "Messages", "Notices", "Me"] {
            tab(name)
            sleep(1)
            try audit(name)
        }
        tab("Feed")
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Please pray for my mother's surgery")).firstMatch.tap()
        XCTAssertTrue(shows("Holding you and your mother up today."))
        try audit("Request")
        XCTAssertTrue(issues.isEmpty, "Accessibility audit:\n" + issues.joined(separator: "\n"))
    }
}

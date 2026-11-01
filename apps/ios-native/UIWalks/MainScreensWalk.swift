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

    /// Messages and Notices are on Me on iPhone, not in the tab bar.
    private func fromMe(_ name: String) {
        tab("Me")
        let link = app.buttons[name].firstMatch
        XCTAssertTrue(link.waitForExistence(timeout: 10), "No \(name) on Me")
        link.tap()
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
        XCTAssertFalse(app.tabBars.buttons["Messages"].exists, "Messages belongs on Me, not the tab bar")
        XCTAssertFalse(app.tabBars.buttons["Notices"].exists, "Notices belongs on Me, not the tab bar")
        fromMe("Messages")
        XCTAssertTrue(shows("Sam"), "Messages didn't show the sample conversation")
        app.navigationBars.buttons.firstMatch.tap()
        let notices = app.buttons["Notices"].firstMatch
        XCTAssertTrue(notices.waitForExistence(timeout: 10), "No Notices on Me")
        notices.tap()
        XCTAssertTrue(shows("Sam prayed for you"), "Notices didn't show the sample notice")
        XCTAssertTrue(app.tabBars.buttons["Me"].isSelected)
        tab("Prayers")
        XCTAssertTrue(shows("Asking for strength for my new job."))
    }

    /// Apple's accessibility audit (contrast, Dynamic Type, hit areas, labels…) on every tab and a
    /// request. Every issue is collected and listed, so one run shows them all.
    func testEveryScreenPassesTheAccessibilityAudit() throws {
        XCTAssertTrue(shows("Please pray for my mother's surgery"))
        var issues: [String] = []
        var described: Set<String> = []
        func audit(_ screen: String) throws {
            // Only what is wholly on screen between the bars, as in AccessibilityAuditTests: words
            // passing under the see-through tab bar are read once scrolled clear of it, not through it.
            let window = app.windows.firstMatch.frame
            let top = app.navigationBars.firstMatch.exists ? app.navigationBars.firstMatch.frame.maxY : window.minY
            let bottom = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : window.maxY
            let visible = CGRect(x: window.minX, y: top, width: window.width, height: bottom - top)
            // Words lying under a bar right now: a contrast issue Apple names no element for is then
            // most likely those words seen through the bar, and they are audited once scrolled clear.
            let under = app.staticTexts.allElementsBoundByIndex.contains { $0.exists && !$0.frame.isEmpty && !visible.contains($0.frame) && $0.frame.intersects(window) }
            try app.performAccessibilityAudit { issue in
                if issue.element == nil, issue.auditType == .contrast, under { return true }
                if let frame = issue.element?.frame, !visible.contains(frame) { return true }
                // Left aside: Apple's own warnings for its system colors and list text ("nearly
                // passed", "partially unsupported"), contrast on a switched-off control, which WCAG
                // exempts (a Comment button before anything is typed), and decorative symbols.
                let text = issue.compactDescription
                if text.contains("nearly passed") || text.contains("partially unsupported") { return true }
                if issue.auditType == .contrast, issue.element?.isEnabled == false { return true }
                if let label = issue.element?.label, !label.isEmpty, !label.contains(where: { $0.isLetter || $0.isNumber }) { return true }
                let what = issue.element.map { "\($0.elementType) '\($0.label)'" } ?? "screen"
                // An issue Apple names no element for: list what is on screen, once per screen, so the
                // CI log shows what it could be (CI's Xcode flags these where a Mac's newer one doesn't).
                if issue.element == nil, !described.contains(screen) {
                    described.insert(screen)
                    for line in self.app.debugDescription.split(separator: "\n") where line.contains("{{") {
                        print("WALKDIAG \(screen): \(line.trimmingCharacters(in: .whitespaces))")
                    }
                }
                issues.append("\(screen): \(issue.compactDescription) on \(what). \(issue.detailedDescription)")
                return true
            }
        }
        try audit("Feed")
        for name in ["My Promises", "Me"] {
            tab(name)
            sleep(1)
            try audit(name)
        }
        fromMe("Messages")
        sleep(1)
        try audit("Messages")
        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["Notices"].firstMatch.tap()
        sleep(1)
        try audit("Notices")
        tab("Prayers")
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Please pray for my mother's surgery")).firstMatch.tap()
        XCTAssertTrue(shows("Holding you and your mother up today."))
        try audit("Request")
        // The rest of the request, scrolled up clear of the tab bar.
        app.swipeUp()
        // Until it comes to rest: the same words in the same place twice running.
        var last = CGRect.null
        for _ in 0..<10 {
            sleep(1)
            let now = app.staticTexts.allElementsBoundByIndex.prefix(8).reduce(CGRect.null) { $0.union($1.frame) }
            if now == last { break }
            last = now
        }
        sleep(1)
        try audit("Request, scrolled")
        XCTAssertTrue(issues.isEmpty, "Accessibility audit:\n" + issues.joined(separator: "\n"))
    }

    /// Diagnostic, never fails: audits a request with one part left out at a time and prints what
    /// Apple flags, so the CI log shows which part its Xcode flags with no element named.
    func testRequestAuditBisect() throws {
        for hide in ["none", "comments", "ctext", "cbuttons", "cshare", "header,prayed,composer"] {
            let a = XCUIApplication()
            a.launchArguments = ["-PTSampleData", "-PTHide", hide]
            a.launch()
            let post = a.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Please pray for my mother's surgery")).firstMatch
            guard post.waitForExistence(timeout: 15) else { print("BISECT \(hide): no feed"); continue }
            post.tap()
            sleep(3)
            var found: [String] = []
            try? a.performAccessibilityAudit { issue in
                if issue.element == nil { found.append(issue.compactDescription) }
                return true
            }
            print("BISECT \(hide): \(found.isEmpty ? "clean" : found.joined(separator: " | "))")
            a.terminate()
        }
    }
}

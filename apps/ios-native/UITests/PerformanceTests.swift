import XCTest

/// Launch time and scrolling a 1,000-post feed, measured with XCTest metrics on the sample data
/// (-PTDemo, no server). The numbers appear in the test report; run headless with
/// xcodebuild test -only-testing:PrayerTowerNativeUITests/PerformanceTests.
final class PerformanceTests: XCTestCase {
    @MainActor func testLaunchTime() {
        measure(metrics: [XCTApplicationLaunchMetric()]) {
            let app = XCUIApplication()
            app.launchArguments = ["-PTDemo"]
            app.launch()
        }
    }

    @MainActor func testScrollingAThousandPostFeed() {
        let app = XCUIApplication()
        app.launchArguments = ["-PTDemo", "-PTDemoPosts", "1000"]
        app.launch()
        let feed = app.collectionViews.firstMatch
        XCTAssertTrue(feed.waitForExistence(timeout: 15))
        let options = XCTMeasureOptions()
        options.invocationOptions = [.manuallyStop]
        measure(metrics: [XCTOSSignpostMetric.scrollingAndDecelerationMetric, XCTCPUMetric(application: app), XCTMemoryMetric(application: app)], options: options) {
            for _ in 0..<10 { feed.swipeUp(velocity: .fast) }
            stopMeasuring()
            for _ in 0..<10 { feed.swipeDown(velocity: .fast) }
        }
    }
}

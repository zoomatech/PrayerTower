import PrayerTowerKit
import PrayerTowerSession
import SnapshotTesting
import SwiftUI
import XCTest
@testable import PrayerTowerNative

/// Every main screen on the sample data (`SampleServer`), in light and dark mode at the largest
/// accessibility text size, so clipped or overlapping text shows up in review. New images are
/// recorded on the first run (the test fails once, saying so); after that any change fails until
/// it is looked at and recorded again. Run headless: xcodebuild test -only-testing:PrayerTowerNativeSnapshotTests.
@MainActor
final class ScreenSnapshotTests: XCTestCase {
    nonisolated override func invokeTest() {
        withSnapshotTesting(record: .missing) { super.invokeTest() }
    }

    func testSignIn() { snap(SignInView()) }
    func testFeed() { snap(FeedView()) }
    func testPostDetail() { snap(NavigationStack { PostDetailView(postId: "sample-p1") }) }
    func testPromises() { snap(CommitmentsView()) }
    func testMessages() { snap(MessagesView()) }
    func testNotices() { snap(NotificationsView()) }
    func testCircles() { snap(CirclesView()) }
    func testMe() { snap(MeView()) }
    func testCompose() { snap(ComposeView()) }

    private func snap(_ view: some View, file: StaticString = #filePath, testName: String = #function, line: UInt = #line) {
        let model = AppModel(store: .sampleData(posts: nil))
        let ready = expectation(description: "sample data loaded")
        Task {
            await model.start()
            await model.loadSettings()
            ready.fulfill()
        }
        wait(for: [ready], timeout: 10)
        for (name, style) in [("light", UIUserInterfaceStyle.light), ("dark", .dark)] {
            let host = UIHostingController(rootView: view.environment(model))
            let traits = UITraitCollection { t in
                t.userInterfaceStyle = style
                t.preferredContentSizeCategory = .accessibilityExtraExtraExtraLarge
            }
            // Wait for each screen's own loads to finish before the picture is taken.
            assertSnapshot(of: host, as: .wait(for: 2, on: .image(on: .iPhone13, perceptualPrecision: 0.98, traits: traits)),
                           named: "\(name)-largest-text", file: file, testName: testName, line: line)
        }
    }
}

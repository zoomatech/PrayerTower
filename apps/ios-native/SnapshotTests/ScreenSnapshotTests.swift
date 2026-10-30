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

    /// Every feed skin on its sample requests at the largest text, light mode, for the clipping
    /// the accessibility audit can only describe (AuditSamplesView's list, in the same order).
    func testEverySkin() {
        for skin in AuditSamplesView.skins {
            let feed = NavigationStack {
                SkinnedFeed(theme: skin, cards: SkinMaker.sampleCards(.faith), wording: .faith, hasMore: false, row: { card in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(card.author.displayName).font(.subheadline.bold())
                        Text(card.body)
                    }
                }, onEnd: {})
                .navigationTitle(skin.name)
                .navigationBarTitleDisplayMode(.inline)
            }
            assertSnapshot(of: UIHostingController(rootView: feed), as: .loaded(style: .light, seconds: 1),
                           named: "skin-\(skin.slug)-largest-text", timeout: 10)
        }
    }

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
            assertSnapshot(of: host, as: .loaded(style: style), named: "\(name)-largest-text", timeout: 15,
                           file: file, testName: testName, line: line)
        }
    }
}

extension Snapshotting where Value == UIViewController, Format == UIImage {
    /// The screen shown in a real window on an iPhone 13-sized screen at the largest accessibility
    /// text size, given a few seconds there so its own `.task` loads finish before the picture.
    /// (The library's `.wait` waits before the screen is in a window, so loads never start.)
    @MainActor static func loaded(style: UIUserInterfaceStyle, seconds: Double = 3) -> Snapshotting {
        Snapshotting(pathExtension: "png", diffing: .image(perceptualPrecision: 0.98)) { controller in
            Async { done in
                nonisolated(unsafe) let finish = done
                Task { @MainActor in
                    let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
                    let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow()
                    window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
                    window.overrideUserInterfaceStyle = style
                    controller.traitOverrides.preferredContentSizeCategory = .accessibilityExtraExtraExtraLarge
                    window.rootViewController = controller
                    window.isHidden = false
                    try? await Task.sleep(for: .seconds(seconds))
                    controller.view.setNeedsLayout()
                    controller.view.layoutIfNeeded()
                    let format = UIGraphicsImageRendererFormat()
                    format.scale = 3
                    let image = UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { ctx in
                        window.layer.render(in: ctx.cgContext)
                    }
                    window.isHidden = true
                    window.rootViewController = nil
                    finish(image)
                }
            }
        }
    }
}

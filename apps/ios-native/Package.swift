// swift-tools-version: 6.0
// The native iPhone app's shared code (docs/SWIFT_PORT.md):
// - PrayerTowerKit: the Prayer Tower API (models, requests, errors). Foundation only.
// - PrayerTowerSession: signing in with Supabase Auth (supabase-swift) and handing the
//   access token to the API, including the two-step code.
// - PrayerTowerScripture: the Bible searches ported from Winstons Syndicate (docs/LIBRARY_SEARCH.md):
//   "who did what" relationship search and fuzzy remembered-story search, on the device. Their
//   Apple NaturalLanguage parts build only on Apple platforms; the rest builds and tests on Linux.
// All build and test on Linux in CI as well as in Xcode. The SwiftUI screens are in
// App/ and build on a Mac (project.yml).
import PackageDescription

let package = Package(
    name: "PrayerTowerKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "PrayerTowerKit", targets: ["PrayerTowerKit"]),
        .library(name: "PrayerTowerSession", targets: ["PrayerTowerSession"]),
        .library(name: "PrayerTowerScripture", targets: ["PrayerTowerScripture"]),
    ],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.55.0"),
    ],
    targets: [
        .target(name: "PrayerTowerKit", resources: [.copy("Resources")]),
        .target(name: "PrayerTowerSession", dependencies: ["PrayerTowerKit", .product(name: "Auth", package: "supabase-swift")]),
        .target(name: "PrayerTowerScripture", resources: [.copy("Resources")]),
        .testTarget(name: "PrayerTowerKitTests", dependencies: ["PrayerTowerKit"], resources: [.copy("Fixtures")]),
        .testTarget(name: "PrayerTowerScriptureTests", dependencies: ["PrayerTowerScripture"]),
        .testTarget(name: "PrayerTowerSessionTests", dependencies: ["PrayerTowerSession"]),
    ]
)

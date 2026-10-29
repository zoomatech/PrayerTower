// swift-tools-version: 6.0
// The native iPhone app's shared code (docs/SWIFT_PORT.md):
// - PrayerTowerKit: the Prayer Tower API (models, requests, errors). Foundation only.
// - PrayerTowerSession: signing in with Supabase Auth (supabase-swift) and handing the
//   access token to the API, including the two-step code.
// Both build and test on Linux in CI as well as in Xcode. The SwiftUI screens are in
// App/ and build on a Mac (project.yml).
import PackageDescription

let package = Package(
    name: "PrayerTowerKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "PrayerTowerKit", targets: ["PrayerTowerKit"]),
        .library(name: "PrayerTowerSession", targets: ["PrayerTowerSession"]),
    ],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.55.0"),
    ],
    targets: [
        .target(name: "PrayerTowerKit", resources: [.copy("Resources")]),
        .target(name: "PrayerTowerSession", dependencies: ["PrayerTowerKit", .product(name: "Auth", package: "supabase-swift")]),
        .testTarget(name: "PrayerTowerKitTests", dependencies: ["PrayerTowerKit"]),
        .testTarget(name: "PrayerTowerSessionTests", dependencies: ["PrayerTowerSession"]),
    ]
)

# Native iPhone app (groundwork)

The future Prayer Tower iPhone app in Swift and SwiftUI. The pilot stays the Expo app in `apps/mobile`. The plan is in [docs/SWIFT_PORT.md](../../docs/SWIFT_PORT.md).

- `Sources/PrayerTowerKit` is the API: models, requests and errors. It uses Foundation only.
- `Sources/PrayerTowerSession` handles signing in with Supabase Auth ([supabase-swift](https://github.com/supabase/supabase-swift)), including the two-step code.
- `App/` holds the SwiftUI screens: sign in, the two-step code, the feed with one row of action icons (long press for names and meanings), the kind cloud, prayer circles, and fresh-start days on Me. Each follows its admin switch.
- `project.yml` is the Xcode project spec, for [XcodeGen](https://github.com/yonaskolb/XcodeGen).

## Tests (any machine with Docker)

    docker run --rm -v "$PWD":/src -w /src swift:6.4.1-noble swift test

To run against the local stack, start Supabase and the API, run `npm run seed:demo`, and set these variables:

    PT_SUPABASE_URL=http://127.0.0.1:54321 PT_SUPABASE_KEY=<publishable key> PT_API_URL=http://127.0.0.1:3000
    PT_EMAIL=ethel@demo.prayertower.local PT_PASSWORD=praying-demo-1

(Use `--network host` with Docker.)

## On a Mac

    brew install xcodegen
    cp Config.example.xcconfig Config.xcconfig   # fill in the URLs and publishable key
    xcodegen generate && open PrayerTowerNative.xcodeproj

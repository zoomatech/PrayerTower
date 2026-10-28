# "Pray now" home-screen widget (iOS)

A small or medium home-screen widget that shows the next request to pray for. Tapping it opens that request in the app.

## What it shows

- The feed's pinned request ("Pray for this first"), or else the first other prayer request in the feed.
- Never the member's own request, an answered one, or one marked sensitive or about a crisis, because others can see a home screen.
- The request's preview text and how many are praying, in the app's language.
- Signed out, or nothing to show: "Open Prayer Tower to see who needs prayer."

The app updates it each time the Prayers feed loads (`src/lib/pray-widget.ts`). Between app opens it keeps the last request.

## How it's built

- `expo-widgets` (Expo SDK 58), with the layout written in Expo UI SwiftUI components [1]. The layout is `apps/mobile/src/widgets/pray-now.tsx`; `widgetURL` sets the link it opens [2].
- `app.json` lists the widget under the `expo-widgets` plugin (`PrayNow`, small and medium). Prebuild adds a widget extension `com.zoomatech.prayertower.ExpoWidgetsTarget` and the app group `group.com.zoomatech.prayertower` (the staging build gets `.staging` versions) [1].
- Not available in Expo Go; it needs a development or store build [1]. On Android and the web the calls do nothing.

## Before the first store build

- EAS Build registers the extension's bundle ID and the app group when it signs the build. If you sign by hand, add both in the Apple Developer account first.
- Add the widget to a home screen on a test phone, open the app, and check that it shows a request and opens it when tapped.

## Sources

1. Expo, Widgets (SDK 58): https://docs.expo.dev/versions/v58.0.0/sdk/widgets/
2. Apple, widgetURL(_:): https://developer.apple.com/documentation/SwiftUI/View/widgetURL(_:)

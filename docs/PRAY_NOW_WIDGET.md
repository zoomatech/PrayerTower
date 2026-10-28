# "Pray now" home-screen widget (iOS and Android)

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

## Android

- It shows the same content, from the same code (`src/lib/pray-widget.ts`), in a 4×2 widget that can be resized. It follows the phone's light or dark theme. Tapping it opens the request through the `prayertower://` link.
- **Why a different library.** `expo-widgets` draws Android widgets in SDK 58, but it has no way to open the app or a link when the widget is tapped. Its Android buttons only send an event back to the widget, and the app sees that event only while it is running [1][3]. `react-native-android-widget` supports `clickAction="OPEN_URI"` on any part of the widget [4]. So Android uses it, and iOS keeps `expo-widgets`.
- **How it updates.**
  - Each time the feed loads, the app saves the widget's content on the phone and redraws any placed widgets (`requestWidgetUpdate`).
  - When Android asks the widget to draw itself (when it is added, resized, or after a reboot), a background task registered in `index.ts` draws it from that saved content, even when the app is closed (`registerWidgetTaskHandler`) [4].
- **Layout:** `src/widgets/pray-now-android.tsx`. **Config:** the `react-native-android-widget` entry in `app.json` (`PrayNow`, minimum 250×110 dp, 4×2 cells). Prebuild adds the `.widget.PrayNow` receiver to the Android manifest. The staging build gets its own package automatically.
- Not available in Expo Go, and it needs a development or store build. Check it on a test phone: long-press the home screen, choose **Widgets → Prayer Tower → Pray now**, open the app once, then tap the widget.

## Sources

1. Expo, Widgets (SDK 58): https://docs.expo.dev/versions/v58.0.0/sdk/widgets/
2. Apple, widgetURL(_:): https://developer.apple.com/documentation/SwiftUI/View/widgetURL(_:)
3. Expo source, expo-widgets Android interaction (SDK 58): https://github.com/expo/expo/tree/sdk-58/packages/expo-widgets
4. react-native-android-widget docs: https://saleksovski.github.io/react-native-android-widget/docs

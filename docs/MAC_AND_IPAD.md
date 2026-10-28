# Mac and iPad

The iOS app also runs on iPad and on Apple silicon Macs ("Designed for iPad"). There is no separate Mac app.

## Window sizes

- `ios.supportsTablet` is `true` in `apps/mobile/app.json`. Apple: "An app that you build to deploy only on iPhone always runs in a fixed-size window" on a Mac; supporting iPad multitasking gives resizable Mac windows [1].
- The window can't be made smaller than 375 × 600 points (`UIWindowScene.sizeRestrictions`, set by `modules/mac-menu`) [2].
- Layouts (`breakpoints` in `src/lib/theme.ts`). Most screens keep their content in a centered 640-point column (`maxContentWidth`).
  - From 768 points wide (any iPad held upright, or a wide Mac window), the Prayers feed adds a side column with "Most prayed this week" and "Top prayer warriors". Messages shows the list on the left and the open conversation on the right.
  - From 1280 points (iPad landscape, a large Mac window), feed cards sit two side by side in the column layout.
  - In iPad Split View or Slide Over (320 points and up), the phone layout is used.
  - Checked in `apps/e2e/tests/12-ipad.spec.ts`.
- Turning `supportsTablet` on means App Store Connect needs an iPad 13-inch screenshot [3]. The set is in the project files under `store-screenshots/ipad-13in-2064x2752`.

## Menu bar and keyboard shortcuts

On macOS 26 and iPadOS 26 or later, the app adds these to the menu bar (`UIMainMenuSystem`) [4][5]. On iPad, holding Command shows them. Titles follow the app language.

| Menu | Command | Shortcut |
| --- | --- | --- |
| File | New Prayer Request | ⌘N |
| Go | Prayers | ⌘1 |
| Go | My Promises | ⌘2 |
| Go | Messages | ⌘3 |
| Go | Notices | ⌘4 |
| Go | Me | ⌘5 |
| Go | Back | ⌘[ |
| Go | Notification Settings… | ⇧⌘, |
| Help | Prayer Tower Tour | |
| Help | Send Feedback… | |

The commands show only after sign-in and onboarding.

How it works: `modules/mac-menu` is a local Expo module [6]. JavaScript (`src/lib/menu-commands.ts`) sends the command list; the module builds the menus with `UIKeyCommand`s; choosing one sends `onCommand` back, and the app navigates with Expo Router. To add a command, add a line to `commands()` in `src/lib/menu-commands.ts` and its title to both locale files. Native changes need a new build.

On the web and older systems, the module is absent and nothing happens.

## Sources

1. Apple, Adapting iOS code to run in the macOS environment: https://developer.apple.com/documentation/apple-silicon/adapting-ios-code-to-run-in-the-macos-environment
2. Apple, UIWindowScene.sizeRestrictions: https://developer.apple.com/documentation/uikit/uiwindowscene/sizerestrictions
3. Apple, Screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
4. Apple, UIMainMenuSystem: https://developer.apple.com/documentation/uikit/uimainmenusystem
5. Apple, UIMenuBuilder: https://developer.apple.com/documentation/uikit/uimenubuilder
6. Expo, Create a local module (`create-expo-module --local`): https://docs.expo.dev/more/create-expo-module/

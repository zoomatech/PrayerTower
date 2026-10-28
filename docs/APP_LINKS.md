# Shared links that open the app

When a member shares a request or a comment, the message carries an https link such as `https://<site>/post/<id>` (or `...?comment=<id>`). With the app installed, iOS and Android open it straight in the app on that request, with the shared comment highlighted. Without the app, the link opens a small page on the site with an **Open in Prayer Tower** button and the store links. The page never shows the request itself, because reading it needs a signed-in member.

## How it fits together

| Part | Where |
|---|---|
| The link in the share text | `apps/mobile/src/lib/links.ts`, using `EXPO_PUBLIC_LINK_URL` (falls back to an https `EXPO_PUBLIC_API_URL`, then to `prayertower://`) |
| iOS Associated Domains and the Android verified intent filter | `apps/mobile/plugins/with-app-links.js`, from the host in `EXPO_PUBLIC_LINK_URL` |
| `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` | Served by the API's site module when `APPLE_TEAM_ID` / `ANDROID_CERT_SHA256` are set |
| The "get the app" page at `/post/:id` | The API's site module |
| Opening the request in the app | Expo Router maps `/post/<id>` to `src/app/post/[id].tsx`, which reads `comment` |

Only `/post/*` paths open the app, so the site's other pages (privacy, terms, support, account deletion) still open in the browser.

## Setting it up

1. **Choose the site address.** It is the API host that already serves the public site, for example `https://api.<your-domain>`. Set it in EAS for each environment:
   ```bash
   cd apps/mobile
   eas env:set --environment production --name EXPO_PUBLIC_LINK_URL --value https://api.<your-domain> --visibility plaintext
   eas env:set --environment preview --name EXPO_PUBLIC_LINK_URL --value https://staging-api.<your-domain> --visibility plaintext
   ```
2. **iOS.** Find the Team ID under Membership at developer.apple.com and set `APPLE_TEAM_ID` on the server. EAS Build turns on the Associated Domains capability for the bundle ID when it sees `associatedDomains` ([Expo: iOS universal links](https://docs.expo.dev/linking/ios-universal-links/)).
3. **Android.** Get the SHA-256 fingerprint of each signing key and set them, comma-separated, as `ANDROID_CERT_SHA256` on the server. Use `eas credentials -p android` for the upload key and Play Console > Test and release > App integrity > App signing for Google's key. A Play-installed app is signed with Google's key, so list both ([Expo: Android App Links](https://docs.expo.dev/linking/android-app-links/)).
4. **Build** the app again after setting `EXPO_PUBLIC_LINK_URL`, then restart the API after setting the server values.

`APP_LINK_APP_IDS` lists the bundle IDs and package names allowed to open the links. It defaults to the store app and the staging build.

## Checking it

- `curl -s https://<site>/.well-known/apple-app-site-association` and `curl -s https://<site>/.well-known/assetlinks.json` return JSON with `content-type: application/json`.
- Android: `adb shell pm get-app-links com.zoomatech.prayertower` shows the domain as `verified`.
- iOS downloads the association file when the app is installed or updated, through Apple's CDN, so a change to the paths reaches people only with an app update.

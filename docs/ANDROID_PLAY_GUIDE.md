# Getting Prayer Tower onto Google Play internal testing (Android)

> Written 2026-10-28 from the current Expo, Google Play and Android documentation, linked at each step. Like iOS, builds run in Expo's cloud, so **you don't need Android Studio**. Do [TESTFLIGHT_EAS_GUIDE.md](TESTFLIGHT_EAS_GUIDE.md) steps 1–4 first (code, `eas login`, `eas init`, server URLs). They are shared by both platforms.

## What's already set in the repo

| Setting | Where | Value |
|---|---|---|
| Package name | `apps/mobile/app.json` → `android.package` | `com.zoomatech.prayertower` (same as the iOS bundle ID). **It can never change after the first Play upload.** |
| Store build | `eas.json` → `build.production` | Android App Bundle (`.aab`), build number auto-incremented. Play only accepts `.aab`. ([Expo](https://docs.expo.dev/build-reference/apk/)) |
| Side-load build | `eas.json` → `build.preview` | `.apk` you can install directly on a phone, for a quick check before Play. ([Expo](https://docs.expo.dev/build-reference/apk/)) |
| Play track | `eas.json` → `submit.production.android` | `track: internal`, `releaseStatus: draft`: uploads land in internal testing and wait for you to roll them out. ([Expo](https://docs.expo.dev/submit/android/)) |
| Target API | Expo SDK 58 | targets Android API 36, compiles against 37 ([Expo](https://docs.expo.dev/versions/v58.0.0)). Play requires API 36 for new apps since 2026-08-31 ([Android](https://developer.android.com/google/play/requirements/target-sdk)). Nothing to do. |

## What you need first

- [ ] **A Google Play developer account** (one-time US$25) at https://play.google.com/console/signup.
- [ ] **The app created in Play Console:** Home → **Create app** → name "Prayer Tower", App, Free.
- [ ] **Developer verification.** Play Console Home shows whether your identity and the app's package name are registered. Google's developer verification starts 2026-09-30 and Play apps must be registered there. ([Android Developers Blog](https://android-developers.googleblog.com/2026/06/android-developer-verification.html))

## 1. Quick check on your own phone (optional, 15 min)

```bash
cd apps/mobile
eas build --platform android --profile preview
```

When it finishes, open the build page on the phone, download the `.apk`, and allow the install. Set the `preview` EAS environment values first (same commands as TestFlight step 4 with `--environment preview`).

## 2. Build for Play

```bash
eas build --platform android --profile production
```

Let EAS **generate a new upload keystore** when asked. EAS stores it; Google Play then holds the real app-signing key (Play App Signing). ([Expo](https://docs.expo.dev/tutorial/eas/android-production-build/))

## 3. Google service account key (one time, lets `eas submit` upload)

Follow Expo's walkthrough: https://expo.fyi/creating-google-service-account. In short: create a service account in Google Cloud, download its JSON key, then in Play Console → **Users and permissions** invite the service account email with release permissions for this app. Upload the key in **expo.dev → Credentials → Android → com.zoomatech.prayertower → Service credentials → Add a Google Service Account Key**. ([Expo](https://docs.expo.dev/submit/android/))

Keep the JSON out of git (`.gitignore` already blocks `*service-account*.json`).

## 4. Upload to internal testing

```bash
eas submit --platform android --profile production
```

Pick the build from step 2. It arrives on the **internal testing** track as a draft. EAS can create the first release itself; a manual first upload isn't required. ([Expo tutorial](https://docs.expo.dev/tutorial/eas/android-production-build/)) Next time, steps 2 and 4 are one command:

```bash
eas build --platform android --auto-submit
```

## 5. Add testers (Test and release → Testing → Internal testing)

1. **Testers** tab → **Create email list** → name it "Pilot", paste the pilot members' Google account emails, **Save changes**.
2. Tick the list, add a feedback email (`docs/store/STORE_LISTING.md`), copy the **shareable link**, **Save changes**.
3. **Releases** tab → open the draft release → **Review release** → **Start rollout to Internal testing**.
4. Send testers the link. Each tester opens it on their Android phone, taps **Accept**, then installs from Play. The link works only once the release is rolled out.

Internal testing allows up to **100 testers**, needs no Google review, and can start before the store listing is finished. ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/9845334))

## 6. App content forms (Policy and programs → App content)

Fill these in now; Play blocks any wider release until they're done.
- **Privacy policy URL:** the published `docs/legal/PRIVACY_POLICY_DRAFT.md`.
- **Data safety:** copy from `docs/store/APP_PRIVACY_ANSWERS.md` (Google Play section), including the account-deletion web link.
- **App access:** give a review sign-in (same account as TestFlight).
- **Ads:** No. **Content rating:** complete the questionnaire (user-generated content, users can interact). **Target audience:** 18+ for the pilot.

## 7. Android push notifications (needed for prayer notices)

Android push goes through Firebase Cloud Messaging. Without this, the app still works but won't get notifications (the app logs a warning and carries on).
1. In the [Firebase Console](https://console.firebase.google.com) create a project, add an Android app with package `com.zoomatech.prayertower`, and download **google-services.json** into `apps/mobile/`.
2. Add to `apps/mobile/app.json` under `android`: `"googleServicesFile": "./google-services.json"`. This file is safe to commit.
3. Firebase → Project settings → **Service accounts → Generate new private key**. Upload it with `eas credentials` → Android → production → Google Service Account → **Push Notifications (FCM V1)** → Upload. Don't commit it.
4. Build again (step 2).

([Expo: FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/))

## Going beyond internal testing later

New **personal** Play accounts (made after 2023-11-13) must run a **closed test with at least 12 testers opted in for 14 days in a row** before they can apply for production. Internal testing doesn't count toward this, but has no such gate. ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465)) An **organization** account (needs a D-U-N-S number) skips that rule. Open question for Steve: personal or organization account.

## If something goes wrong

| Problem | What to do |
|---|---|
| `eas submit` says it can't set up keys in non-interactive mode | Upload the service account key on expo.dev (step 3) and run it again. |
| Play says the package name already exists | Someone owns it. Package names are global; pick a new one in `app.json` before the first upload. |
| Testers' link says the app isn't available | Roll out the release (step 5.3), and make sure the tester's Play account email is on the list. |
| No push on Android | Step 7 not done, or `eas init` not done. If the Firebase API key is restricted, use the Play **App signing** SHA-1, not the upload key. ([Expo](https://docs.expo.dev/push-notifications/fcm-credentials/)) |
| Play warns about target API level | Upgrade the Expo SDK; SDK 58 targets 36. |

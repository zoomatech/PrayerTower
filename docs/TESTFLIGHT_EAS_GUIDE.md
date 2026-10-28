# Getting Prayer Tower onto TestFlight with EAS (Steve's Mac)

> Written 2026-10-28 from the current Expo and Apple documentation, which is linked at each step. The builds run in Expo's cloud, so **you don't need Xcode**, only Terminal. Plan about 1–2 hours the first time. Most of it is waiting for builds and for Apple.

## What you need first

- [ ] **A paid Apple Developer Program membership**, signed in as the Account Holder or an Admin. ([Expo: Submit to the Apple App Store](https://docs.expo.dev/submit/ios/))
- [ ] **A free Expo account** at https://expo.dev/signup.
- [ ] **The hosted backend running** (see [DEPLOY.md](DEPLOY.md)). You'll need its API URL, the Supabase project URL and the Supabase **publishable** key. Never use the secret key here.
- [ ] **The privacy policy and terms published** at public URLs. Drafts are in `docs/legal/`. External testers and App Review need them.
- [ ] **On the Mac:** Node.js 22 or newer (`node -v`) and git.

## 1. Get the code

```bash
git clone https://github.com/zoomatech/PrayerTower.git
cd PrayerTower
npm install
```

## 2. Install the EAS command-line tool and sign in

```bash
npm install --global eas-cli
eas login
```
([Expo: Submit to the Apple App Store](https://docs.expo.dev/submit/ios/))

## 3. Link the app to your Expo account (one time)

```bash
cd apps/mobile
eas init
```

This adds an EAS project ID to `app.json`. Push notifications need it: the app reads `extra.eas.projectId` before it asks for a push token. Commit that change:

```bash
git add app.json && git commit -m "Link the app to its EAS project" && git push
```

`apps/mobile/eas.json` is already in the repo. It does the following:
- Version numbers are kept on Expo's servers (`"appVersionSource": "remote"`).
- Every production build gets the next build number automatically (`"autoIncrement": true`). ([Expo: App versions](https://docs.expo.dev/build-reference/app-versions/))
- Each build profile reads its settings from an EAS environment (`"environment": "production"`). ([Expo: Environment variables](https://docs.expo.dev/eas/environment-variables/))

## 4. Tell the build where the server is

These values are compiled into the app, and **anyone who has the app can read them**. Use only public values; never use a secret key. ([Expo: Environment variables](https://docs.expo.dev/eas/environment-variables/)) Run these from `apps/mobile`, using your real URLs:

```bash
eas env:set --name EXPO_PUBLIC_API_URL --value https://api.YOURDOMAIN --environment production --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_URL --value https://YOURPROJECT.supabase.co --environment production --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_YOURKEY --environment production --visibility plaintext
eas env:set --name EXPO_PUBLIC_PRIVACY_URL --value https://YOURDOMAIN/privacy --environment production --visibility plaintext
eas env:set --name EXPO_PUBLIC_TERMS_URL --value https://YOURDOMAIN/terms --environment production --visibility plaintext
eas env:set --name EXPO_PUBLIC_SUPPORT_EMAIL --value help@YOURDOMAIN --environment production --visibility plaintext
```

## 5. Build the iOS app in the cloud

```bash
eas build --platform ios --profile production
```

Answer the prompts as follows:
- **Log in to your Apple account:** Yes. Use the Apple ID on the developer team.
- **Bundle identifier:** `com.zoomatech.prayertower` is already set in `app.json`. Let EAS register it.
- **Distribution certificate and provisioning profile:** let EAS generate and manage them. You can review them later with `eas credentials`. ([Expo: iOS production build](https://docs.expo.dev/tutorial/eas/ios-production-build/))
- **Push notifications key:** say Yes if asked, so prayer and message notifications work.
- **Encryption question** (first iOS build): the app only uses the standard HTTPS encryption built into iOS. That is the "exempt" case. ([ASO.dev: App encryption information](https://aso.dev/app-store-connect/app-encryption-information-info-plist/)) Answer accordingly, and ask if you're unsure.

The build takes roughly 10–30 minutes. Its page on expo.dev shows progress and the build number, for example `1.0.0 (2)`.

## 6. Send the build to TestFlight

```bash
eas submit --platform ios
```

Pick the build you just made, sign in to Apple, and let EAS create the App Store Connect app record and the App Store Connect API key the first time. Apple then processes the build, usually in 5–15 minutes, and emails you when it's done. ([Expo: TestFlight](https://docs.expo.dev/submit/testflight/))

**Next time, steps 5 and 6 are one command:**

```bash
eas build --platform ios --auto-submit
```

This still doesn't send the app to App Store review. It stops at TestFlight. ([Expo: iOS production build](https://docs.expo.dev/tutorial/eas/ios-production-build/))

## 7. Invite testers (App Store Connect → your app → TestFlight)

**A. Internal testers** are people on your App Store Connect team. There's no review, and you can have up to 100.
1. Click **+** next to **Internal Testing**, name the group (for example "Staff"), and click **Create**.
2. Click **+** next to **Testers**, pick team members, and click **Add**. They get an email.

**B. External testers** are the 10 pilot members, who don't need to be on your team. You can have up to 10,000. **The first build of each version needs Beta App Review.**
1. Create the internal group first. Apple requires one before you can make an external group.
2. Click **+** next to **External Testing**, name the group "Pilot", and click **Create**.
3. Click **Add Builds** and choose the build.
4. Fill in **Beta App Description** and **Feedback Email**. Copy them from `docs/store/STORE_LISTING.md`.
5. Turn on **Sign-in Information** and enter a review account, made by hand on the hosted project.
6. Enter **What to Test**, then click **Submit for Review**.
7. After approval, invite the pilot members by email or with a **public link**.

([Expo: TestFlight](https://docs.expo.dev/submit/testflight/), [Apple: TestFlight](https://developer.apple.com/testflight/))

Testers install the **TestFlight** app from the App Store, accept the invitation, and tap **Install**. Builds expire after 90 days, so plan new builds before then. ([Expo: TestFlight](https://docs.expo.dev/submit/testflight/))

## 8. Before inviting the pilot

- [ ] Sign in on your own phone, then post, pray, message, report, and delete a throwaway account.
- [ ] Check that a push notification arrives, for example when someone prays for your request.
- [ ] Work through [PILOT_LAUNCH_CHECKLIST.md](PILOT_LAUNCH_CHECKLIST.md).

## 9. Shipping an update

```bash
git pull
cd apps/mobile
eas build --platform ios --auto-submit
```

The build number goes up by itself. In TestFlight, add the new build to the **Pilot** group. Later builds of the same version usually skip Beta App Review, but the first build of a new version (for example 1.1.0) goes through it again. To change the version, edit `"version"` in `app.json`.

## 10. Android (optional, if any pilot members use Android)

1. You need a Google Play Developer account and the app created in Play Console.
2. Run `eas build --platform android --profile production`.
3. Run `eas submit --platform android`. EAS needs a Google service account key, which you can set up with `eas credentials --platform android`. The first release goes to the **internal testing** track. `eas.json` sets it to upload as a **draft**. ([Expo: Submit to Google Play](https://docs.expo.dev/submit/android/))
4. Fill in **App content → Data safety** using `docs/store/APP_PRIVACY_ANSWERS.md`.

## If something goes wrong

| Problem | What to do |
|---|---|
| `eas` asks to log in to Apple again | Normal after a while. Sign in again. Two-factor codes go to your Apple devices. |
| Build fails at "Install dependencies" | Make sure `npm install` works at the repo root and that `package-lock.json` is committed. Then run the build again. |
| The app opens but can't sign in | Step 4 values are wrong or missing. Fix them with `eas env:set`, then build again. These values are fixed at build time. |
| No push notifications | Run `eas init` (step 3), allow notifications on the phone, and check the push key under `eas credentials`. |
| The TestFlight build is "Missing Compliance" | Answer the export-compliance question in App Store Connect, as in step 5. |
| External testing is greyed out | Create an internal group first, and complete the test information in step 7B. |

# Android push notifications (Firebase Cloud Messaging)

Android phones get push notifications through Firebase Cloud Messaging (FCM). The Expo push service the server already uses forwards each notice to FCM, so no server code changes. Android push is **off until Firebase's `google-services.json` exists**. Until then the Android app works, but it gets no push token, and members see notices only in the app.

iOS push doesn't need any of this; it uses the APNs key that EAS sets up (TESTFLIGHT_EAS_GUIDE.md).

## How the switch works

`apps/mobile/app.config.js` sets `android.googleServicesFile` only when one of these exists:

1. the environment variable `GOOGLE_SERVICES_JSON` (an EAS file environment variable; EAS writes the file on the build server and puts its path in the variable), or
2. the file `apps/mobile/google-services.json`.

With neither, the setting is left out and the build has no Firebase, which is today's state. Both ways follow Expo's docs ([FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/), [EAS environment variables FAQ](https://docs.expo.dev/eas/environment-variables/faq/)).

## Setup (Steve, once, about 15 minutes)

1. **Firebase project.** In the [Firebase Console](https://console.firebase.google.com), create a project (for example "Prayer Tower"). Add an **Android app** with package `com.zoomatech.prayertower`. Optionally add a second one, `com.zoomatech.prayertower.staging`, for staging builds.
2. **google-services.json.** Download it and put it in `apps/mobile/`. Expo notes the file holds only public identifiers, so it is safe to commit. To keep it out of git anyway, upload it on expo.dev instead: Project → **Environment variables** → add `GOOGLE_SERVICES_JSON`, choose the **file** type and secret visibility, and upload the file ([Expo: Manage environment variables](https://docs.expo.dev/eas/environment-variables/manage/)).
3. **Service account key (FCM V1).** In Firebase, go to Project settings → **Service accounts** → **Generate new private key**. Upload it with `eas credentials` → Android → production → Google Service Account → **Push Notifications (FCM V1)** → Upload a new service account key. Or upload it at expo.dev → Project settings → Credentials. **Never commit this key.** `.gitignore` already blocks `*service-account*.json`.
4. **Build again:** `eas build -p android --profile production` (ANDROID_PLAY_GUIDE.md).
5. **Test it.** Install the build on an Android phone, sign in and allow notifications. Then, from the repo:
   ```
   npm run push-test -w @prayer-tower/server -- you@example.com android
   ```
   The script checks `google-services.json`, sends one test notice, and reads Expo's receipts.

## What the push test reports

| Result | Meaning and fix |
|---|---|
| `delivered to FCM/APNs` | It works. The notice should be on the phone. |
| `InvalidCredentials` | The FCM V1 key is missing or wrong in EAS. Redo step 3. |
| `MismatchSenderId` | `google-services.json` and the uploaded key come from different Firebase projects. |
| `DeviceNotRegistered` | The app was uninstalled, or the token is old. Open the app on the phone again. |
| `no android push tokens` | The phone never registered. Check that the build includes `google-services.json`, and that notifications are allowed. If the Firebase API key is restricted, allow the FCM Registration API and the Firebase Installations API, and use the Play **App signing** SHA-1 ([Expo](https://docs.expo.dev/push-notifications/fcm-credentials/)). |

The receipt codes come from [Expo: Sending notifications](https://docs.expo.dev/push-notifications/sending-notifications/). You can also pass a single `ExponentPushToken[…]` instead of an email. Set `EXPO_ACCESS_TOKEN` if push security is on in your Expo account.

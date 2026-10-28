# Releasing the iPhone app from GitHub: builds and over-the-air updates

Set up 2026-10-28. The pilot is iPhone only, so the pipeline builds iOS only. Everything is in place except your accounts: until you add the two settings below, the Release workflow stops early with a note and doesn't fail.

## What it does

| You do | GitHub Actions does |
|---|---|
| `npm run release -- patch`, commit, then `git tag -a v1.0.1 -m "Prayer Tower 1.0.1"` and `git push origin v1.0.1` ([RELEASING.md](RELEASING.md)) | Builds the iOS app on EAS and sends it to TestFlight |
| Actions → **Release** → Run workflow → **build** | The same, without a tag |
| Actions → **Release** → Run workflow → **update**, pick a channel | Publishes an over-the-air update to phones that already have a build |

- **The build** runs on Expo's servers: `eas build --platform ios --profile production --non-interactive --no-wait --auto-submit`. The GitHub job ends as soon as the build is queued, and "you aren't billed for CI time while EAS performs the build" ([Expo: Build on CI](https://docs.expo.dev/build/building-on-ci/)). When the build finishes, `--auto-submit` sends it to TestFlight. Sending it on to App Store review is still a manual step in App Store Connect ([Expo: Automate submissions](https://docs.expo.dev/build/automate-submissions/)).
- **Build numbers** are set by EAS (`autoIncrement`). You set the version with `npm run release`.
- **An over-the-air update** changes only the JavaScript and images: screens, text and fixes in app code. Phones download it in the background and use it the next time the app is opened, which can take up to two restarts ([Expo: EAS Update](https://docs.expo.dev/eas-update/getting-started/)). It runs `eas update --channel <channel> --environment <environment> --platform ios`.

## Which builds get which update

| Build profile (`eas.json`) | Update channel | EAS environment |
|---|---|---|
| `production` (TestFlight and the App Store) | `production` | production |
| `staging` | `staging` | preview |
| `preview` | `preview` | preview |

The app uses the `fingerprint` runtime version. Each build gets a fingerprint of its native code, and an update only reaches builds with the same fingerprint. That policy "will increment the runtime version whenever anything that may impact the native runtime changes" ([Expo: Runtime versions](https://docs.expo.dev/eas-update/runtime-versions/)). If an update changes native code (a new native library, `app.json` permissions, the widget), no existing build gets it, so build again instead.

## Steve: one-time setup (about 20 minutes, on your Mac)

1. **Make the first build by hand.** CI can't answer questions, so follow [TESTFLIGHT_EAS_GUIDE.md](TESTFLIGHT_EAS_GUIDE.md) steps 2 to 6 once: `eas login`, `eas init`, `eas build --platform ios --profile production`, `eas submit --platform ios`. That run creates the project ID and the Apple signing credentials that later CI builds reuse ([Expo: Build on CI](https://docs.expo.dev/build/building-on-ci/)).
2. **Save the project ID.** `eas init` prints it. Put it in `apps/mobile/app.json` under `"extra": { "eas": { "projectId": "…" } }` and commit. Over-the-air updates stay off until it's there.
3. **Let EAS submit to App Store Connect without you.** Run `eas credentials --platform ios` and set up an App Store Connect API key for EAS Submit. In non-interactive mode, "if no key exists it fails" ([Expo: Submit to the Apple App Store](https://docs.expo.dev/submit/ios/)).
4. **Expo token.** Create a token at [expo.dev → Access tokens](https://expo.dev/settings/access-tokens). Add it in GitHub → the repository → Settings → Secrets and variables → Actions → **Secrets** as `EXPO_TOKEN`.
5. **App Store Connect app ID.** In App Store Connect, open the app → App Information → General Information. Copy the **Apple ID** (a number) ([Expo: Submit to the Apple App Store](https://docs.expo.dev/submit/ios/)). Add it on the same GitHub page under **Variables** as `ASC_APP_ID`. Without it, builds still run but aren't sent to TestFlight.

## Checks on every pull request

The CI `native` job runs `expo prebuild` with a placeholder project ID and checks three things:

- the iOS app gets the update URL,
- it uses the fingerprint runtime version,
- the production build is on the `production` channel.

Without a project ID, the app is built with updates turned off (`EXUpdatesEnabled` false), so it never checks for updates.

## If something goes wrong

| Problem | Fix |
|---|---|
| The run says "EXPO_TOKEN isn't set" | Step 4 above. |
| "Credentials are not set up" or a signing error | Run step 1 on your Mac once more (`eas build --platform ios`), then re-run the workflow. |
| The build isn't in TestFlight | Check `ASC_APP_ID` (step 5) and the API key (step 3). The submission link is on the build's page at expo.dev. |
| An update doesn't arrive | Check that the phone's build is on the same channel and fingerprint (expo.dev → Updates), then force-close and reopen the app twice. |
| A bad update went out | Revert the change on main, then publish an update again. Phones pick up the fixed one on their next restarts. |

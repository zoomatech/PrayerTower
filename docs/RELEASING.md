# Releasing

The changelog and release notes are generated from the pull requests merged into main, using git history only (no token needed). Each PR title becomes one line, so write PR titles for people.

## Commands

- `npm run changelog` rewrites `CHANGELOG.md`. PRs merged since the last `v*` tag are listed under **Unreleased**.
- `npm run release -- patch` (or `minor`, `major`, or an exact version such as `1.2.0`) does four things:
  1. Sets the user-facing version in `apps/mobile/app.json` (`expo.version`) and in every workspace `package.json`.
  2. Moves the unreleased PRs under that version in `CHANGELOG.md`.
  3. Writes `docs/release-notes/v<version>.md`. This file has the PR list, a draft of the App Store text and a draft of the Google Play text, each cut to the store's limit.
  4. Prints the next steps: run `npm install` so `package-lock.json` matches, commit, then `git tag -a v<version> -m "Prayer Tower <version>"` and `git push origin v<version>`.

## Build numbers

Build numbers are left alone. `eas.json` uses `"appVersionSource": "remote"` and `autoIncrement`, so EAS sets `ios.buildNumber` and `android.versionCode`. The user-facing `version` "should be explicitly set and updated by you" ([Expo: App version management](https://docs.expo.dev/build-reference/app-versions/)), and that is what `npm run release` does.

## Store text limits

| Store | Field | Limit |
|---|---|---|
| App Store Connect | What's New in This Version | 4,000 characters ([Apple: Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)) |
| Google Play | Release notes | 500 Unicode characters per language, wrapped in language tags such as `<en-US>…</en-US>` ([Play Console Help: Prepare and roll out a release](https://support.google.com/googleplay/android-developer/answer/9859348?hl=en)) |

The drafts are lists of PR titles. Before you paste them into the stores, rewrite them in plain language for members and add the Spanish text.

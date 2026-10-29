# Keeping the app free of ads and trackers

Prayer Tower and Open Circle promise no ads, no ad tracking and no selling of attention ([AD_FREE_PROMISE.md](AD_FREE_PROMISE.md)). The project notes ask for an "architecture to make enshittifying features harder to implement" (Research Questions). This page lists the parts that already hold that line, and the automatic check that stops a change from quietly breaking it.

## The automatic check

`apps/server/test/no-enshittification.test.ts` runs with every pull request. It fails when a change:

| Check                       | What fails it                                                                                                                                                                                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No ad or analytics packages | Any installed package, direct or pulled in by another, that is an ad network, ad attribution or install tracking (AdMob, Facebook SDK, AppsFlyer, Adjust, Branch, Kochava), or an analytics or session-replay service (Segment, Mixpanel, Amplitude, PostHog, Firebase Analytics, Hotjar, FullStory and others) |
| Workbox stays quiet         | `offlineGoogleAnalytics` turned on in the web app's service worker (workbox-build installs the module; it does nothing unless turned on)                                                                                                                                                                        |
| Apple's tracking answers    | `NSPrivacyTracking` not false, any tracking domain, a tracking-permission prompt (`NSUserTrackingUsageDescription`, expo-tracking-transparency), or the Android advertising-ID permission                                                                                                                       |
| No outside scripts          | A `<script src="https://…">` in a page the server serves or in the app's web page. A script from another site can follow readers                                                                                                                                                                                |
| No ad data                  | A database table or column for ads, sponsored or promoted posts, advertising IDs (IDFA, GAID) or tracking. The ad fines tables are allowed, because they exist to fine people who post ads                                                                                                                      |

To loosen any of these, a person has to edit the test, and that edit shows in the pull request.

## What else holds the line

- **Radio prayers aren't sold.** Donated Priestly tokens go into a shared fund. With radio prayers free, the station can send them by need ([RADIO_STATION.md](RADIO_STATION.md)).
- **No engagement-ranked feed.** The feed shows the newest posts first. Nothing ranks it by watch time or outrage.
- **Kind defaults.** There are no streaks that can be lost. Rhythms include rest days, and reminders can be snoozed.
- **Ads are against the rules.** A post that uses a prayer request as an ad can be fined ([AD_FINES.md](AD_FINES.md)).
- **People leave with their data.** A member can export everything and delete their account (Me → Download my data).
- **Errors stay on our server.** Crash reports go to our own error log, or to Sentry only when `SENTRY_DSN` is set, with personal data collection off ([PILOT_TOOLS.md](PILOT_TOOLS.md)).

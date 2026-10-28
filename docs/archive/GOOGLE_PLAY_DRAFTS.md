# Google Play drafts (archived)

Archived 2026-10-28. The pilot is iPhone only, so these Google Play sections were moved out of the current docs. Keep them for a later Android release.

---

From `docs/store/STORE_LISTING.md`:

### Google Play

**App name** (27/30). Google bans promotional words such as "Free" or "No Ads" in titles.
```
Prayer Tower: Pray Together
```

**Short description** (64/80)
```
Ask for prayer, pray for others, and keep your promises to pray.
```

**Full description.** Same as the App Store description, minus the "NO ADS" heading, because Google bans promotional claims in descriptions:
```
Prayer Tower is a quiet, caring place to ask for prayer and to pray for others.

ASK FOR PRAYER
Share what's on your heart in a few words: an illness, a job, a family need, a praise. Post with your name or anonymously. You'll see when people are praying for you, and you can thank them.

PRAY FOR OTHERS
Read real requests from real people and tap "Praying Now" when you pray. Promise to keep praying daily or weekly, and Prayer Tower will gently remind you. Write a private note to say you prayed.

PRAY TOGETHER
Join prayer groups, message the people you pray with, and find prayer meetings and meet-ups, in person or by video. Ask for a prayer partner or a pastor when you'd rather not carry something alone.

A SAFE COMMUNITY
Clear community rules, reporting and blocking, and real moderators. If someone is in crisis, Prayer Tower shows help right away, including the 988 Suicide & Crisis Lifeline. You can delete your account at any time from inside the app.

Prayer Tower is in a small pilot. Features may change as we learn together. Prayer Tower is not an emergency service. If you are in danger, call 911 or 988.
```

**Category:** Lifestyle. **Tags:** Faith, Community. Choose them in the Play Console tag picker.
**Contact email:** [SUPPORT EMAIL] (required) · **Website:** `https://<API host>/` · **Privacy policy:** `https://<API host>/privacy`

---

From `docs/store/WHATS_NEW.md`:

### Google Play release notes (v1.0)

Google Play allows release notes on the first release, up to 500 characters per language, according to [this guide](https://deku.posstree.com/en/share/google-play/release-notes-character-limit/), which links Google's Play Console help. Check the limit in Play Console when you paste.

**en-US** (377/500)

```
<en-US>
Welcome to Prayer Tower 1.0.
• Ask for prayer, and see when real people are praying for you right now.
• Tap Praying Now when you pray, or promise to keep praying with reminders.
• Send private notes of encouragement, join prayer groups and events.
• Ask a prayer partner or pastor to pray with you.
• Earn tokens by praying and give them to requests.
• In English and Spanish.
</en-US>
```

**es-419** (392/500). Words match the app's Spanish ("Orando ahora", "fichas").

```
<es-419>
Bienvenido a Prayer Tower 1.0.
• Pide oración y mira cuándo personas reales oran por ti en este momento.
• Toca «Orando ahora» cuando ores, o promete seguir orando con recordatorios.
• Envía notas privadas de ánimo y únete a grupos y eventos de oración.
• Pide a un compañero de oración o a un pastor que ore contigo.
• Gana fichas al orar y regálalas a las peticiones.
• En inglés y español.
</es-419>
```

Neither version makes ranking, price or promotional claims, which Google bans in store text ([Google Play](https://support.google.com/googleplay/android-developer/answer/13393723?hl=en)).

---

From `docs/store/APP_PRIVACY_ANSWERS.md`:

### Google Play: Data safety (Play Console → App content → Data safety)

Definitions: "Collect" means transmitting data off the device. "Sharing" means transferring data to a third party. Transfers to **service providers** acting on your instructions, and **user-initiated** transfers, are not sharing. ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/10787469))

### Overview questions

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes.** HTTPS/TLS to the API and Supabase. |
| Which ways can users request that their data is deleted? | **In-app:** Me → Delete my account. **Web link:** `https://<your API host>/account-deletion`. Google requires a web resource where people can request deletion without reinstalling the app. ([Play: account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)) The API server hosts this page. People can sign in there and delete their account at once (this needs `SUPABASE_PUBLISHABLE_KEY` on the server), or leave a request that admins handle under Admin → Account deletion requests after confirming by email. Set `SUPPORT_EMAIL` so the page shows a contact address. |
| Account creation | "My app allows users to create an account" → username/email and password |

### Data types (all **Collected**, **Not shared**, processing **not ephemeral**, collection **required** unless noted)

| Play category → type | Purposes | Optional? |
|---|---|---|
| Personal info → **Name** | App functionality, Account management | Required |
| Personal info → **Email address** | App functionality, Account management | Required |
| Personal info → **User IDs** | App functionality, Account management | Required |
| Personal info → **Political or religious beliefs** | App functionality | Required (implied by using the app) |
| Health and fitness → **Health info** | App functionality | **Optional** (only if the member writes it) |
| Messages → **Other in-app messages** | App functionality | Optional |
| Photos and videos → **Photos**, **Videos** | App functionality | Optional |
| App activity → **App interactions** | App functionality, Analytics, Personalization | Required |
| App activity → **Other user-generated content** | App functionality | Required to post |
| App activity → **Other actions** (reports, blocks, follows) | App functionality, Fraud prevention, security and compliance | Optional |
| Device or other IDs → **Device or other IDs** | App functionality (push token) | Optional (notifications) |
| App info and performance → **Crash logs** (only if `EXPO_PUBLIC_SENTRY_DSN` is set) | Analytics ("stack traces, or other information directly related to a crash") | Required |

**Shared:** **None.** These count as service providers: Supabase, the API host, OpenAI moderation, and the Expo, APNs and FCM push services. Content that other members see inside the app isn't "sharing" to a third party.

**Ask counsel:** the amateur-radio broadcast of request text is public, and the member who spends the token starts it, not the poster. Decide whether to declare "Other user-generated content: Shared", or to require the poster's own opt-in before a request can go on the radio.

**Privacy policy URL:** same as Apple.

---

---

From `docs/PRAY_NOW_WIDGET.md`:

### Android

- It shows the same content, from the same code (`src/lib/pray-widget.ts`), in a 4×2 widget that can be resized. It follows the phone's light or dark theme. Tapping it opens the request through the `prayertower://` link.
- **Why a different library.** `expo-widgets` draws Android widgets in SDK 58, but it has no way to open the app or a link when the widget is tapped. Its Android buttons only send an event back to the widget, and the app sees that event only while it is running [1][3]. `react-native-android-widget` supports `clickAction="OPEN_URI"` on any part of the widget [4]. So Android uses it, and iOS keeps `expo-widgets`.
- **How it updates.**
  - Each time the feed loads, the app saves the widget's content on the phone and redraws any placed widgets (`requestWidgetUpdate`).
  - When Android asks the widget to draw itself (when it is added, resized, or after a reboot), a background task registered in `index.ts` draws it from that saved content, even when the app is closed (`registerWidgetTaskHandler`) [4].
- **Layout:** `src/widgets/pray-now-android.tsx`. **Config:** the `react-native-android-widget` entry in `app.json` (`PrayNow`, minimum 250×110 dp, 4×2 cells). Prebuild adds the `.widget.PrayNow` receiver to the Android manifest. The staging build gets its own package automatically.
- Not available in Expo Go, and it needs a development or store build. Check it on a test phone: long-press the home screen, choose **Widgets → Prayer Tower → Pray now**, open the app once, then tap the widget.

---

From `docs/TESTFLIGHT_EAS_GUIDE.md`:

### 10. Android

See [ANDROID_PLAY_GUIDE.md](ANDROID_PLAY_GUIDE.md) for the full Google Play internal testing setup.

### Play Console → App content → App access (moved from store/REVIEW_NOTES.md)

Choose **All or some functionality is restricted**, then add one set of instructions. Google asks for login details that are reusable, don't expire, are in English, and work from any location ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/15748846)).

- **Name:** Review account
- **Username:** [REVIEW EMAIL]
- **Password:** [REVIEW PASSWORD]
- **Any other information:**
  ```
  Email and password sign-in, no one-time codes. The account is ready to use. Staff accounts have posted sample requests, and one staff member has sent you a message.
  Pray: "Praying Now" on any request. Report: open a request, tap "Report this request". Block: open a profile, tap "Block". Delete account: Me > Delete my account (type DELETE), or on the web at [API HOST]/account-deletion.
  Tokens are earned by praying, can't be bought or cashed out, and have no money value. "Send as a radio prayer" is in test mode during review (logged, not transmitted).
  New members can message and post links after praying for 5 other requests (anti-spam).
  ```

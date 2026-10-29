# Cross-posting from Facebook and Threads

A member posts on Facebook or Threads, and the same post (words, photos and videos) appears on **their own** Prayer Tower or Open Circle account automatically. Nobody else's posts are ever copied. Steve asked for this on 2026-10-28.

**Off by default.** Turn it on in Admin → Notebook ideas → Cross-posting from Facebook and Threads. Admin → Communities can hide it for one community. It works the same in Prayer Tower and Open Circle. While it is off, members see nothing, extension posts are refused, and connected accounts are not checked.

Members set it up in the app: **Me → Copy my Facebook posts**.

## Three ways in

| Way | Covers | Needs |
| --- | --- | --- |
| Browser extension | Posts made on facebook.com or threads.com in Chrome, or in Safari on a Mac, iPhone or iPad | Nothing from Meta. Works now. |
| Connect Threads | Every new Threads post, from any device, including the Threads app | A Meta app with the Threads use case (see below) |
| Connect Facebook | Every new Facebook post, from any device, including the Facebook app | A Meta app with Facebook Login and `user_posts`, which Meta must approve in App Review |

The extension and a connected account can both see the same post, and the Threads webhook and the 5-minute check can arrive together. The server copies it once. Imports for one member run one at a time (a database lock), and the server skips any post whose id was already seen or whose text matches one copied in the last three days.

Every copy is an ordinary post. It goes through the same posting checks (new-member limits, flood limit) and the moderation scan as a post written in the app, and its card says "From Facebook" or "From Threads". The member picks what kind of post copies become (for example Discussion, Testimony or Praise). By default it is Discussion where the community has it, otherwise Testimony. A member can pause cross-posting at any time. Posts made while paused are not copied later.

## 1. The browser extension (`apps/extension`)

The extension acts the moment the member clicks **Post** (or presses Ctrl/Cmd+Enter) in the Facebook or Threads composer. At that instant it reads the words and the attached photos and videos, then sends them to the member's account. These are the original files the member chose, or the composer's previews when the files can't be read. A photo over 9 MB is shrunk to a JPEG first. A video over 40 MB is left out, because browser extension messages are capped at 64 MB. It never changes the page or delays Facebook's own posting. If the server can't be reached, the post waits and is retried every minute for 24 hours.

It finds the composer by roles and labels (`role="textbox"`, a button labelled Post), not by class names, because Facebook changes those often. If Facebook changes the composer and copies stop, update `src/capture.js` and its tests (`test/capture.test.mjs`).

**Member setup:**
1. In the app: Me → Copy my Facebook posts → **Make my extension key**. The key is shown once.
2. Install the extension (Chrome Web Store link once it is published; until then, see "Loading it by hand" below).
3. The extension's settings open on install. Paste the server address shown in the app and the key, then click **Save**. Chrome asks once to let the extension reach the server. The extension then checks the key with the server (`GET /crosspost/extension/check`) and says whether it was accepted and whether cross-posting is on and not paused.

**Loading it by hand (testing):** open `chrome://extensions`, turn on Developer mode, click **Load unpacked**, and choose the `apps/extension` folder.

**Two editions:** `npm run build -w @prayer-tower/extension -- opencircle` (or `prayertower`, the default) writes `apps/extension/dist/<edition>/`, with that edition's name and icon. The Open Circle edition never says "Prayer Tower" and has no religious wording.

**Chrome Web Store:** zip the contents of `apps/extension/dist/<edition>` (manifest.json at the top level of the zip) and upload it in the Chrome Web Store Developer Dashboard. The store asks for a privacy declaration: the extension reads the member's own post only when they click Post on Facebook or Threads, and sends it only to the server they entered.

**Safari (Mac, and Safari on iPhone and iPad):** on a Mac with Xcode, run `apps/extension/scripts/safari.sh` (or `apps/extension/scripts/safari.sh opencircle`). The script builds the edition and runs Apple's `xcrun safari-web-extension-packager` with the bundle ID `com.zoomatech.prayertower.crosspost` (or `com.zoomatech.opencircle.crosspost`). It writes an Xcode project to `build/safari/<edition>/`: a small native Swift app that installs the extension in Safari on iPhone, iPad and Mac. Open the project, pick the team under Signing, and run it on a phone or upload it to App Store Connect. ([Apple: Packaging a web extension for Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)). The member then turns it on in Safari's settings.

### What works on iPhone

- **The Facebook and Threads apps:** no extension or plugin can run inside another company's app on iPhone. Posts made in those apps are copied through **Connect Threads** or **Connect Facebook**. These check for new posts every 5 minutes, and Threads also has an instant webhook.
- **Safari on iPhone:** the same extension, packaged for iOS as above, copies posts made at facebook.com or threads.com in Safari. Safari web extensions on iOS run content scripts the same way ([WWDC21: Meet Safari Web Extensions on iOS](https://developer.apple.com/wwdc21/10104/)).

## 2. Connect Threads

Uses the official Threads API with the `threads_basic` permission only.

- Sign-in: `threads.com/oauth/authorize`. The code is swapped for a long-lived token, which lasts 60 days and is refreshed automatically before it ends ([Threads: access tokens](https://developers.facebook.com/documentation/threads/get-started/get-access-tokens-and-permissions), [long-lived tokens](https://developers.facebook.com/documentation/threads/get-started/long-lived-tokens)).
- New posts: every 5 minutes the worker reads `GET /me/threads` ([retrieve posts](https://developers.facebook.com/documentation/threads/retrieve-and-discover-posts/retrieve-posts)). Replies and reposts are skipped. With the webhook set up, a post also arrives within seconds through the `publish` field ([Threads webhooks](https://developers.facebook.com/documentation/threads/webhooks)).

**Setup (Meta App Dashboard):**
1. Create an app with the **Access the Threads API** use case.
2. Valid OAuth redirect URI: `https://<server>/crosspost/threads/callback`.
3. Set `THREADS_APP_ID` and `THREADS_APP_SECRET` (the Threads app ID and secret), `CROSSPOST_PUBLIC_URL=https://<server>`, and `CROSSPOST_TOKEN_KEY` (any random text, 32+ characters; it encrypts stored tokens).
4. Optional webhook: callback URL `https://<server>/crosspost/threads/webhook`, Verify Token = `THREADS_WEBHOOK_VERIFY_TOKEN`, subscribe to **publish**. Meta signs each delivery (`X-Hub-Signature-256`, checked with the app secret).
5. Until the app passes App Review, only people added as Threads testers on the app can connect. Meta says webhooks need the app in Live mode with Advanced Access.

## 3. Connect Facebook

Uses Facebook Login with the `user_posts` permission and `GET /me/posts` ([User posts](https://developers.facebook.com/docs/graph-api/reference/user/posts/)). Facebook has no webhook for a person's own posts, so the worker checks every 5 minutes. Posts that other people made on the member's timeline are skipped. Facebook's long-lived user token lasts about 60 days and can't be refreshed by a server. A week before it ends, the member gets a notice ("Reconnect Facebook this week"). When it ends, or when Meta stops accepting any connection, the member gets a "Reconnect" notice that opens this screen, and the app shows **Reconnect** ([long-lived tokens](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived)).

**Setup:**
1. Create an app with the **Authenticate and request data from users with Facebook Login** use case and add `user_posts`.
2. Valid OAuth redirect URI: `https://<server>/crosspost/facebook/callback`.
3. Set `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `CROSSPOST_PUBLIC_URL` and `CROSSPOST_TOKEN_KEY`. `FACEBOOK_GRAPH_VERSION` defaults to `v26.0`.
4. `user_posts` "require[s] App Review before you can publish your app and go live" ([Meta](https://developers.facebook.com/docs/development/create-an-app/facebook-login-use-case)). Until then, only people with a role on the app (admins, developers, testers) can connect.

## Notes for the business and legal side

These are recorded for the departments that handle them. They are not reasons the feature was left out.

- Threads API terms: an app may display Threads posts "solely to the person who created it" ([Threads overview](https://developers.facebook.com/documentation/threads/overview)). Copied posts are shown to the member's community.
- Facebook `user_posts` needs App Review (above).
- Meta's Terms prohibit collecting data from its products "using automated means" without permission, even while logged in. The extension acts only on the member's own post, at the moment they publish it ([summary of the term](https://conductatlas.com/platform/meta/meta-terms-of-service/automated-data-collection-restrictions/)).
- Chrome Web Store and Apple App Store reviews apply to the extension.

## Settings (server)

| Variable | Purpose |
| --- | --- |
| `CROSSPOST_PUBLIC_URL` | The server's public https address, used in the sign-in return link |
| `CROSSPOST_TOKEN_KEY` | Encrypts stored Facebook and Threads tokens (AES-256-GCM) |
| `THREADS_APP_ID`, `THREADS_APP_SECRET` | Connect Threads |
| `THREADS_WEBHOOK_VERIFY_TOKEN` | The Threads webhook (optional; polling works without it) |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_GRAPH_VERSION` | Connect Facebook |

The worker job `crosspost_poll` runs every 5 minutes. It queues `crosspost_check_account` for each connected account, and the webhook queues `crosspost_import_threads`. Photos and videos from connected accounts (Threads images, videos and carousels; Facebook photos, albums and videos) are downloaded from Meta into the media bucket: https only, photos up to 10 MB and videos up to 50 MB, with the type checked from the file's first bytes.

## API

- Member: `GET /crosspost`, `PATCH /crosspost/settings`, `POST`/`DELETE /crosspost/extension-key`, `POST /crosspost/{threads|facebook}/connect`, `DELETE /crosspost/{threads|facebook}`.
- Extension: `GET /crosspost/extension/check` (header `x-crosspost-key`), and `POST /crosspost/extension/posts` with header `x-crosspost-key` and the body `{ source, text, pageUrl?, media: [{ data: base64 }] }` (up to 10 photos and videos: photos up to 10 MB, videos up to 50 MB; type checked from the file's first bytes).
- Meta: `GET /crosspost/{provider}/callback`, `GET`/`POST /crosspost/threads/webhook`.

Data: migration `20261029007000_crosspost.sql`. Code: `apps/server/src/modules/crosspost/`, `apps/mobile/src/app/crosspost.tsx`, `apps/extension/`.

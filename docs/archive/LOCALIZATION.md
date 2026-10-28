# Languages: English only for now

> **Members see English only (Steve, 2026-10-28).** The app, notifications, push, emails, prompts and the public website are all English, whatever the phone's language or a language saved earlier. The language picker, the Spanish fields on Admin → Announcements and Invite codes, and the `/es` website pages are hidden; old `/es` links go to the English page. The Spanish text below stays in the code, switched off:
>
> - **App:** build with `EXPO_PUBLIC_SPANISH=1` (`env.spanish`). To list Spanish in the phone's per-app language setting again, add `"es"` back to `supportedLocales` in `app.json` and `"locales": { "es": "./languages/es.json" }`.
> - **Server:** set `SPANISH_ENABLED=1` (`src/language.ts`). Everything that writes to a member goes through `memberLang()`, which gives English while it is off.
> - Tests: `test/english-only.test.ts` checks the default; the Spanish tests turn the switch on for themselves.
>
> The rest of this page describes how it works with Spanish on.


> Set up 2026-10-28 following Expo's localization guide (https://docs.expo.dev/guides/localization/): `expo-localization` reads the phone's language, and `i18n-js` holds the strings.

## How it works

- **Strings** live in `apps/mobile/src/locales/en.ts` and `es.ts`. TypeScript fails the build if `es.ts` is missing a key that `en.ts` has.
- **Choosing a language:** Me → **Language** (Phone setting / English / Español), also at the bottom of the sign-in screen. The choice is saved on the device. "Phone setting" follows the phone; any language other than Spanish shows English.
- **Per-app language:** `app.json` declares `en` and `es` (`expo-localization` → `supportedLocales`), so Android 13+ and iOS also list Prayer Tower under the system's per-app language setting.
- **App name and photo permission** in Spanish: `apps/mobile/languages/es.json`.
- **Labels from `@prayer-tower/shared`** (post types, realms, kinds, card actions, "why are you here") stay English in shared; Spanish versions are under `enums` in `es.ts`. Use `label('postType', value, POST_TYPE_LABELS[value])` from `useLocale()`.

## Adding a string

```tsx
import { useT } from '@/lib/i18n';
const t = useT();
<Text>{t('profile.signOut')}</Text>
<Text>{t('card.praying', { count: 3 })}</Text>   // en: '%{count} praying'
```

Add the key to `en.ts`, then to `es.ts`.

## What's translated now

Tabs, sign-in, onboarding, feed header, all four feed layouts' pinned label, post cards, the card action sheets (pray, commit, encourage, share, gift, report), compose, the Me screen and legal links.

## Notifications and prompts

The app saves the member's language on their profile (`profiles.locale`, `PATCH /me {locale}`) whenever it changes. `notify()` takes an optional `t: { key, params }`; if the recipient's language isn't English and `apps/server/src/modules/notifications/i18n.ts` has that key, the Spanish title and body are used (in-app and push). All 20 notification types have Spanish. Prayer prompts (`prompts.question`) are translated too. Text members wrote (request previews, messages, notes) is passed through as written.

## Emails

Every email goes out in the recipient's language (`profiles.locale`):

- **Sign-up confirmation and password reset** (sent by Supabase Auth). The app sends `locale` in the sign-up metadata, and the new profile starts in that language (migration `20261029000000_signup_locale.sql`). The templates in `supabase/templates/` choose the language with `{{ if eq .Data.locale "es" }}` ([Supabase: Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)). Local development reads them from `supabase/config.toml`; `scripts/go-live.sh` uploads them to the hosted project when `SUPABASE_ACCESS_TOKEN` is set. Members who signed up before this change have no `locale` in their metadata, so they get English. The subjects in `supabase/config.toml` are English only while Spanish is off; the bilingual subjects are in the comments above them, for when Spanish is turned on.
- **Weekly digest:** the member's language.
- **Invite email** (Admin → Invite codes → Email): the language the admin picks, by default the admin's own (`POST /admin/invites/:code/email`).
- **Sponsor report:** a sponsor who is also a member gets their app language. Anyone else gets `SPONSOR_REPORT_LANG` (default `en`), or write the address as `es:name@org`.

## Still English (follow-up)

- Every screen is translated, including the staff screens (Admin, Moderation, Witness team, Macro needs) and the weekly email digest. Metric names on Admin → Pilot metrics come from the server; the known ones are translated under `admin.metric`, and new ones show prettified English until added. The offline banner is still English.
- **Text from the server:** error messages and tier names. (Notifications, pushes, moderation notices and prayer prompts are translated; see below.)
- Members' own posts aren't translated.

## Open questions (defaults chosen)

- **Spanish wording** is neutral Latin American Spanish with "tú". A native speaker from the pilot should review `es.ts` before release.
- **Terms:** tokens → "fichas", Priestly → "sacerdotales", tiers keep their English names (they come from the server).

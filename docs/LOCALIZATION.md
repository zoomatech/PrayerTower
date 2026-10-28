# Languages (English and Spanish)

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

Tabs, sign-in, onboarding, feed header, all four feed layouts' pinned label, post cards, compose, the Me screen and legal links.

## Still English (follow-up)

- Other screens: post detail, Promises, Messages, Notices, events, care, pools, scheduled gifts, Prayer Cast, rules, delete account, feedback, and the card action sheets (`card-actions.tsx`). Admin and moderation screens stay English on purpose (staff only).
- **Text from the server:** error messages, notification text, push notifications, prompts and tier names. These need the member's language saved on the profile so the server can choose. Not built yet.
- Members' own posts aren't translated.

## Open questions (defaults chosen)

- **Spanish wording** is neutral Latin American Spanish with "tú". A native speaker from the pilot should review `es.ts` before release.
- **Terms:** tokens → "fichas", Priestly → "sacerdotales", tiers keep their English names (they come from the server).

# Auto-Pray: AI prayers for requests

From the founding pitch ("opt-in Auto Pray"). Off by default.

## What it does

- Admin → AI turns it on ("Auto-Pray: AI prayers for requests"). It also needs `ANTHROPIC_API_KEY` on the server and worker; without the key nothing is written.
- On a prayer request, the person who asked sees "Have an AI pray for this request". Nobody else can turn it on.
- Every 30 minutes the worker (`auto_pray_write`) writes due prayers: up to *per day* AI prayers per opted-in request (1 to 4, spread across the day), and no more than the app-wide *daily limit* in total. An opt-in ends after *days* (default 30); turning it on again restarts it.
- Under the request, everyone who can see it sees "AI prayers (N)", labeled "Written by an AI, not by a person", with the latest three.

## What it never does

- AI prayers are stored apart (`ai_prayers`). They never add to human prayer counts, tokens, tiers, streaks, milestones, the award or the radio.
- Only the request's words are sent to the AI, never a name.
- A request that mentions a crisis, a request flagged as harmful, an answered request, a hidden or removed post, and any Open Circle (neutral wording) request never get AI prayers.

## Settings (`ai_settings`)

| Column | Default | Range |
|---|---|---|
| `auto_pray_enabled` | false | |
| `auto_pray_per_day` | 1 | 1–4 |
| `auto_pray_daily_limit` | 100 | 1–10,000 |
| `auto_pray_days` | 30 | 1–365 |

The model is `AI_CHAT_MODEL`, the same as the other AI features.

## For the legal department

The request text goes to Anthropic's API when a member opts in. The privacy policy's AI section should list Auto-Pray alongside the AI conversation and the circle facilitator.

Code: `apps/server/src/modules/ai/auto-pray.ts`. Tests: `apps/server/test/auto-pray.test.ts`, `apps/mobile/src/__tests__/ai-prayers.test.tsx`.

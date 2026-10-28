# End-to-end tests

Playwright drives the app's web build against the local API and Supabase, signed in as the demo members from `npm run seed:demo`.

**Each run resets your local database.** It runs `supabase db reset` and then seeds fresh demo members. Set `E2E_SKIP_DB_RESET=1` to skip the reset, which only works when the demo members don't exist yet.

## What it covers

| File | Flow |
|---|---|
| `01-sign-in` | Signing in, and a wrong password being refused |
| `02-pray` | Carol posts a request. Ethel prays now, commits, and writes privately. Carol accepts and replies. |
| `03-community` | RSVP to an event, joining a public group and posting in it, asking for a prayer partner, and the pastor reaching out |
| `04-moderation` | A member reports a request, a moderator reviews it, and a member is kept out of the queue |
| `05-account` | A member deletes their account in the app and can no longer sign in |

## Running it

```bash
npm run db:start                        # local Supabase
npm run build:web -w @prayer-tower/e2e  # export the web build (again after app changes)
npm run test:e2e                        # starts the API and a static server if they aren't running
```

`apps/mobile/.env` must point the web build at the local stack (`EXPO_PUBLIC_API_URL=http://127.0.0.1:3000` plus the local Supabase URL and publishable key). `apps/server/.env` needs `SUPABASE_SECRET_KEY` for the API.

`@playwright/test` is pinned to 1.63.0 to match the Chromium already installed in the cloud dev container. Elsewhere, run `npx playwright install chromium` once.

You can override the targets with `E2E_WEB_URL`, `E2E_API_URL`, `DATABASE_URL` and `DEMO_PASSWORD`. Reports go to `playwright-report/`, and the traces of failed tests go to `test-results/`.

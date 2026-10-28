# LIVE AMPLIFIER: ham operators read prayers aloud

From the notebook's HAM Operators page: "a tier of prayer warrior we'll call the LIVE AMPLIFIER: instead of a digitally encoded message, they promise to read prayers out loud over their HAM radio setup."

**It's off by default.** While it's off, operators get "not available", and nothing is read.

## How it works

1. **An admin adds an operator** by call sign after checking the licence, for example in the FCC's license search (ULS): `PUT /admin/amplifier/operators/:memberId { "callSign": "N0CALL", "licenseClass": "General" }`. Call signs are stored in capitals and must be unique. `DELETE` on the same address takes an operator off and lets go of their open claims.
2. **The operator opens the queue** (`GET /amplifier/queue`). It holds only the request text, never a name. It lists only requests that:
   - a member chose to send by radio, in the last `window_days` (default 14);
   - are visible, not marked sensitive, not crisis posts, and not waiting for a moderator.
3. **The operator claims one** (`POST /amplifier/readings { "radioPrayerId": "…" }`). They can hold at most `max_open_claims` at a time (default 3). A claim not marked read within `claim_minutes` (default 60) goes back to the queue. By default each prayer is read once (`reads_per_prayer`).
4. **The operator reads it on the air** and marks it read (`POST /amplifier/readings/:id/read { "onAirNote": "40 m net" }`), or lets it go (`…/release`). If the request was removed or hidden in the meantime, marking it read is refused, and the operator is asked not to read it.
5. **The person who posted it is told:** "A licensed ham radio operator read your prayer request aloud so more people could pray with you." The notice gives no call sign, place or reach, following the no-fake-functionality rule.

## Amateur rules

47 CFR 97.113 bars amateur transmissions for payment. So by default (`require_free`), the queue opens only while **radio prayers are free** (`token_settings.radio_funding = free`), as the PSK31 station already does ([RADIO_STATION.md](RADIO_STATION.md)). An admin can turn `requireFree` off.

## Settings

`GET/PATCH /admin/amplifier-settings`: `enabled`, `requireFree`, `claimMinutes`, `maxOpenClaims`, `windowDays`, `readsPerPrayer`. `GET /admin/amplifier/operators` lists the operators and the recent readings by call sign.

## Not built yet

There are no app screens. The operator flow is the API above, ready for an "Operator" screen once Steve turns this on.

## Files

- `supabase/migrations/20261029002800_live_amplifier.sql`
- `apps/server/src/modules/amplifier/`
- Tests: `apps/server/test/amplifier.test.ts`

# Ad-free promise page

A public page at **/promise** (and **/open-circle/promise** in Open Circle's words) that states, in plain English:

- No ads, sponsored posts or paid placements.
- We never sell, rent or trade what members share, or share it with advertisers or data brokers.
- No advertising trackers or ad identifiers.
- Money never decides whose request is seen; a lack of tokens never hides a request.
- Tokens never cash out.
- Members can delete their account at any time.

**Off by default.** Turn it on in Admin → Notebook ideas → "Public ad-free promise page". While it is off, both paths return 404. On an Open Circle domain (`OPEN_CIRCLE_HOSTS`), /promise shows the Open Circle version.

Source: Notes Page 14 and Page 16 (ads, funding, non-profit). The wording is a draft for Steve to approve before switching it on. The code is `apps/server/src/modules/site/promise.ts`; the switch is `notebook_settings.promise_page_enabled` (migration `20261029004700_pressure_rule_promise.sql`).

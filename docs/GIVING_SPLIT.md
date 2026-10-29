# Giving split

Steve, 2026-10-29: when a pool or gift credits a member, a share can go to the member's own Ko-fi or Zeffy page. Off until an admin turns it on (Admin → Giving split).

Tokens are never cash and the app never holds anyone's money, so the split is the giver's to make. The app shows the giver the member's page and the share they asked for, and on Give it can make the money gift smaller by that share.

## What people see

| Who | Where | What |
|---|---|---|
| Member | Me, under their support page | **Share of gifts to my own page**: None, 10%, 20%, … up to the admin's limit. Needs a support page (Ko-fi, Zeffy, Patreon and the other sites support links allow). |
| Giver | Give, giving to that member | "Ruth asks that 20% of gifts toward them go to their own page. Of this gift, that's $2." **Open their page**, and **Split my gift: $8 here, $2 to their page**, which makes the checkout $8. |
| Giver | Gift Tokens on that member's post | The same note and button, without an amount. |

## Rules the code enforces

- Only within the member's own community, never between blocked members, never on an anonymous post, never to yourself.
- A member can't ask for more than `max_percent` (50 by default). Lowering the limit lowers anyone above it.
- A share above 0 needs `profiles.support_url`.

## API

| Method | Path | Who |
|---|---|---|
| GET / PUT | `/me/giving-split` | members (`{ percent }`) |
| GET | `/people/:id/giving-split?cents=` | members |
| GET | `/posts/:id/giving-split` | members who can see the post |
| GET / PATCH | `/admin/giving-split-settings` | admins (`{ enabled, maxPercent }`) |

Migration: `20261029062100_giving_split.sql`.

## Known limits

- The app can't confirm that a giver sent the share. Ko-fi and Zeffy pages belong to the member, and the money goes straight there.

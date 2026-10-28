# The Common Prayer Fund's public report

From the Business Plan: a share of every token purchase goes to the Common Prayer Fund, which pays for the Witness team's direct help to people in real need.

**It's off by default.** The report is published only when `common_fund_page_enabled` is on (`PATCH /admin/future-settings { "commonFundPageEnabled": true }`). While it's off, the public addresses return "not found".

## What it shows

- **So far:** money in, help sent, and what's left in the fund now. It also shows how many people were helped and how many times help was sent, both from the Witness team's help log.
- **By month:** the last 12 months, money in and help sent.
- **Kinds of help:** for example groceries or rent, with how many times and how much.
- **Latest entries:** the date, what it was, the amount and an optional public note.

**No one is named.** Entries carry no member's name. The Witness case link stays on the admin side.

## Where

| Address | Who |
|---|---|
| `https://<your domain>/fund` | Anyone, as a web page |
| `GET /common-prayer-fund/report` | Anyone, as JSON |
| `GET /common-prayer-fund` | Signed-in members in the app (same data) |

## Bookkeeping (admins)

The app moves no money. An admin records what happened:

```
POST /admin/common-fund/entries
{ "direction": "in", "source": "donation", "amountCents": 5000, "publicNote": "A gift from a church" }

POST /admin/common-fund/entries
{ "direction": "out", "source": "help", "amountCents": 4500, "helpKind": "groceries", "witnessCaseId": "<optional>" }
```

- Money in is a `purchase_share`, a `donation` or `other`. Money out is always `help`.
- Entries are never deleted. A mistake is voided with `POST /admin/common-fund/entries/:id/void`, and voided entries drop out of the report. `GET /admin/common-fund/entries` lists everything, voided entries included.
- Token purchase isn't built yet. Until it is, the purchase share is entered by hand as `purchase_share`.
- Every admin change is recorded in the audit log.

## Files

- `supabase/migrations/20261029003200_common_fund_ledger.sql`
- `apps/server/src/modules/common-fund/`
- Tests: `apps/server/test/common-fund.test.ts` and `test/future.test.ts`

# Fines for using prayer requests as ads

From the Annotated Read (chat 10): "ban ads and penalize people who use prayer requests as ads with actual fines."

**It's off by default.** With the switch off, a removal under the "No ads" rule works as it always has: the content is removed and the moderator may add penalties by hand.

## What happens when it's on

When a moderator removes something under the **No ads** rule:

1. **Tokens are forfeited.** `forfeit_tokens` regular tokens (default 10) are taken, or the member's whole balance if it's smaller.
2. **A fine is recorded.** `fine_cents` (default 0, a placeholder until an amount is set) is recorded as owed. When the amount is 0, no money is owed and the record is kept only as the offense count.
3. **Repeat offenders are suspended.** There's no suspension for a first offense. A second offense within `lookback_days` (default 365) suspends the account for `repeat_suspend_days` (default 7). Each later offense doubles that, up to a year.
4. **The member is told.** The removal notice adds, for example: "Because prayer requests may not be used as ads, 10 tokens were forfeited and a fine of $25.00 was recorded."

An **overturned appeal** restores the content, lifts the suspension, returns the tokens and marks the fine waived. A waived fine doesn't count toward repeats.

## Money

The app doesn't collect money: there's no payment provider. An admin records a fine as **paid** once it's paid outside the app, or **waives** it.

## Settings and routes

| Route | Who | What |
|---|---|---|
| `GET/PATCH /admin/ad-fine-settings` | Admin | `enabled`, `forfeitTokens`, `fineCents`, `repeatSuspendDays`, `lookbackDays` |
| `GET /admin/ad-fines?status=owed` | Admin | Fines, newest first |
| `POST /admin/ad-fines/:id/resolve` | Admin | `{ "status": "paid" or "waived", "note": "…" }`, only for an owed fine |
| `GET /me/ad-fines` | Member | The member's own fines |

Fines are included in the member's data export (`adFines`). Admin changes are recorded in the audit log.

To turn it on:

```
PATCH /admin/ad-fine-settings
{ "enabled": true, "fineCents": 2500 }
```

## Files

- `supabase/migrations/20261029001100_ad_fines.sql`
- `apps/server/src/modules/ad-fines/index.ts`
- The link to moderation is in `decide()` and `decideAppeal()`, in `apps/server/src/modules/moderation/index.ts`.
- Tests: `apps/server/test/ad-fines.test.ts`

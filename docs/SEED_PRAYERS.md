# Seeding beneficial prayers

From the notebook, Page 9: "INTENTIONALLY SEED the kinds of prayers that are beneficial to society & elevate love, acceptance, kindness."

**It's off by default.** Nothing is posted automatically until an admin turns it on and chooses the account prayers are posted from.

## How it works

1. **A library of prayers.** Admins write prayers, edit them, and give each a theme (kindness, love, acceptance…). Five starter drafts come with it. They are drafts only, for you to edit, approve or retire.
2. **Approval.** Nothing is posted until an admin approves the text. If an approved prayer's text is edited, it goes back to draft and needs approving again.
3. **Posted honestly.** Prayers are posted from one real staff account that you choose (`publishAs`, for example a "Prayer Tower team" account with the moderator role), never from made-up members. They are never posted anonymously.
4. **On a schedule.** Every 15 minutes, while the switch is on, the worker posts approved prayers that are due, oldest first. It posts at most `maxPerDay` (default 1) in any 24 hours. Each prayer can have a "not before" time (`publishAfter`).
5. **By hand.** An admin can post an approved prayer at once, even while the switch is off.

Posted prayers go through the same safety check as every other post.

## Routes (admin)

| Route | What |
|---|---|
| `GET/PATCH /admin/seed-prayer-settings` | `enabled`, `publishAs` (an admin or moderator), `maxPerDay` |
| `GET /admin/seed-prayers?status=draft` | The library (draft, approved, published, retired) |
| `POST /admin/seed-prayers` | `{ "body": "…", "theme": "kindness", "postType": "open_prayer", "publishAfter": "2026-11-01T14:00:00Z" }` |
| `PATCH /admin/seed-prayers/:id` | Edit a draft or an approved prayer |
| `POST /admin/seed-prayers/:id/approve`, `/retire`, `/publish` | Approve, retire, or post now |

The post type is `open_prayer` (default), `praise`, `prayer_request` or `testimony`. Every change is recorded in the audit log.

## To turn it on

```
PATCH /admin/seed-prayer-settings
{ "enabled": true, "publishAs": "<staff account id>", "maxPerDay": 1 }
```

Then approve the prayers you want posted.

## Files

- `supabase/migrations/20261029003400_seed_prayers.sql` (with the starter drafts)
- `apps/server/src/modules/seed-prayers/index.ts`
- The worker job `seed_prayers_publish` (`apps/server/src/tasks.ts`)
- Tests: `apps/server/test/seed-prayers.test.ts`

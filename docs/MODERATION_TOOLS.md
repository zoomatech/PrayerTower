# Moderation tools

One switch in **Admin → Moderation tools**, off until an admin turns it on
(migration `20261029072000_moderation_tools.sql`, `modules/moderation/tools.ts`).

## Search (Moderation screen)

- **Waiting** or **Decided**, and the source (report, AI, harmful prayer, someone in danger).
- Words match the content, the reason given, the author's name and, for decided items,
  the name of who decided. `%` and `_` are matched literally.
- Decided items show Kept or Removed (with the rule), who decided, and when.

API: `GET /moderation/search?q=&status=pending|decided&source=&target=&before=&limit=`
(moderators and admins).

## Decide several at once

Select waiting reports (or **Select all**), pick the rule, then **Keep** or **Remove**.

- **Someone who may be in danger can't be selected.** Those stay one at a time, with the
  crisis buttons.
- **No suspensions or token penalties** in a bulk decision. Those stay one at a time.
- Each item is decided in its own transaction, with the same checks as a single
  decision. Anything that can't be decided (already decided, your own post, a rule that
  is switched off) is listed back with the reason, and the rest go through.
- At most *Most reports in one bulk decision* (default 25, 2–100) per request.
- Each item's own moderation record notes `Bulk decision (N selected)`, and the staff
  audit log records `POST /moderation/items/bulk` with the ids.

API: `POST /moderation/items/bulk { ids, action: dismiss|remove, rule?, note? }`
→ `{ decided: [...ids], skipped: [{ id, reason }] }`.

## Audit log filters (Admin → Audit log)

A search box (names, actions, record ids and logged settings), **Moderation only**, and
**Last 7 days**. API: `GET /admin/audit-log?q=&action=&since=` (admins; the three filters
need the switch on).

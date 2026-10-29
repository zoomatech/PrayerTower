# Member safety center

**Off by default.** An admin turns it on in **Admin → Your safety → Show members the safety center** (`PATCH /admin/safety-center { "enabled": true }`). It adds **Your safety** to Me and **Mute** on member pages. The wording is plain and the same in both editions (Prayer Tower and Open Circle).

## What a member can do

| Tool | Where | What happens |
|---|---|---|
| Report | Report on a post, comment or message | A moderator reads it. The member sees the report listed, and whether a moderator has looked, never what was decided about the other person. |
| Block | Block on someone's page | They stop seeing each other's posts, comments and messages (existing behavior). |
| Mute | Mute on someone's page | New. Their posts and comments leave the member's feed and testimonies. Nothing else changes, and they are not told. Quieter than a block. |
| Hide | Hide on a post | Only the member stops seeing that post (existing). |

**Your safety** lists the people blocked and muted, the posts hidden (each with an undo), the member's reports, and where to get help: 911 in danger, and the crisis line (988 in the US).

Major platforms describe the same set, and why mute exists next to block: muting lets someone step back without the other person knowing, which avoids escalation ([Instagram: Mute](https://help.instagram.com/469042960409432); [X: Mute vs block](https://help.x.com/en/using-x/x-mute); [Meta Safety Center](https://www.meta.com/safety/)).

## API

- `GET /me/safety`: `{ blocks, mutes, hidden, reports }` (403 while off).
- `GET | PUT | DELETE /people/:id/mute` (PUT is 403 while off; unmute always works).
- Mutes are in the member's data download (`muted`).

## Code

`apps/server/src/modules/safety-center/`, migration `20261029081200_safety_center.sql`, screen `apps/mobile/src/app/safety.tsx`, test `apps/server/test/safety-center.test.ts` (both editions).

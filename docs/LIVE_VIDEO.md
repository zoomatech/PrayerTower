# Live video rooms

From the notebook: Page 7 ("live seminars, Zoom meets") and Page 4 (move disputes to a video circle "so there is no hiding behind posts").

Live video is **off by default**. Turn it on in **Admin → Live video**.

## How it works

1. A staff member starts a room. Admins, moderators, pastors and pastor-counselors can host. To start one, go to Me → Live video, or tap Live video under "Live now".
2. Everyone in the host's community sees the room under **Live now** at the top of the feed. Open Circle and the Christian feed never see each other's rooms.
3. Members tap **Join**, and the room opens in an in-app browser.
4. The host taps **End**. If a room is left open, it stops showing as live after 180 minutes. Admins can change that limit.

Nothing is recorded. The server keeps only the room's title, host and start and end times. Rooms are deleted with the host's account.

## Two ways to get a room

| Way | What you need | Cost |
|---|---|---|
| **Your own Jitsi Meet server** | Set "Video server address" in Admin → Live video, for example `https://meet.example.org`. Each room gets a long random name, so nobody can guess it. | Jitsi Meet is free, open-source software. You pay only for a server. |
| **A pasted link** | Without a server, hosts paste a meeting link from an allowed site. The list is the same one events use (Admin → Events: Zoom, Google Meet, Teams, YouTube, Vimeo, Whereby, Jitsi and others). | That service's own plan |

Setting up a Jitsi server is in Jitsi's [self-hosting guide](https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart). It needs:
- Debian 12 or Ubuntu 24.04 or newer
- A domain name
- Open ports 80 and 443 (TCP) and 10000 (UDP)

The public meet.jit.si service is not a good fit for an embedded app. [Third-party plugin docs](https://docs.rapidevelopers.com/plugins/video-meet-jitsi) describe embedded demo meetings limited to 5 minutes. Jitsi's paid hosted service, [JaaS](https://jitsi.org/jaas/), runs on 8x8.vc and is listed in STEVE_TODO with the paid items.

## For other departments (notes, not blockers)

- **Safety:** only staff can host, and every room is tied to a named staff account. For circles about abuse or danger, the circle facilitator tells members not to meet the other person (docs/AI_COMPANIONS.md).
- **Privacy:** with a pasted link, the meeting service's own privacy terms apply. A self-hosted Jitsi server keeps video on your own hardware.

## Code

| Part | Location |
|---|---|
| Database | `supabase/migrations/20261029004100_live_rooms.sql` (`live_settings`, `live_rooms`) |
| Server | `apps/server/src/modules/live/` (`GET/POST /live`, `POST /live/:id/end`, `/admin/live-settings`) |
| App | `components/live-now.tsx` (feed and Me), `app/live.tsx` (hosts), Admin → Live video |
| Tests | `apps/server/test/live.test.ts`, `apps/mobile/src/__tests__/live.test.tsx` |

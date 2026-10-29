# Video circles

The notebook (Page 12) says the site "promotes restorative practices for dealing with issues between members and encourages moving disputes to a video circle, so there is no hiding behind posts." A video circle is a short, private video call between the person who was hurt by a comment, its author and a moderator. It is built on [Mend](GENTLE_REPAIR.md), and it is off by default.

## Turning it on

1. Admin → Growth practices → turn on **Mend (a guided apology)**.
2. Admin → Live video → turn on **Video circles about a sorry**.
3. Set up a video server in Admin → Live video: your own Jitsi Meet address, JaaS keys (`JAAS_*`), or practice rooms (Admin → Practice mode) for testing. [LIVE_VIDEO.md](LIVE_VIDEO.md) covers all three. Live rooms themselves can stay off, because circles are never listed under Live now.

## How it works

1. **A moderator offers it.** In Moderation → Sorries to read, or on a Mend's page, the moderator taps **Offer a video circle** and can add a few words. A circle isn't offered across a block, after the hurt person withdrew the Mend, or by a moderator who is one of the two members.
2. **The hurt person is asked first.** They get a notice and can say yes or no on the Mend page. If they say no, the author never hears of it, keeping Mend's rule that the author doesn't learn who was hurt.
3. **Then the author is asked.** They're told they'll meet the person there. If they say no, the hurt person is told kindly that the circle won't happen and that nothing else changes.
4. **The room opens when both say yes.** A new room with a long random name opens on the video server. Its address goes only to the two members and the moderator, and each sees the IIRP restorative questions to think about beforehand. Nothing is recorded.
5. **The moderator ends it** with **End the circle**, and the address stops being handed out. A new circle can be offered later.

Saying no is always fine, and nothing else depends on it.

## API

| Route                                               | Who                     | What                                           |
| --------------------------------------------------- | ----------------------- | ---------------------------------------------- |
| `GET /mends/:id/video-circle`                       | Either member, or staff | The newest circle this viewer may see, or null |
| `POST /moderation/mends/:id/video-circle` `{note?}` | Moderators, admins      | Offer a circle; asks the hurt person           |
| `POST /video-circles/:id/answer` `{join}`           | The member being asked  | Yes or no                                      |
| `POST /video-circles/:id/end`                       | Moderators, admins      | End it                                         |

The switch is `live_settings.circles_enabled`. Circles are kept in `video_circles`: the Mend, the moderator, the note, the status and the room address. A member's data export already covers the Mend.

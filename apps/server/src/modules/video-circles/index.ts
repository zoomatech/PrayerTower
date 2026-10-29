// Video circles (docs/VIDEO_CIRCLES.md; notebook Page 12: "move disputes to a video circle,
// so there is no hiding behind posts"). Off until Admin → Live video turns them on, and Mend
// must be on too. A moderator offers a short, private video circle about a Mend:
//   1. The hurt person is asked first. If they say no, the author never hears of it.
//   2. Only then is the author asked. They learn who it is only by meeting.
//   3. When both say yes, a private room opens for the two of them and the moderator.
//      It is never listed under Live now, and its address goes only to those three.
// Each side sees the IIRP restorative questions to think about beforehand. Saying no is
// always fine, and nothing else depends on it.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import { QUESTIONS } from '../ai/index.js';
import * as live from '../live/index.js';
import { isBlocked } from '../messages/index.js';
import * as notifications from '../notifications/index.js';
import { settings as practiceSettings } from '../practices/index.js';

type Status = 'asked_hurt' | 'asked_author' | 'ready' | 'declined' | 'ended';
const OPEN: Status[] = ['asked_hurt', 'asked_author', 'ready'];

interface CircleRow {
  id: string;
  mend_id: string;
  moderator_id: string | null;
  note: string | null;
  status: Status;
  author_asked: boolean;
  room_url: string | null;
  hurt_id: string;
  author_id: string;
  mend_status: string;
}

export async function enabled(q: Queryable) {
  return (await live.settings(q)).circles_enabled && (await practiceSettings(q)).mend_enabled;
}

async function requireOn(q: Queryable) {
  if (!(await enabled(q))) throw badRequest('Video circles are switched off');
}

const select = `select v.*, m.hurt_id, m.author_id, m.status as mend_status from public.video_circles v join public.mends m on m.id = v.mend_id`;

async function load(q: Queryable, id: string) {
  const { rows } = await q.query<CircleRow>(`${select} where v.id = $1`, [id]);
  return rows[0] ?? null;
}

function roleOf(c: CircleRow, userId: string) {
  return c.hurt_id === userId ? 'hurt' : c.author_id === userId ? 'author' : 'moderator';
}

/** What this viewer sees. The author sees nothing until they were asked; the room's address only once it's ready. */
async function present(q: Queryable, c: CircleRow, userId: string, opts: live.LiveOptions) {
  const role = roleOf(c, userId);
  const answering = (role === 'hurt' && c.status === 'asked_hurt') || (role === 'author' && c.status === 'asked_author');
  return {
    id: c.id,
    role,
    status: c.status,
    note: c.note,
    questions: QUESTIONS[role === 'hurt' ? 'harmed' : role === 'author' ? 'caused' : 'unsure'],
    canAnswer: answering,
    roomUrl: c.status === 'ready' && c.room_url ? await live.joinUrl(q, c.room_url, userId, role === 'moderator', opts) : null,
  };
}

/** The newest circle about this Mend that the viewer may see, for the Mend screen. Null when off or none. */
export async function forMend(q: Queryable, userId: string, mendId: string, staff: boolean, opts: live.LiveOptions = {}) {
  if (!(await enabled(q))) return null;
  const { rows } = await q.query<CircleRow>(`${select} where v.mend_id = $1 order by v.created_at desc limit 1`, [mendId]);
  const c = rows[0];
  if (!c) return null;
  const role = roleOf(c, userId);
  if (role === 'moderator' && !staff) return null;
  if (role === 'author' && !c.author_asked) return null;
  return present(q, c, userId, opts);
}

export const Offer = z.object({
  note: z.string().trim().min(1).max(400).optional(),
});

/** A moderator offers a circle. Only the hurt person is asked, and nobody else is told. */
export async function offer(q: Queryable, moderatorId: string, mendId: string, input: z.infer<typeof Offer>, opts: live.LiveOptions = {}) {
  await requireOn(q);
  if (!(await hasRole(q, moderatorId, 'moderator', 'admin'))) throw forbidden('Moderators only');
  const { rows: mends } = await q.query<{
    hurt_id: string;
    author_id: string;
    status: string;
  }>('select hurt_id, author_id, status from public.mends where id = $1', [mendId]);
  const m = mends[0];
  if (!m) throw notFound('Mend');
  if (m.status === 'withdrawn') throw badRequest('The hurt person withdrew this');
  if (await isBlocked(q, m.hurt_id, m.author_id)) throw badRequest('Not available: one of them blocked the other');
  if (moderatorId === m.hurt_id || moderatorId === m.author_id) throw forbidden("You can't host a circle you're part of");
  // Checked now, so a member never says yes to a circle that can't open.
  if (!(await live.newRoomUrl(q, opts))) throw badRequest('No video server is set up (Admin → Live video)');
  const { rows } = await q.query<{ id: string }>(`insert into public.video_circles (mend_id, moderator_id, note) values ($1, $2, $3) on conflict do nothing returning id`, [
    mendId,
    moderatorId,
    input.note ?? null,
  ]);
  if (!rows[0]) throw badRequest('A circle is already open for this');
  await notifications.notify(q, m.hurt_id, {
    kind: 'video_circle',
    title: 'Would you like to talk it through?',
    body: "A moderator offers a short, private video circle with the person whose comment hurt you. They won't hear about it unless you say yes. It's entirely up to you.",
    data: { mendId },
  });
  return {
    circle: await present(q, (await load(q, rows[0].id))!, moderatorId, opts),
  };
}

export const Answer = z.object({ join: z.boolean() });

export async function answer(q: Queryable, userId: string, id: string, input: z.infer<typeof Answer>, opts: live.LiveOptions = {}) {
  await requireOn(q);
  const c = await load(q, id);
  const role = c ? roleOf(c, userId) : null;
  if (!c || !((role === 'hurt' && c.status === 'asked_hurt') || (role === 'author' && c.status === 'asked_author'))) throw notFound('Video circle');
  const tell = (to: string | null, title: string, body: string) =>
    to
      ? notifications.notify(q, to, {
          kind: 'video_circle',
          title,
          body,
          data: { mendId: c.mend_id },
        })
      : undefined;

  if (!input.join) {
    await q.query(`update public.video_circles set status = 'declined', updated_at = now() where id = $1`, [id]);
    await tell(c.moderator_id, "The circle won't happen", 'One of them would rather not meet. Thank you for offering.');
    if (role === 'author') await tell(c.hurt_id, "The circle won't happen", "That's okay. Nothing else changes.");
  } else if (role === 'hurt') {
    await q.query(`update public.video_circles set status = 'asked_author', author_asked = true, updated_at = now() where id = $1`, [id]);
    await tell(
      c.author_id,
      'A video circle about your comment',
      "Someone who was hurt by your comment would like to talk it through in a short, private video circle with a moderator. You'll meet them there. It's entirely up to you.",
    );
  } else {
    const roomUrl = await live.newRoomUrl(q, opts);
    if (!roomUrl) throw badRequest('The video server is not set up right now. Please try again later.');
    await q.query(`update public.video_circles set status = 'ready', room_url = $2, updated_at = now() where id = $1`, [id, roomUrl]);
    for (const to of [c.hurt_id, c.moderator_id]) await tell(to, 'Your video circle is ready', 'Open it from the Mend screen when you are both ready.');
  }
  return { circle: await present(q, (await load(q, id))!, userId, opts) };
}

/** The moderator, or any moderator or admin, closes the circle. Its address stops being handed out. */
export async function end(q: Queryable, userId: string, id: string, opts: live.LiveOptions = {}) {
  const c = await load(q, id);
  if (!c || !OPEN.includes(c.status)) throw notFound('Video circle');
  if (!(await hasRole(q, userId, 'moderator', 'admin'))) throw forbidden('Moderators only');
  await q.query(`update public.video_circles set status = 'ended', updated_at = now() where id = $1`, [id]);
  return { circle: await present(q, (await load(q, id))!, userId, opts) };
}

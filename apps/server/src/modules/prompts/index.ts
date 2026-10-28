// Prompts module: occasional "When was the last time you prayed for ___?"
// popups, with frequency caps. A prompt points at the member's own
// commitment they have gone longest without, or else at an open request from
// someone they follow that they have not prayed for.
import { z } from 'zod';
import { product } from '../../config.js';
import type { Queryable } from '../../db.js';
import { badRequest, notFound } from '../../errors.js';
import { memberLang } from '../../language.js';
import { following, getProfile } from '../accounts/index.js';
import * as commitments from '../commitments/index.js';
import { isSecular } from '../communities/index.js';
import * as posts from '../posts/index.js';
import * as prayerActions from '../prayer-actions/index.js';

const REPEAT_POST_AFTER_DAYS = 3;

export interface Prompt {
  id: string;
  postId: string;
  commitmentId: string | null;
  question: string;
  tone: 'gentle' | 'firm';
}

/** Returns a prompt to show now, or null when the member is within their cap. */
export async function next(q: Queryable, userId: string, now = new Date()): Promise<Prompt | null> {
  const profile = await getProfile(q, userId);
  if (!profile?.prompts_enabled) return null;
  const minHours = profile.prompt_min_hours ?? product.promptMinHours;

  const { rows: recent } = await q.query<{ post_id: string; shown_at: Date }>(
    `select post_id, shown_at from public.prayer_prompts
      where user_id = $1 and shown_at > $2::timestamptz - make_interval(days => $3) order by shown_at desc`,
    [userId, now, REPEAT_POST_AFTER_DAYS],
  );
  const last = recent[0];
  if (last && now.getTime() - last.shown_at.getTime() < minHours * 3_600_000) return null;
  const shownToday = recent.filter((r) => now.getTime() - r.shown_at.getTime() < 86_400_000).length;
  if (shownToday >= product.promptsPerDay) return null;
  const exclude = recent.map((r) => r.post_id);

  let postId: string | null = null;
  let commitmentId: string | null = null;
  const commitment = await commitments.leastRecentlyPrayed(q, userId, 24, exclude);
  if (commitment) {
    postId = commitment.post_id;
    commitmentId = commitment.id;
  } else {
    const followees = (await following(q, userId)).map((p) => p.id as string);
    postId = (await posts.unprayedRequestsFrom(q, userId, followees, exclude))?.id ?? null;
  }
  if (!postId) return null;

  const tone = profile.prompt_tone ?? (await defaultTone(q));
  const { rows } = await q.query<{ id: string }>(
    'insert into public.prayer_prompts (user_id, post_id, commitment_id, shown_at, tone) values ($1, $2, $3, $4, $5) returning id',
    [userId, postId, commitmentId, now, tone],
  );
  const who = await posts.promptSubject(q, postId, userId);
  return { id: rows[0]!.id, postId, commitmentId, question: question(tone, who, !!commitmentId, profile.locale, await isSecular(q, userId)), tone };
}

export type Tone = 'gentle' | 'firm';

/** Firm copy is Steve's own wording from notebook Page 14. */
export function question(tone: Tone, who: string, committed: boolean, locale = 'en', secular = false): string {
  // Open Circle, the non-religious community, in English.
  if (secular) {
    if (tone === 'firm') {
      return committed
        ? `Remember, you promised to be there for ${who}. Won't you take just a moment now?`
        : `Don't let your friends down. Would you send some support to ${who} now?`;
    }
    return committed ? `When did you last check in on ${who}?` : `Would you send some support to ${who} today?`;
  }
  if (memberLang(locale) === 'es') {
    if (who === 'this request') who = 'esta petición';
    if (tone === 'firm') {
      return committed
        ? `Recuerda que te comprometiste ante Dios a orar por ${who}. ¿Te tomarías un momento ahora?`
        : `No defraudes a tus hermanos y hermanas. ¿Orarías por ${who} ahora?`;
    }
    return committed ? `¿Cuándo fue la última vez que oraste por ${who}?` : `¿Orarías por ${who} hoy?`;
  }
  if (tone === 'firm') {
    return committed
      ? `Remember, you made a commitment before God to pray for ${who}. Won't you take just a moment now?`
      : `Don't let your brothers and sisters down. Would you pray for ${who} now?`;
  }
  return committed ? `When was the last time you prayed for ${who}?` : `Would you pray for ${who} today?`;
}

export async function defaultTone(q: Queryable): Promise<Tone> {
  const { rows } = await q.query<{ default_tone: Tone }>('select default_tone from public.prompt_settings');
  return rows[0]!.default_tone;
}

export async function setDefaultTone(q: Queryable, tone: Tone): Promise<Tone> {
  await q.query('update public.prompt_settings set default_tone = $1', [tone]);
  return tone;
}

/** How often each tone's prompts led to a prayer, for comparing them. */
export async function toneResults(q: Queryable, since: Date) {
  const { rows } = await q.query<{ tone: Tone; shown: number; prayed: number }>(
    `select tone, count(*)::int as shown, count(*) filter (where response = 'prayed')::int as prayed
       from public.prayer_prompts where shown_at >= $1 group by tone order by tone`,
    [since],
  );
  return rows;
}

export const Response = z.object({ response: z.enum(['prayed', 'dismissed', 'snoozed']) });

/** "I prayed" records the prayer (a check-in when it came from a commitment). */
export async function respond(q: Queryable, userId: string, promptId: string, response: z.infer<typeof Response>['response']) {
  const { rows } = await q.query<{ post_id: string; commitment_id: string | null; response: string | null }>(
    'select post_id, commitment_id, response from public.prayer_prompts where id = $1 and user_id = $2 for update',
    [promptId, userId],
  );
  const p = rows[0];
  if (!p) throw notFound('Prompt');
  if (p.response) throw badRequest('This prompt was already answered');
  await q.query('update public.prayer_prompts set response = $2, responded_at = now() where id = $1', [promptId, response]);
  if (response !== 'prayed') return { recorded: false };
  if (p.commitment_id) await commitments.checkIn(q, userId, p.commitment_id);
  else await prayerActions.prayingNow(q, userId, p.post_id, {});
  return { recorded: true };
}

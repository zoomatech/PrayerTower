import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as activity from '../src/modules/activity/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

/** Insert prayer taps directly with chosen timestamps. */
async function taps(userId: string, postId: string, times: Date[]) {
  for (const t of times) {
    await db.query(`insert into public.prayer_events (post_id, user_id, kind, created_at) values ($1, $2, 'praying_now', $3)`, [postId, userId, t]);
  }
}

describe('bot signals on prayers', () => {
  it('flags metronome taps and floods for a moderator, never a normal pray-er', async () => {
    const now = new Date();
    const poster = await createUser('Signal Poster');
    const post = await newRequest(poster);
    const bot = await createUser('Metronome');
    const flood = await createUser('Flooder');
    const person = await createUser('Real Person');
    // Every 30 seconds exactly, 25 times.
    await taps(bot, post.id, Array.from({ length: 25 }, (_, i) => new Date(now.getTime() - (25 - i) * 30_000)));
    // 70 taps with irregular gaps.
    await taps(flood, post.id, Array.from({ length: 70 }, (_, i) => new Date(now.getTime() - 3_000_000 + i * 40_000 + (i % 7) * 4_000)));
    // A person praying 8 times with irregular gaps.
    await taps(person, post.id, [5, 9, 17, 30, 31, 44, 50, 58].map((m) => new Date(now.getTime() - m * 60_000)));

    await activity.scan(db, now);
    await activity.scan(db, now); // no duplicates
    const mod = await createUser('Signal Mod');
    await grantRole(db, mod, 'moderator', null);
    const flags = (await as(mod).get('/moderation/activity-flags')).json().flags as { id: string; userId: string; reason: string }[];
    const ids: string[] = [bot, flood, person];
    const mine = flags.filter((f) => ids.includes(f.userId));
    expect(mine.map((f) => [f.userId, f.reason]).sort()).toEqual([[bot, 'too_regular'], [flood, 'too_many']].sort());

    const member = await createUser('Not Mod');
    expect((await as(member).get('/moderation/activity-flags')).statusCode).toBe(403);
    const flagId = mine.find((f) => f.userId === bot)!.id;
    expect((await as(mod).post(`/moderation/activity-flags/${flagId}`, { status: 'confirmed', note: 'Script' })).statusCode).toBe(200);
    expect((await as(mod).post(`/moderation/activity-flags/${flagId}`, { status: 'cleared' })).statusCode).toBe(409);
    // Tokens are untouched: flags never penalize on their own.
    const { rows } = await db.query(`select count(*)::int as n from public.moderation_actions where user_id = $1`, [bot]);
    expect(rows[0].n).toBe(0);
  });
});

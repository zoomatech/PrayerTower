import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

describe('account deletion', () => {
  it('removes the sign-in and everything the member wrote, keeping only the anonymous ledger', async () => {
    const leaver = await createUser('Leaving Lydia');
    const friend = await createUser('Staying Sam');
    const plain = await newRequest(leaver, 'Pray for my exams next week.');
    const funded = await newRequest(leaver, 'Pray for our mission trip.');
    // A request the ledger points at can't be deleted, only emptied.
    await db.query(`insert into public.token_accounts (kind, post_id) values ('post_reach', $1)`, [funded.id]);
    const theirs = await newRequest(friend, 'Pray for my job interview.');
    await as(leaver).post(`/posts/${theirs.id}/comments`, { body: 'Praying for you, Sam!' });
    await as(leaver).post(`/posts/${theirs.id}/praying-now`, {});
    await as(leaver).put(`/people/${friend}/follow`);

    expect((await as(leaver).delete('/me')).statusCode).toBe(400); // must type DELETE
    const res = await as(leaver).inject('DELETE', '/me', { confirm: 'DELETE' });
    expect(res.json(), res.body).toEqual({ deleted: true });

    expect((await as(leaver).get('/me')).statusCode).toBe(401);
    expect((await db.query('select 1 from auth.users where id = $1', [leaver])).rowCount).toBe(0);
    expect((await db.query('select 1 from public.posts where id = $1', [plain.id])).rowCount).toBe(0);
    const { rows: kept } = await db.query('select body, moderation_status from public.posts where id = $1', [funded.id]);
    expect(kept[0]).toEqual({ body: '(deleted)', moderation_status: 'removed' });
    expect((await as(friend).get(`/posts/${funded.id}`)).statusCode).toBe(404);
    const comments = (await as(friend).get(`/posts/${theirs.id}/comments`)).json().comments as { body: string }[];
    expect(comments.some((c) => c.body.includes('Praying for you, Sam'))).toBe(false);
    const { rows: profile } = await db.query('select display_name, deleted_at from public.profiles where id = $1', [leaver]);
    expect(profile[0].display_name).toBe('Deleted member');
    expect(profile[0].deleted_at).not.toBeNull();
    expect((await db.query('select 1 from public.follows where user_id = $1', [leaver])).rowCount).toBe(0);
  });

  it('puts every setting back to its default, so nothing like a time zone is left behind', async () => {
    const leaver = await createUser('Leaving Lena');
    await db.query(
      `update public.profiles set notification_prefs = '{"off": ["comments"], "quietHours": {"start": "22:00", "end": "07:00", "tz": "America/Chicago"}}',
              digest_enabled = true, digest_sent_week = '2026-W44', show_prayer_stats = false, prompts_enabled = false,
              prompt_min_hours = 6, anonymous_by_default = true, thanks_card_dismissed_at = now()
        where id = $1`,
      [leaver],
    );
    expect((await as(leaver).inject('DELETE', '/me', { confirm: 'DELETE' })).statusCode).toBe(200);
    const { rows } = await db.query(
      `select notification_prefs, digest_enabled, digest_sent_week, show_prayer_stats, prompts_enabled, prompt_min_hours,
              anonymous_by_default, thanks_card_dismissed_at, locale
         from public.profiles where id = $1`,
      [leaver],
    );
    expect(rows[0]).toEqual({
      notification_prefs: { off: [], quietHours: null },
      digest_enabled: false,
      digest_sent_week: null,
      show_prayer_stats: true,
      prompts_enabled: true,
      prompt_min_hours: null,
      anonymous_by_default: false,
      thanks_card_dismissed_at: null,
      locale: 'en',
    });
  });
});

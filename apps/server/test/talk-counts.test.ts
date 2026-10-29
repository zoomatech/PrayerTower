// Counting patterns: anonymous weekly totals of move labels, only from members who
// chose to share while the switch is on; the admin view folds rows under five.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, db } from './helpers.js';

const on = (v: boolean) => db.query('update public.conversation_settings set talk_counts_enabled = $1', [v]);
const chain = { kind: 'chain', moves: ['greeting', 'greeting', 'howAreYou'] };

beforeAll(async () => {
  await on(false);
  await db.query('truncate public.talk_chain_counts, public.emoji_reply_counts');
});
afterAll(async () => {
  await on(false);
  await db.end();
});

describe('Counting patterns', () => {
  it('counts nothing while off or until the member chooses to share', async () => {
    const u = await createUser('Count Member');
    expect((await as(u).post('/talk-counts', chain)).json()).toEqual({ counted: false });
    await on(true);
    expect((await as(u).post('/talk-counts', chain)).json()).toEqual({ counted: false });
    await as(u).patch('/me/conversation-prefs', { shareCounts: true });
    expect((await as(u).post('/talk-counts', chain)).json()).toEqual({ counted: true });
    expect((await as(u).post('/talk-counts', { kind: 'chain', moves: ['other', 'greeting', 'thanks'] })).statusCode).toBe(400);
    const { rows } = await db.query('select * from public.talk_chain_counts');
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual(['first_move', 'followup_move', 'n', 'reply_move', 'week']);
  });

  it('keeps emoji replies by the move they answer, and the admin view hides small rows', async () => {
    await on(true);
    const admin = await createUser('Count Admin');
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [admin]);
    const u = await createUser('Count Sharer');
    await as(u).patch('/me/conversation-prefs', { shareCounts: true });
    const { rows } = await db.query<{ emoji_key: string; meaning_key: string }>('select emoji_key, meaning_key from public.reaction_meanings limit 1');
    const e = { kind: 'emoji', emoji: rows[0]!.emoji_key, meaning: rows[0]!.meaning_key, toMove: 'trouble' };
    expect((await as(u).post('/talk-counts', { ...e, meaning: 'nope' })).statusCode).toBe(400);
    for (let i = 0; i < 5; i++) await as(u).post('/talk-counts', e);
    for (let i = 0; i < 4; i++) await as(u).post('/talk-counts', { kind: 'chain', moves: ['thanks', 'thanks', 'farewell'] });
    const s = (await as(admin).get('/admin/talk-counts')).json().counts;
    expect(s.emoji).toEqual([{ emoji: e.emoji, meaning: e.meaning, toMove: 'trouble', n: 5 }]);
    expect(s.chains).toEqual([]);
    expect(s.otherChains).toBe(5);
    expect((await as(u).get('/admin/talk-counts')).statusCode).toBe(403);
  });
});

describe('Meanings in the icon row', () => {
  it('is off by default and an admin can switch it on', async () => {
    const admin = await createUser('Row Admin');
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [admin]);
    const { features } = await import('../src/modules/conversation-helpers/index.js');
    expect((await features(db)).meaningIconRow).toBe(false);
    const res = await as(admin).patch('/admin/conversation-settings', { meaningRowEnabled: true });
    expect(res.json().settings.meaning_row_enabled).toBe(true);
    expect((await features(db)).meaningIconRow).toBe(true);
    await as(admin).patch('/admin/conversation-settings', { meaningRowEnabled: false });
  });
});

describe('Kindness research page', () => {
  it('is hidden until switched on, then shows members the folded totals', async () => {
    const u = await createUser('Research Reader');
    await db.query('update public.conversation_settings set research_page_enabled = false');
    expect((await as(u).get('/kindness-research')).statusCode).toBe(404);
    await db.query('update public.conversation_settings set research_page_enabled = true');
    const r = (await as(u).get('/kindness-research')).json().counts;
    expect(r).toMatchObject({ weeks: 12, minShown: 5 });
    for (const row of r.chains) expect(row.n).toBeGreaterThanOrEqual(5);
    await db.query('update public.conversation_settings set research_page_enabled = false');
  });
});

// Auto-Pray AI intercession: off by default; the author opts in; AI prayers are
// labeled and counted apart, never as human prayers or tokens.
import { afterAll, describe, expect, it } from 'vitest';
import { AUTO_PRAY_SYSTEM, writeDue } from '../src/modules/ai/auto-pray.js';
import type { Turn } from '../src/modules/ai/provider.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.query('update public.ai_settings set auto_pray_enabled = false, auto_pray_per_day = 1, auto_pray_daily_limit = 100, auto_pray_days = 30');
  await db.query('delete from public.auto_pray_requests');
  await db.end();
});

describe('Auto-Pray', () => {
  it('writes labeled AI prayers for opted-in requests, apart from human prayers', async () => {
    const author = await createUser('Auto Pray Author');
    const viewer = await createUser('Auto Pray Viewer');
    const post = await newRequest(author, 'Please pray for my sister, her job interview is Friday.');
    const calls: { system: string; turns: Turn[] }[] = [];
    const converse = async (system: string, turns: Turn[]) => {
      calls.push({ system, turns });
      return { text: 'Lord, give her calm and clear words on Friday. Amen.' };
    };

    // Off: nothing offered, nothing written.
    expect((await as(author).get(`/posts/${post.id}/ai-prayers`)).json()).toMatchObject({ enabled: false });
    expect((await as(author).put(`/posts/${post.id}/auto-pray`, { on: true })).statusCode).toBe(403);
    await db.query('update public.ai_settings set auto_pray_enabled = true');

    // Only the author opts in.
    expect((await as(viewer).put(`/posts/${post.id}/auto-pray`, { on: true })).statusCode).toBe(403);
    const on = await as(author).put(`/posts/${post.id}/auto-pray`, { on: true });
    expect(on.json()).toMatchObject({ enabled: true, optedIn: true, count: 0 });

    const before = (await db.query('select count(*)::int as n from public.prayer_events where post_id = $1', [post.id])).rows[0].n;
    const balance = await tokens.balanceOf(db, author);
    expect(await writeDue(db, null)).toBe(0);
    expect(await writeDue(db, converse)).toBeGreaterThanOrEqual(1);
    const mine = calls.find((c) => c.turns[0]!.content.includes('job interview'))!;
    expect(mine.system).toBe(AUTO_PRAY_SYSTEM);
    // Only the request's words go to the AI, never the author's name.
    expect(mine.turns[0]!.content).not.toContain('Auto Pray Author');
    // Spaced out: a second run the same day writes nothing more for it.
    calls.length = 0;
    await writeDue(db, converse);
    expect(calls.some((c) => c.turns[0]!.content.includes('job interview'))).toBe(false);

    const seen = (await as(viewer).get(`/posts/${post.id}/ai-prayers`)).json();
    expect(seen).toMatchObject({ enabled: true, optedIn: true, count: 1, isMine: false });
    expect(seen.prayers[0].body).toMatch(/calm and clear/);
    // Human prayer counts and tokens are untouched.
    expect((await db.query('select count(*)::int as n from public.prayer_events where post_id = $1', [post.id])).rows[0].n).toBe(before);
    expect(await tokens.balanceOf(db, author)).toBe(balance);

    // Opting out stops it.
    expect((await as(author).put(`/posts/${post.id}/auto-pray`, { on: false })).json()).toMatchObject({ optedIn: false, count: 1 });
  });

  it('never sends a crisis request to the AI and keeps the daily limit', async () => {
    const author = await createUser('Auto Pray Crisis');
    await db.query('update public.ai_settings set auto_pray_enabled = true');
    const crisis = await newRequest(author, 'I want to kill myself, please pray.');
    await db.query('insert into public.auto_pray_requests (post_id) values ($1) on conflict do nothing', [crisis.id]);
    const calls: string[] = [];
    await writeDue(db, async (_s, turns) => {
      calls.push(turns[0]!.content);
      return { text: 'A prayer.' };
    });
    expect(calls.some((c) => c.includes('kill myself'))).toBe(false);

    const other = await newRequest(author, 'Pray for rain on our farm.');
    await db.query('insert into public.auto_pray_requests (post_id) values ($1)', [other.id]);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.ai_prayers where created_at > now() - interval '1 day'`);
    await db.query('update public.ai_settings set auto_pray_daily_limit = $1', [rows[0]!.n]);
    expect(await writeDue(db, async () => ({ text: 'A prayer.' }))).toBe(0);
  });
});

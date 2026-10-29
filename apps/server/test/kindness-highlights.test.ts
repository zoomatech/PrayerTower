// Kindness highlights: the person lifted up nominates, the author consents, an admin
// picks (and may trim names), members see only the words, and the author can withdraw.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as notebook from '../src/modules/notebook/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const on = (v: boolean) => db.query('update public.practice_settings set highlights_enabled = $1', [v]);

beforeAll(() => on(false));
afterAll(async () => {
  await on(false);
  await db.end();
});

async function kindComment(body: string) {
  const [poster, author] = [await createUser('HL Poster'), await createUser('HL Author')];
  const post = await newRequest(poster, `Please keep me in mind this week, ${body.length}.`);
  const commentId = (await as(author).post(`/posts/${post.id}/comments`, { body })).json().comment.id as string;
  return { poster, author, commentId };
}

describe('Kindness highlights', () => {
  it('is off by default', async () => {
    expect((await notebook.features(db)).kindnessHighlights).toBe(false);
    const { poster, commentId } = await kindComment('You are not alone, Dana. I will bring soup.');
    expect((await as(poster).post(`/comments/${commentId}/lifted-me-up`)).statusCode).toBe(400);
    expect((await as(poster).get('/kindness-highlights')).json()).toEqual({ enabled: false, weeks: [] });
  });

  it('needs the lifted-up person, the author’s yes, and an admin’s pick; members see words only', async () => {
    await on(true);
    const admin = await createUser('HL Admin');
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [admin]);
    const { poster, author, commentId } = await kindComment('You are not alone, Dana. I will bring soup on Friday.');
    expect((await as(author).post(`/comments/${commentId}/lifted-me-up`)).statusCode).toBe(400);
    expect((await as(await createUser('HL Stranger')).post(`/comments/${commentId}/lifted-me-up`)).statusCode).toBe(400);
    expect((await as(poster).post(`/comments/${commentId}/lifted-me-up`)).json()).toEqual({ asked: true });

    const ask = (await as(author).get('/me/highlight-asks')).json().asks[0];
    expect(ask).toMatchObject({ status: 'asked', body: 'You are not alone, Dana. I will bring soup on Friday.' });
    // Not in the admin queue until the author says yes.
    expect((await as(admin).get('/admin/kindness-highlights')).json().items.map((i: { id: string }) => i.id)).not.toContain(ask.id);
    await as(author).post(`/me/highlight-asks/${ask.id}`, { yes: true });
    expect((await as(admin).get('/admin/kindness-highlights')).json().items.map((i: { id: string }) => i.id)).toContain(ask.id);
    expect((await as(author).post(`/admin/kindness-highlights/${ask.id}`, { pick: true })).statusCode).toBe(403);

    await as(admin).post(`/admin/kindness-highlights/${ask.id}`, { pick: true, shownText: 'You are not alone. I will bring soup on Friday.' });
    const seen = (await as(await createUser('HL Reader')).get('/kindness-highlights')).json();
    const items = seen.weeks[0].items;
    expect(items).toContainEqual({ id: ask.id, text: 'You are not alone. I will bring soup on Friday.' });
    expect(JSON.stringify(seen)).not.toMatch(/HL Author|HL Poster|Dana/);

    expect((await as(admin).post('/admin/kindness-highlights/send')).json().sent).toBeGreaterThan(0);
    await as(admin).post('/admin/kindness-highlights/send');
    const n = await db.query(`select count(*)::int as n from public.notifications where user_id = $1 and kind = 'highlights'`, [poster]);
    expect(n.rows[0].n).toBe(1);

    // The author withdraws: gone at once.
    await as(author).post(`/me/highlight-asks/${ask.id}/withdraw`);
    const after = (await as(poster).get('/kindness-highlights')).json().weeks.flatMap((w: { items: { id: string }[] }) => w.items.map((i) => i.id));
    expect(after).not.toContain(ask.id);
  });

  it('a no keeps it out for good', async () => {
    await on(true);
    const { poster, author, commentId } = await kindComment('Thinking of you every morning.');
    await as(poster).post(`/comments/${commentId}/lifted-me-up`);
    const ask = (await as(author).get('/me/highlight-asks')).json().asks[0];
    await as(author).post(`/me/highlight-asks/${ask.id}`, { yes: false });
    expect((await as(author).get('/me/highlight-asks')).json().asks).toEqual([]);
    await as(poster).post(`/comments/${commentId}/lifted-me-up`);
    expect((await as(author).get('/me/highlight-asks')).json().asks).toEqual([]);
  });
});

// Gentle repair: the first-comment welcome card, the unsigned "ask kindly" note, and
// Mend, where only the hurt person invites a sorry and a moderator reads it first.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as notebook from '../src/modules/notebook/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const set = (welcome: boolean, ask: boolean, mend: boolean) =>
  db.query('update public.practice_settings set welcome_card_enabled = $1, ask_kindly_enabled = $2, mend_enabled = $3, welcome_text = null', [welcome, ask, mend]);
const notices = async (userId: string, kind: string) =>
  (await db.query<{ body: string; data: Record<string, string> }>('select body, data from public.notifications where user_id = $1 and kind = $2', [userId, kind])).rows;

async function comment(author: string, body = 'You should have known better.') {
  const poster = await createUser('Repair Poster');
  const post = await newRequest(poster);
  const res = await as(author).post(`/posts/${post.id}/comments`, { body });
  if (res.statusCode !== 201) throw new Error(res.body);
  return { postId: post.id, poster, commentId: res.json().comment.id as string };
}

beforeAll(() => set(false, false, false));
afterAll(async () => {
  await set(false, false, false);
  await db.end();
});

describe('Welcome card', () => {
  it('shows before a first comment until dismissed, with the admin wording when set', async () => {
    const u = await createUser('Welcome New');
    expect((await as(u).get('/me/welcome-card')).json()).toEqual({ show: false, text: null });
    await set(true, false, false);
    expect((await notebook.features(db)).welcomeCard).toBe(true);
    await db.query(`update public.practice_settings set welcome_text = 'Here we lift each other up.'`);
    expect((await as(u).get('/me/welcome-card')).json()).toEqual({ show: true, text: 'Here we lift each other up.' });
    await as(u).post('/me/welcome-card/dismiss');
    expect((await as(u).get('/me/welcome-card')).json().show).toBe(false);
    const commenter = await createUser('Welcome Commenter');
    await comment(commenter, 'Praying with you.');
    expect((await as(commenter).get('/me/welcome-card')).json().show).toBe(false);
  });
});

describe('Ask kindly', () => {
  it('sends one unsigned note to the author, never to yourself or across a block', async () => {
    await set(false, true, false);
    const [author, reader, blocked] = [await createUser('Ask Author'), await createUser('Ask Reader'), await createUser('Ask Blocked')];
    const c = await comment(author);
    expect((await as(author).post(`/comments/${c.commentId}/ask-kindly`, { reason: 'unkind' })).statusCode).toBe(400);
    expect((await as(reader).post(`/comments/${c.commentId}/ask-kindly`, { reason: 'grief' })).json()).toEqual({ sent: true });
    await as(reader).post(`/comments/${c.commentId}/ask-kindly`, { reason: 'grief' });
    const got = await notices(author, 'kind_ask');
    expect(got).toHaveLength(1);
    expect(got[0]!.body).toContain('hard to read while grieving');
    expect(got[0]!.body).not.toContain('Ask Reader');
    await db.query('insert into public.user_blocks (user_id, blocked_id) values ($1, $2)', [author, blocked]);
    expect((await as(blocked).post(`/comments/${c.commentId}/ask-kindly`, { reason: 'unkind' })).statusCode).toBe(403);
    await set(false, false, false);
    expect((await as(reader).post(`/comments/${c.commentId}/ask-kindly`, { reason: 'unkind' })).statusCode).toBe(400);
  });
});

describe('Mend', () => {
  it('goes invite → sorry → moderator → delivered → accepted, and the author never learns who asked', async () => {
    await set(false, false, true);
    const [author, hurt, mod] = [await createUser('Mend Author'), await createUser('Mend Hurt'), await createUser('Mend Mod')];
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'moderator')`, [mod]);
    const c = await comment(author);
    const invited = (await as(hurt).post(`/comments/${c.commentId}/mend`)).json().mend;
    expect(invited).toMatchObject({ role: 'hurt', status: 'invited', sorry: null });
    expect((await as(hurt).post(`/comments/${c.commentId}/mend`)).statusCode).toBe(400);
    const notice = (await notices(author, 'mend_invite'))[0]!;
    expect(notice.body).not.toContain('Mend Hurt');

    const sorry = { whatIDid: 'I said you should have known better.', onMe: 'That was unkind and it was on me.', nextTime: "I'll ask before I judge." };
    const mine = (await as(author).get(`/mends/${notice.data.mendId}`)).json().mend;
    expect(mine).toMatchObject({ role: 'author', canRevise: true, author: null });
    expect((await as(author).put(`/mends/${invited.id}/sorry`, sorry)).json().mend.status).toBe('review');
    // Waiting for a moderator: the hurt person doesn't see it yet.
    expect((await as(hurt).get(`/mends/${invited.id}`)).json().mend.sorry).toBeNull();
    expect((await as(hurt).get('/moderation/mends')).statusCode).toBe(403);
    expect((await as(mod).get('/moderation/mends')).json().mends.map((m: { id: string }) => m.id)).toContain(invited.id);

    expect((await as(mod).post(`/moderation/mends/${invited.id}`, { approve: true })).json()).toEqual({ status: 'delivered' });
    expect((await notices(hurt, 'mend_delivered')).length).toBe(1);
    const delivered = (await as(hurt).get(`/mends/${invited.id}`)).json().mend;
    expect(delivered).toMatchObject({ status: 'delivered', sorry, author: { displayName: 'Mend Author' } });
    expect((await as(hurt).post(`/mends/${invited.id}/accept`)).json().mend.status).toBe('accepted');
    expect((await notices(author, 'mend_accepted')).length).toBe(1);
    expect((await as(await createUser('Mend Stranger')).get(`/mends/${invited.id}`)).statusCode).toBe(404);
  });

  it('a moderator can return it once; a second return closes it; the hurt person can withdraw anytime', async () => {
    await set(false, false, true);
    const [author, hurt, mod, hurt2] = [await createUser('Mend2 Author'), await createUser('Mend2 Hurt'), await createUser('Mend2 Mod'), await createUser('Mend2 Hurt2')];
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'moderator')`, [mod]);
    const c = await comment(author);
    const m = (await as(hurt).post(`/comments/${c.commentId}/mend`)).json().mend;
    const sorry = { whatIDid: 'I was rude.', onMe: 'Sorry if you were offended.', nextTime: 'Be nicer.' };
    await as(author).put(`/mends/${m.id}/sorry`, sorry);
    expect((await as(mod).post(`/moderation/mends/${m.id}`, { approve: false, note: 'Try owning it without "if".' })).json().status).toBe('returned');
    expect((await as(author).get(`/mends/${m.id}`)).json().mend.moderatorNote).toBe('Try owning it without "if".');
    await as(author).put(`/mends/${m.id}/sorry`, { ...sorry, onMe: 'It was on me.' });
    expect((await as(mod).post(`/moderation/mends/${m.id}`, { approve: false })).json().status).toBe('closed');
    expect((await as(author).put(`/mends/${m.id}/sorry`, sorry)).statusCode).toBe(400);

    const m2 = (await as(hurt2).post(`/comments/${c.commentId}/mend`)).json().mend;
    expect((await as(hurt2).post(`/mends/${m2.id}/close`)).json().mend.status).toBe('withdrawn');
    expect((await as(author).put(`/mends/${m2.id}/sorry`, sorry)).statusCode).toBe(400);
  });

  it('is never offered for a comment held for harm', async () => {
    await set(false, false, true);
    const [author, hurt] = [await createUser('Mend3 Author'), await createUser('Mend3 Hurt')];
    const c = await comment(author);
    await db.query(`update public.comments set harm_category = 'threat' where id = $1`, [c.commentId]);
    expect((await as(hurt).post(`/comments/${c.commentId}/mend`)).statusCode).toBe(400);
  });
});

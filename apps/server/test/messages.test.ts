import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.query('update public.safety_settings set messages_enabled = true');
  await db.end();
});

describe('prayer messages', () => {
  it('lets the poster and someone who prayed message each other, with notices and unread counts', async () => {
    const hector = await createUser('Hector');
    const ethel = await createUser('Ethel');
    const stranger = await createUser('Stranger');
    const post = await newRequest(hector, 'Please pray for my son Luis, diagnosed with leukemia.');

    // Praying comes first.
    expect((await as(ethel).post(`/posts/${post.id}/conversations`)).statusCode).toBe(403);
    await as(ethel).post(`/posts/${post.id}/praying-now`);
    const { id } = (await as(ethel).post(`/posts/${post.id}/conversations`)).json();
    expect((await as(ethel).post(`/posts/${post.id}/conversations`)).json().id).toBe(id);

    const sent = await as(ethel).post(`/conversations/${id}/messages`, { body: 'I am praying for Luis every day.' });
    expect(sent.statusCode).toBe(201);
    const notes = (await as(hector).get('/me/notifications')).json().notifications;
    expect(notes.some((n: { kind: string; data: { conversationId?: string } }) => n.kind === 'message' && n.data.conversationId === id)).toBe(true);

    const inbox = (await as(hector).get('/me/conversations')).json();
    expect(inbox.unread).toBe(1);
    expect(inbox.conversations[0]).toMatchObject({ id, postId: post.id, unread: true, lastMessage: 'I am praying for Luis every day.' });
    expect(inbox.conversations[0].with.displayName).toBe('Ethel');

    await as(hector).post(`/conversations/${id}/read`);
    expect((await as(hector).get('/me/conversations')).json().unread).toBe(0);
    expect((await as(hector).post(`/conversations/${id}/messages`, { body: 'Thank you, Ethel.' })).statusCode).toBe(201);
    const thread = (await as(ethel).get(`/conversations/${id}`)).json();
    expect(thread.messages.map((m: { body: string; mine: boolean }) => [m.body, m.mine])).toEqual([
      ['I am praying for Luis every day.', true],
      ['Thank you, Ethel.', false],
    ]);

    // Outsiders can't read, write or report it.
    expect((await as(stranger).get(`/conversations/${id}`)).statusCode).toBe(404);
    expect((await as(stranger).post(`/conversations/${id}/messages`, { body: 'hi' })).statusCode).toBe(404);
    const msgId = thread.messages[1].id;
    expect((await as(stranger).post('/reports', { targetType: 'message', targetId: msgId, reason: 'x' })).statusCode).toBe(404);
    expect((await as(ethel).post('/reports', { targetType: 'message', targetId: msgId, reason: 'Harmful or abusive' })).statusCode).toBe(201);
  });

  it('keeps anonymous people anonymous and lets the poster start only with named pray-ers', async () => {
    const poster = await createUser('Quiet Poster');
    const named = await createUser('Named Pray-er');
    const hidden = await createUser('Hidden Pray-er');
    const post = await newRequest(poster, 'Pray for my marriage.', { isAnonymous: true });
    await as(named).post(`/posts/${post.id}/praying-now`);
    await as(hidden).post(`/posts/${post.id}/praying-now`, { isAnonymous: true });

    expect((await as(poster).post(`/posts/${post.id}/conversations`, { withUserId: hidden })).statusCode).toBe(403);
    const { id } = (await as(poster).post(`/posts/${post.id}/conversations`, { withUserId: named })).json();
    await as(poster).post(`/conversations/${id}/messages`, { body: 'Thank you for praying.' });
    const inbox = (await as(named).get('/me/conversations')).json();
    expect(inbox.conversations[0].with).toMatchObject({ displayName: 'Anonymous', id: null });
    // The poster sees who they wrote to.
    expect((await as(poster).get(`/conversations/${id}`)).json().conversation.with.displayName).toBe('Named Pray-er');

    // An anonymous pray-er can still write to the poster, and stays anonymous.
    const h = (await as(hidden).post(`/posts/${post.id}/conversations`)).json();
    await as(hidden).post(`/conversations/${h.id}/messages`, { body: 'Praying for you both.' });
    const posterInbox = (await as(poster).get('/me/conversations')).json().conversations;
    expect(posterInbox.find((c: { id: string }) => c.id === h.id).with.displayName).toBe('Anonymous');
  });

  it('honors blocks, crisis support and the admin switch', async () => {
    const poster = await createUser('Blocker');
    const prayer = await createUser('Blocked');
    const post = await newRequest(poster);
    await as(prayer).post(`/posts/${post.id}/praying-now`);
    const { id } = (await as(prayer).post(`/posts/${post.id}/conversations`)).json();

    const crisis = await as(prayer).post(`/conversations/${id}/messages`, { body: 'Some days I want to die.' });
    expect(crisis.json().message.crisis).toBe(true);
    const { rowCount } = await db.query("select 1 from public.moderation_items where target_type = 'message' and target_id = $1 and source = 'crisis'", [
      crisis.json().message.id,
    ]);
    expect(rowCount).toBe(1);

    expect((await as(poster).put(`/conversations/${id}/block`)).json().blocked).toBe(true);
    expect((await as(prayer).post(`/conversations/${id}/messages`, { body: 'Hello?' })).statusCode).toBe(403);
    expect((await as(poster).post(`/conversations/${id}/messages`, { body: 'Hello?' })).statusCode).toBe(403);
    expect((await as(poster).get(`/conversations/${id}`)).json().conversation.blocked).toBe(true);
    await as(poster).delete(`/conversations/${id}/block`);

    await db.query('update public.safety_settings set messages_enabled = false');
    expect((await as(prayer).post(`/conversations/${id}/messages`, { body: 'Hello?' })).statusCode).toBe(403);
    await db.query('update public.safety_settings set messages_enabled = true');
    expect((await as(prayer).post(`/conversations/${id}/messages`, { body: 'Hello?' })).statusCode).toBe(201);
  });
});

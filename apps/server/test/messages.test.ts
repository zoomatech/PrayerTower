import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as messages from '../src/modules/messages/index.js';
import * as safety from '../src/modules/safety/index.js';
import { as, createUser, db, drainJobs, newRequest, setClassifier } from './helpers.js';

afterAll(async () => {
  setClassifier(async () => null);
  await safety.updateSettings(db, { new_member_limits_enabled: false });
  await db.query('update public.messaging_settings set prayer_messages_enabled = true, direct_requires_mutual_follow = true, request_message_limit = 1, new_members_can_start = false');
  await db.end();
});

const notices = async (userId: string) =>
  (await as(userId).get('/me/notifications')).json().notifications as { kind: string; title: string; data: { conversationId?: string } }[];

describe('pray-er-to-prayee messages', () => {
  it('lets someone who prayed write once, then waits for the requester to reply', async () => {
    const requester = await createUser('Rigby');
    const prayer = await createUser('Ethel');
    const post = await newRequest(requester, 'Pray for my sister, she fell down the stairs.');

    // Must pray first.
    expect((await as(prayer).post(`/posts/${post.id}/messages`, { body: 'Hello' })).statusCode).toBe(403);
    await as(prayer).post(`/posts/${post.id}/praying-now`);
    expect((await as(requester).post(`/posts/${post.id}/messages`, { body: 'me' })).statusCode).toBe(400);

    const start = await as(prayer).post(`/posts/${post.id}/messages`, { body: 'I prayed for your sister this morning.' });
    expect(start.statusCode).toBe(201);
    const { conversationId } = start.json();

    // A second message waits until the requester replies.
    const again = await as(prayer).post(`/conversations/${conversationId}/messages`, { body: 'Any news?' });
    expect(again.statusCode).toBe(429);
    expect(again.json().error).toBe('awaiting_reply');

    const notice = (await notices(requester)).find((n) => n.kind === 'message');
    expect(notice?.title).toBe('Ethel prayed for you and sent a message');
    expect(notice?.data.conversationId).toBe(conversationId);

    const inbox = (await as(requester).get('/me/conversations')).json().conversations;
    expect(inbox[0]).toMatchObject({ id: conversationId, kind: 'prayer', isRequest: true, title: 'Ethel', unread: 1 });

    const view = (await as(requester).get(`/conversations/${conversationId}`)).json();
    expect(view.conversation.post.id).toBe(post.id);
    expect(view.messages.map((m: { body: string }) => m.body)).toEqual(['I prayed for your sister this morning.']);

    // Replying accepts the request; then both can write freely.
    expect((await as(requester).post(`/conversations/${conversationId}/messages`, { body: 'Thank you! She is home.' })).statusCode).toBe(201);
    expect((await as(prayer).post(`/conversations/${conversationId}/messages`, { body: 'Praise God!' })).statusCode).toBe(201);
    const after = (await as(requester).get('/me/conversations')).json().conversations[0];
    expect(after).toMatchObject({ isRequest: false, unread: 1, lastMessage: 'Praise God!' });
    await as(requester).post(`/conversations/${conversationId}/read`);
    expect((await as(requester).get('/me/conversations')).json().conversations[0].unread).toBe(0);

    // Starting again on the same request continues the same thread.
    expect((await as(prayer).post(`/posts/${post.id}/messages`, { body: 'Still praying.' })).json().conversationId).toBe(conversationId);
  });

  it('keeps an anonymous requester and an anonymous pray-er anonymous', async () => {
    const requester = await createUser('Hidden Requester');
    const prayer = await createUser('Quiet Pray-er');
    const post = await newRequest(requester, 'Please pray for me, a hard week.', { isAnonymous: true });
    await as(prayer).post(`/posts/${post.id}/praying-now`);
    const { conversationId } = (await as(prayer).post(`/posts/${post.id}/messages`, { body: 'Praying for you.', isAnonymous: true })).json();

    const mine = (await as(prayer).get(`/conversations/${conversationId}`)).json().conversation;
    expect(mine.members).toEqual([{ id: null, name: 'Anonymous', invited: true, isOwner: false }]);
    const theirs = (await as(requester).get(`/conversations/${conversationId}`)).json();
    expect(theirs.conversation.members[0]).toMatchObject({ id: null, name: 'Anonymous' });
    expect(theirs.messages[0].author).toBe('Anonymous');
    const notice = (await notices(requester)).find((n) => n.kind === 'message');
    expect(notice?.title).toBe('Anonymous prayed for you and sent a message');
  });

  it('lets the requester decline, and then no more messages arrive', async () => {
    const requester = await createUser('Declining Requester');
    const prayer = await createUser('Eager Pray-er');
    const post = await newRequest(requester);
    await as(prayer).post(`/posts/${post.id}/praying-now`);
    const { conversationId } = (await as(prayer).post(`/posts/${post.id}/messages`, { body: 'Hi there' })).json();
    expect((await as(requester).post(`/conversations/${conversationId}/decline`)).statusCode).toBe(200);
    expect((await as(requester).get('/me/conversations')).json().conversations).toEqual([]);
    expect((await as(prayer).post(`/conversations/${conversationId}/messages`, { body: 'Hello?' })).statusCode).toBe(403);
  });

  it('can be limited to people who committed, or turned off', async () => {
    const requester = await createUser('Switch Requester');
    const prayer = await createUser('Switch Pray-er');
    const post = await newRequest(requester);
    await as(prayer).post(`/posts/${post.id}/praying-now`);
    await messages.updateSettings(db, { prayer_messages_any_prayer: false });
    const r = await as(prayer).post(`/posts/${post.id}/messages`, { body: 'Hi' });
    expect(r.statusCode).toBe(403);
    expect(r.json().message).toContain('Commit to pray first');
    await as(prayer).post(`/posts/${post.id}/commitments`, { frequency: 'daily', vowText: 'I vow to pray daily.' });
    expect((await as(prayer).post(`/posts/${post.id}/messages`, { body: 'Hi' })).statusCode).toBe(201);
    await messages.updateSettings(db, { prayer_messages_any_prayer: true, prayer_messages_enabled: false });
    const off = await as(prayer).post(`/posts/${post.id}/messages`, { body: 'Hi' });
    expect(off.statusCode).toBe(403);
    await messages.updateSettings(db, { prayer_messages_enabled: true });
  });
});

describe('blocking', () => {
  it('stops messages both ways and hides the request', async () => {
    const requester = await createUser('Blocker');
    const prayer = await createUser('Pest');
    const post = await newRequest(requester);
    await as(prayer).post(`/posts/${post.id}/praying-now`);
    const { conversationId } = (await as(prayer).post(`/posts/${post.id}/messages`, { body: 'Hey, reply to me' })).json();

    expect((await as(requester).put(`/people/${prayer}/block`)).statusCode).toBe(200);
    expect((await as(requester).get('/me/conversations')).json().conversations).toEqual([]);
    expect((await as(requester).post(`/conversations/${conversationId}/messages`, { body: 'hi' })).statusCode).toBe(403);
    expect((await as(prayer).post(`/posts/${post.id}/messages`, { body: 'again' })).statusCode).toBe(403);
    expect((await as(requester).get('/me/blocks')).json().blocks).toMatchObject([{ id: prayer, displayName: 'Pest' }]);

    expect((await as(requester).delete(`/people/${prayer}/block`)).statusCode).toBe(200);
    expect((await as(requester).get('/me/blocks')).json().blocks).toEqual([]);
  });

  it('hides a blocked member from the feed', async () => {
    const viewer = await createUser('Feed Blocker');
    const other = await createUser('Blocked Poster');
    const post = await newRequest(other, 'A request the viewer should not see after blocking.');
    const seen = async () => {
      for (let page = 0; page < 5; page++) {
        const posts = (await as(viewer).get(`/feed?page=${page}`)).json().posts as { id: string }[];
        if (posts.some((p) => p.id === post.id)) return true;
        if (!posts.length) break;
      }
      return false;
    };
    expect(await seen()).toBe(true);
    await as(viewer).put(`/people/${other}/block`);
    expect(await seen()).toBe(false);
    expect((await as(viewer).get(`/posts/${post.id}`)).statusCode).toBe(404);
  });
});

describe('direct messages', () => {
  it('needs a mutual follow by default, and reuses one conversation', async () => {
    const a = await createUser('Ann');
    const b = await createUser('Ben');
    const r = await as(a).post('/conversations/direct', { userId: b, body: 'Hi Ben' });
    expect(r.statusCode).toBe(403);
    expect(r.json().message).toBe('You can message people who follow you back');

    await as(a).put(`/people/${b}/follow`);
    await as(b).put(`/people/${a}/follow`);
    const first = await as(a).post('/conversations/direct', { userId: b, body: 'Hi Ben' });
    expect(first.statusCode).toBe(201);
    const { conversationId } = first.json();
    // Mutual followers skip the request step.
    expect((await as(b).get('/me/conversations')).json().conversations[0]).toMatchObject({ id: conversationId, kind: 'direct', isRequest: false });
    expect((await as(a).post(`/conversations/${conversationId}/messages`, { body: 'Second' })).statusCode).toBe(201);
    expect((await as(b).post('/conversations/direct', { userId: a, body: 'Hi Ann' })).json().conversationId).toBe(conversationId);
    // A stranger can't read it.
    const c = await createUser('Cal');
    expect((await as(c).get(`/conversations/${conversationId}`)).statusCode).toBe(404);
  });

  it('becomes a message request when mutual follow is not required', async () => {
    await messages.updateSettings(db, { direct_requires_mutual_follow: false });
    const a = await createUser('Dee');
    const b = await createUser('Eve');
    const { conversationId } = (await as(a).post('/conversations/direct', { userId: b, body: 'Hello Eve' })).json();
    expect((await as(b).get('/me/conversations')).json().conversations[0]).toMatchObject({ id: conversationId, isRequest: true });
    expect((await as(a).post(`/conversations/${conversationId}/messages`, { body: 'again' })).statusCode).toBe(429);
    await as(b).post(`/conversations/${conversationId}/accept`);
    expect((await as(a).post(`/conversations/${conversationId}/messages`, { body: 'again' })).statusCode).toBe(201);
    await messages.updateSettings(db, { direct_requires_mutual_follow: true });
  });
});

describe('group chats', () => {
  it('lets members find and join public groups, and keeps private ones invite-only', async () => {
    const owner = await createUser('Group Owner');
    const joiner = await createUser('Joiner');
    const friend = await createUser('Invited Friend');
    const outsider = await createUser('Outsider');

    // Prayer Tower's own first group (Steve, 2026-10-31) is open to everyone.
    const cancer = (await as(joiner).get('/groups')).json().groups.find((g: { title: string }) => g.title === 'Cancer survivors');
    expect(cancer).toMatchObject({ topic: expect.stringContaining('cancer survivors'), joined: false });
    expect((await as(joiner).post(`/conversations/${cancer.id}/join`)).statusCode).toBe(200);
    expect((await as(joiner).post(`/conversations/${cancer.id}/messages`, { body: 'Five years clear this week. Glad to find you all.' })).statusCode).toBe(201);
    expect((await as(outsider).get(`/conversations/${cancer.id}`)).statusCode).toBe(404);
    expect((await as(joiner).post(`/conversations/${cancer.id}/decline`)).statusCode).toBe(200);

    const pub = (await as(owner).post('/conversations/groups', { title: 'Morning prayer circle', topic: 'Pray at 7am together', isPublic: true })).json();
    const groups = (await as(joiner).get('/groups')).json().groups;
    expect(groups.find((g: { id: string }) => g.id === pub.conversationId)).toMatchObject({ title: 'Morning prayer circle', memberCount: 1, joined: false });
    expect((await as(joiner).post(`/conversations/${pub.conversationId}/join`)).statusCode).toBe(200);
    expect((await as(joiner).post(`/conversations/${pub.conversationId}/messages`, { body: 'Good morning all' })).statusCode).toBe(201);
    // Group messages don't need a reply first, and don't push.
    expect((await as(joiner).post(`/conversations/${pub.conversationId}/messages`, { body: 'Praying now' })).statusCode).toBe(201);
    expect((await notices(owner)).some((n) => n.kind === 'message')).toBe(false);
    const view = (await as(owner).get(`/conversations/${pub.conversationId}`)).json();
    expect(view.messages.map((m: { author: string }) => m.author)).toEqual(['Joiner', 'Joiner']);

    const priv = (await as(owner).post('/conversations/groups', { title: 'Family', memberIds: [friend] })).json();
    expect(priv.invited).toBe(1);
    expect((await notices(friend)).some((n) => n.kind === 'group_invite')).toBe(true);
    expect((await as(outsider).post(`/conversations/${priv.conversationId}/join`)).statusCode).toBe(403);
    expect((await as(outsider).get(`/conversations/${priv.conversationId}`)).statusCode).toBe(404);
    expect((await as(outsider).get('/groups')).json().groups.some((g: { id: string }) => g.id === priv.conversationId)).toBe(false);
    expect((await as(friend).get('/me/conversations')).json().conversations[0]).toMatchObject({ id: priv.conversationId, isRequest: true, title: 'Family' });
    expect((await as(friend).post(`/conversations/${priv.conversationId}/join`)).statusCode).toBe(200);
    // Only the owner invites to a private group.
    expect((await as(friend).post(`/conversations/${priv.conversationId}/invite`, { userIds: [outsider] })).statusCode).toBe(403);

    expect((await as(joiner).post(`/conversations/${pub.conversationId}/decline`)).statusCode).toBe(200);
    expect((await as(joiner).post(`/conversations/${pub.conversationId}/messages`, { body: 'hi' })).statusCode).toBe(403);
  });
});

describe('message safety', () => {
  it('sends reported messages to the moderation queue, and removal hides them', async () => {
    const owner = await createUser('Safety Owner');
    const troll = await createUser('Troll');
    const mod = await createUser('Message Moderator');
    await grantRole(db, mod, 'moderator', null);
    const { conversationId } = (await as(owner).post('/conversations/groups', { title: 'Open group', isPublic: true })).json();
    await as(troll).post(`/conversations/${conversationId}/join`);
    const sent = (await as(troll).post(`/conversations/${conversationId}/messages`, { body: 'Buy my product at a discount' })).json().message;

    // Only members can report a message.
    const outsider = await createUser('Not A Member');
    expect((await as(outsider).post('/reports', { targetType: 'message', targetId: sent.id, reason: 'spam' })).statusCode).toBe(404);
    expect((await as(owner).post('/reports', { targetType: 'message', targetId: sent.id, reason: 'This is an ad' })).statusCode).toBe(201);

    const item = (await as(mod).get(`/moderation/queue?targetId=${sent.id}`)).json().items.find((i: { target_id: string }) => i.target_id === sent.id);
    expect(item).toMatchObject({ target_type: 'message', content: 'Buy my product at a discount' });
    expect((await as(mod).post(`/moderation/items/${item.id}/decision`, { action: 'remove', rule: 'ads' })).statusCode).toBe(200);
    expect((await as(owner).get(`/conversations/${conversationId}`)).json().messages).toEqual([]);
    const notice = (await notices(troll)).find((n) => n.kind === 'moderation_notice');
    expect(notice?.title).toBe('Your message was removed');
  });

  it('flags crisis messages for a person, and lets the AI auto-hide the worst', async () => {
    const a = await createUser('Crisis A');
    const b = await createUser('Crisis B');
    await as(a).put(`/people/${b}/follow`);
    await as(b).put(`/people/${a}/follow`);
    const r = (await as(a).post('/conversations/direct', { userId: b, body: "I don't want to live anymore" })).json();
    expect(r.message.crisis).toBe(true);
    const { rows } = await db.query(`select 1 from public.moderation_items where target_type = 'message' and target_id = $1 and source = 'crisis'`, [r.message.id]);
    expect(rows).toHaveLength(1);
    expect((await as(b).get(`/conversations/${r.conversationId}`)).json().messages[0].crisis).toBe(true);

    setClassifier(async () => ({ flagged: true, categories: { 'harassment/threatening': true }, category_scores: {} }));
    const bad = (await as(b).post(`/conversations/${r.conversationId}/messages`, { body: 'a threatening message' })).json().message;
    await drainJobs();
    setClassifier(async () => null);
    const hidden = await db.query('select moderation_status from public.messages where id = $1', [bad.id]);
    expect(hidden.rows[0].moderation_status).toBe('hidden_pending_review');
  });

  it("doesn't let new members start conversations or send links", async () => {
    await safety.updateSettings(db, { new_member_limits_enabled: true, new_member_hours: 24, new_member_min_prayers: 0, new_member_links_allowed: false });
    try {
      const newbie = await createUser('Newbie');
      const veteran = await createUser('Veteran');
      await db.query(`update public.profiles set created_at = now() - interval '30 days' where id = $1`, [veteran]);
      const r = await as(newbie).post('/conversations/groups', { title: 'New group' });
      expect(r.statusCode).toBe(403);
      expect(r.json().message).toContain("New members can't start conversations");

      // A new member can still reply, without links.
      const post = await newRequest(newbie, 'Newbie request for prayer.');
      await as(veteran).post(`/posts/${post.id}/praying-now`);
      const { conversationId } = (await as(veteran).post(`/posts/${post.id}/messages`, { body: 'Praying for you!' })).json();
      expect((await as(newbie).post(`/conversations/${conversationId}/messages`, { body: 'see www.example.com' })).statusCode).toBe(403);
      expect((await as(newbie).post(`/conversations/${conversationId}/messages`, { body: 'Thank you so much' })).statusCode).toBe(201);
    } finally {
      await safety.updateSettings(db, { new_member_limits_enabled: false });
    }
  });

  it('lets admins change the messaging switches', async () => {
    const admin = await createUser('Messaging Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Not Admin');
    expect((await as(member).patch('/admin/messaging-settings', { groupsEnabled: false })).statusCode).toBe(403);
    const r = await as(admin).patch('/admin/messaging-settings', { groupsEnabled: false, requestMessageLimit: 2 });
    expect(r.json().settings).toMatchObject({ groups_enabled: false, request_message_limit: 2 });
    expect((await as(admin).post('/conversations/groups', { title: 'Nope' })).statusCode).toBe(403);
    await as(admin).patch('/admin/messaging-settings', { groupsEnabled: true, requestMessageLimit: 1 });
  });
});

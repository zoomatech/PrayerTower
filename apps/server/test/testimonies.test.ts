import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

describe('answered-prayer testimonies', () => {
  it('the poster shares a testimony; pray-ers hear once; it shows in the Testimonies filter', async () => {
    const poster = await createUser('Hannah Answered');
    const prayer = await createUser('Eli Prayer');
    const other = await createUser('Other Reader');
    const post = await newRequest(poster, 'Pray that we can have a child.');
    await as(prayer).post(`/posts/${post.id}/praying-now`, {});

    // Only on an answered request, and only by the poster.
    expect((await as(poster).put(`/posts/${post.id}/testimony`, { body: 'Too early' })).statusCode).toBe(400);
    const answered = await as(poster).post(`/posts/${post.id}/answered`, { testimony: 'Our son Samuel was born this morning. God heard us!' });
    expect(answered.statusCode).toBe(200);
    expect(answered.json().post).toMatchObject({ state: 'answered', testimony: 'Our son Samuel was born this morning. God heard us!' });
    expect((await as(other).put(`/posts/${post.id}/testimony`, { body: 'Not mine' })).statusCode).toBe(403);

    const notices = (await as(prayer).get('/me/notifications')).json().notifications.filter((n: { kind: string }) => n.kind === 'testimony');
    expect(notices).toHaveLength(1);
    expect(notices[0].title).toBe('A prayer you prayed was answered');
    expect(notices[0].body).toContain('Hannah Answered shared what God did');
    // Editing doesn't notify again.
    await as(poster).put(`/posts/${post.id}/testimony`, { body: 'Samuel was born healthy. Thank you all for praying!' });
    expect((await as(prayer).get('/me/notifications')).json().notifications.filter((n: { kind: string }) => n.kind === 'testimony')).toHaveLength(1);

    const plain = await newRequest(other, 'Pray for my exam.');
    const feed = (await as(other).get('/feed?filter=testimonies')).json();
    const ids = feed.posts.map((p: { id: string }) => p.id);
    expect(ids).toContain(post.id);
    expect(ids).not.toContain(plain.id);
    expect(feed.posts.find((p: { id: string }) => p.id === post.id).testimony).toBe('Samuel was born healthy. Thank you all for praying!');
    expect((await as(other).get('/feed?filter=nope')).statusCode).toBe(400);

    await as(poster).delete(`/posts/${post.id}/testimony`);
    expect((await as(other).get('/feed?filter=testimonies')).json().posts.some((p: { id: string }) => p.id === post.id)).toBe(false);
  });

  it('an anonymous poster stays anonymous in the notice', async () => {
    const poster = await createUser('Secret Sarah');
    const prayer = await createUser('Faithful Fred');
    const post = await newRequest(poster, 'Pray for my marriage.', { isAnonymous: true });
    await as(prayer).post(`/posts/${post.id}/praying-now`, {});
    await as(poster).post(`/posts/${post.id}/answered`, { testimony: 'We reconciled.' });
    const notice = (await as(prayer).get('/me/notifications')).json().notifications.find((n: { kind: string }) => n.kind === 'testimony');
    expect(notice.body).toBe('Someone shared what God did: "We reconciled."');
  });
});

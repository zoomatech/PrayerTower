// Sharing with consent (docs/GROWTH.md): nothing leaves the app unless its author said so.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as growth from '../src/modules/growth/index.js';
import { app, as, createUser, db, newRequest } from './helpers.js';

const RELIGIOUS = /\b(pray\w*|god|lord|jesus|church|pastors?|priestly|scripture|blessed)\b/i;
let admin: string;

beforeEach(async () => {
  admin ??= await createUser('Share Admin');
  await grantRole(db, admin, 'admin', null);
  await as(admin).patch('/admin/growth-settings', { shareConsentEnabled: true, guestPrayerEnabled: false });
});

afterAll(async () => {
  await growth.updateSettings(db, { shareConsentEnabled: false, guestPrayerEnabled: false });
  await db.query(`update public.communities set status = 'hidden', hidden_features = '{}' where slug = 'open-circle'`);
  await db.end();
});

describe('sharing with consent', () => {
  it('is off by default: no state, no choice, no card', async () => {
    await as(admin).patch('/admin/growth-settings', { shareConsentEnabled: false });
    const member = await createUser('Off Sharer');
    const post = await newRequest(member);
    expect((await as(member).get('/features')).json().features.shareConsent).toBe(false);
    expect((await as(member).get(`/posts/${post.id}/share`)).json().share).toBeNull();
    expect((await as(member).put(`/posts/${post.id}/share`, { level: 'card' })).statusCode).toBe(403);
  });

  it('keeps a post private until its author chooses, and only the author chooses', async () => {
    const author = await createUser('Martha Keeper');
    const friend = await createUser('Friend Reader');
    const post = await newRequest(author);
    expect((await as(author).get(`/posts/${post.id}/share`)).json().share).toMatchObject({ mine: true, level: 'private', canShare: true, words: false, path: `/post/${post.id}` });
    expect((await as(friend).get(`/posts/${post.id}/share`)).json().share).toMatchObject({ mine: false, level: 'private', canShare: false });
    expect((await as(friend).put(`/posts/${post.id}/share`, { level: 'card' })).statusCode).toBe(403);

    await as(author).put(`/posts/${post.id}/share`, { level: 'link' });
    expect((await as(friend).get(`/posts/${post.id}/share`)).json().share).toMatchObject({ level: 'link', canShare: true, words: false, path: `/post/${post.id}` });
  });

  it('shows a card with the words and first name, then kills the link when made private again', async () => {
    const author = await createUser('Martha Jane Doe');
    const friend = await createUser('Card Friend');
    const post = await newRequest(author, 'Please pray for my sister in the hospital.');
    const share = (await as(author).put(`/posts/${post.id}/share`, { level: 'card' })).json().share;
    expect(share).toMatchObject({ level: 'card', words: true });
    expect(share.path).toMatch(/^\/card\/[A-Za-z0-9_-]{20,}$/);
    expect((await as(friend).get(`/posts/${post.id}/share`)).json().share.path).toBe(share.path);
    const page = await app.inject({ method: 'GET', url: share.path });
    expect(page.statusCode).toBe(200);
    expect(page.headers['x-robots-tag']).toBe('noindex');
    expect(page.body).toContain('my sister in the hospital');
    expect(page.body).toContain('Martha asked for prayer');
    expect(page.body).not.toContain('Doe');
    // Changing from card to link and back keeps one link; private kills it for good.
    await as(author).put(`/posts/${post.id}/share`, { level: 'link' });
    expect((await app.inject({ method: 'GET', url: share.path })).statusCode).toBe(404);
    await as(author).put(`/posts/${post.id}/share`, { level: 'card' });
    expect((await app.inject({ method: 'GET', url: share.path })).statusCode).toBe(200);
    await as(author).put(`/posts/${post.id}/share`, { level: 'private' });
    expect((await app.inject({ method: 'GET', url: share.path })).statusCode).toBe(404);
    const again = (await as(author).put(`/posts/${post.id}/share`, { level: 'card' })).json().share;
    expect(again.path).not.toBe(share.path);
    // Switched off, every card is gone.
    await as(admin).patch('/admin/growth-settings', { shareConsentEnabled: false });
    expect((await app.inject({ method: 'GET', url: again.path })).statusCode).toBe(404);
  });

  it('never names the author of an anonymous post, and links to the guest page when there is one', async () => {
    await as(admin).patch('/admin/growth-settings', { guestPrayerEnabled: true });
    const author = await createUser('Hidden Hannah');
    const post = await newRequest(author, 'Struggling with work stress lately.', { isAnonymous: true });
    const { path } = (await as(author).put(`/posts/${post.id}/share`, { level: 'card' })).json().share;
    let page = await app.inject({ method: 'GET', url: path });
    expect(page.body).toContain('Someone asked for prayer');
    expect(page.body).not.toContain('Hannah');
    expect(page.body).not.toContain('/pray/');
    const link = (await as(author).post(`/posts/${post.id}/guest-link`)).json().link;
    page = await app.inject({ method: 'GET', url: path });
    expect(page.body).toContain(link.path);
  });

  it('refuses a card for a crisis post, and hides posts from people who cannot see them', async () => {
    const author = await createUser('Crisis Author');
    const post = await newRequest(author);
    await db.query('update public.posts set crisis = true where id = $1', [post.id]);
    expect((await as(author).put(`/posts/${post.id}/share`, { level: 'card' })).statusCode).toBe(400);
    expect((await as(author).get(`/posts/${post.id}/share`)).json().share.cardAllowed).toBe(false);
    await as(admin).patch('/admin/communities/open-circle', { status: 'active' });
    const outsider = await createUser('Other Circle');
    await as(outsider).post('/me/community', { slug: 'open-circle' });
    expect((await as(outsider).get(`/posts/${post.id}/share`)).statusCode).toBe(404);
  });

  it('uses Open Circle wording and brand on an Open Circle card', async () => {
    await as(admin).patch('/admin/communities/open-circle', { status: 'active' });
    const author = await createUser('Robin Card');
    await as(author).post('/me/community', { slug: 'open-circle' });
    const post = await newRequest(author, 'Big exam on Friday, nervous.');
    const { path } = (await as(author).put(`/posts/${post.id}/share`, { level: 'card' })).json().share;
    const page = await app.inject({ method: 'GET', url: path });
    expect(page.body).toContain('Open Circle');
    expect(page.body.replace(/<[^>]+>/g, ' ')).not.toMatch(RELIGIOUS);
  });
});

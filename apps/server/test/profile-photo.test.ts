import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { cards } from '../src/modules/posts/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(() => db.end());

const photoOf = async (id: string) => (await db.query<{ photo_path: string | null }>('select photo_path from public.profiles where id = $1', [id])).rows[0]!.photo_path;

describe('profile photo', () => {
  it('takes only an image from the member’s own upload folder, and clears it', async () => {
    const member = await createUser('Photo Member');
    const other = await createUser('Photo Other');
    expect((await as(member).put('/me/photo', { storagePath: `${other}/${randomUUID()}.jpg` })).statusCode).toBe(400);
    expect((await as(member).put('/me/photo', { storagePath: `${member}/${randomUUID()}.mp4` })).statusCode).toBe(400);
    const path = `${member}/${randomUUID()}.jpg`;
    expect((await as(member).put('/me/photo', { storagePath: path })).statusCode).toBe(200);
    expect(await photoOf(member)).toBe(path);
    expect((await as(member).delete('/me/photo')).statusCode).toBe(200);
    expect(await photoOf(member)).toBeNull();
  });

  it('never leaks the storage path on a card, nor shows the photo on an anonymous post', async () => {
    const member = await createUser('Photo Poster');
    const viewer = await createUser('Photo Viewer');
    await as(member).put('/me/photo', { storagePath: `${member}/${randomUUID()}.png` });
    const open = (await as(member).post('/posts', { postType: 'prayer_request', body: 'Pray for my sister this week, please.' })).json().post.id as string;
    const anon = (await as(member).post('/posts', { postType: 'prayer_request', body: 'Pray for me quietly this week, please.', isAnonymous: true })).json().post.id as string;
    const byId = Object.fromEntries((await cards(db, [open, anon], viewer)).map((c) => [c.id, c.author as Record<string, unknown>]));
    expect(byId[open]!.photoPath).toBeTruthy();
    expect(byId[anon]!.photoPath).toBeUndefined();
    const feed = (await as(viewer).get(`/posts/${open}`)).json().post.author as Record<string, unknown>;
    expect(feed.photoPath).toBeUndefined();
  });
});

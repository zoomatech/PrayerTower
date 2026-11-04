// Video circles (docs/VIDEO_CIRCLES.md): a moderator offers a private video circle about
// a Mend. The hurt person is asked first, the author only if they say yes, and the room
// opens only for those two and the moderator.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { settings as practiceSettings } from '../src/modules/practices/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const practice = await practiceSettings(db);
let admin: string;
let moderator: string;

beforeAll(async () => {
  admin = await createUser('Circle Admin');
  await grantRole(db, admin, 'admin', null);
  moderator = await createUser('Circle Moderator');
  await grantRole(db, moderator, 'moderator', null);
});
afterAll(async () => {
  await db.query('update public.live_settings set circles_enabled = false, jitsi_url = null');
  await db.query('update public.practice_settings set mend_enabled = $1', [practice.mend_enabled]);
  await db.end();
});

/** A comment that hurt someone, and the Mend the hurt person opened about it. */
async function mendFor(hurt: string, author: string) {
  const post = await newRequest(hurt, `Please pray for my mother's recovery ${Math.random()}`);
  const c = (
    await as(author).post(`/posts/${post.id}/comments`, {
      body: 'Everything happens for a reason.',
    })
  ).json().comment.id;
  return (await as(hurt).post(`/comments/${c}/mend`)).json().mend.id as string;
}

const kinds = async (user: string) =>
  (await db.query<{ kind: string; title: string }>(`select kind, title from public.notifications where user_id = $1 and kind = 'video_circle' order by created_at`, [user])).rows.map((r) => r.title);

describe('video circles', () => {
  it('are off by default, and only moderators offer them', async () => {
    await db.query('update public.practice_settings set mend_enabled = true');
    const hurt = await createUser('Circle Hurt');
    const author = await createUser('Circle Author');
    const mendId = await mendFor(hurt, author);
    expect((await as(hurt).get(`/mends/${mendId}/video-circle`)).json()).toEqual({ circle: null });
    expect((await as(moderator).post(`/moderation/mends/${mendId}/video-circle`, {})).statusCode).toBe(400);
    expect((await as(hurt).get('/features')).json().features.videoCircles).toBe(false);

    expect(
      (
        await as(moderator).patch('/admin/live-settings', {
          circlesEnabled: true,
        })
      ).statusCode,
    ).toBe(403);
    await as(admin).patch('/admin/live-settings', { circlesEnabled: true });
    expect((await as(hurt).get('/features')).json().features.videoCircles).toBe(true);
    // No video server yet: nobody is asked to say yes to a circle that can't open.
    const none = await as(moderator).post(`/moderation/mends/${mendId}/video-circle`, {});
    expect(none.statusCode).toBe(400);
    expect(none.json().message).toMatch(/No video server/);
    await as(admin).patch('/admin/live-settings', {
      jitsiUrl: 'https://meet.example.org',
    });
    expect((await as(hurt).post(`/moderation/mends/${mendId}/video-circle`, {})).statusCode).toBe(403);
    expect((await as(author).post(`/moderation/mends/${mendId}/video-circle`, {})).statusCode).toBe(403);
  });

  it('asks the hurt person first, then the author, and gives the room only to the three of them', async () => {
    const hurt = await createUser('Circle Hurt 2');
    const author = await createUser('Circle Author 2');
    const other = await createUser('Circle Stranger');
    const mendId = await mendFor(hurt, author);

    const offered = await as(moderator).post(`/moderation/mends/${mendId}/video-circle`, { note: 'Fifteen minutes, just to listen.' });
    expect(offered.statusCode, offered.body).toBe(200);
    const id = offered.json().circle.id;
    expect((await as(moderator).post(`/moderation/mends/${mendId}/video-circle`, {})).json().message).toMatch(/already open/);

    // The author hears nothing until the hurt person says yes.
    expect((await as(author).get(`/mends/${mendId}/video-circle`)).json()).toEqual({ circle: null });
    expect(await kinds(author)).toEqual([]);
    expect(await kinds(hurt)).toEqual(['Would you like to talk it through?']);
    expect((await as(other).get(`/mends/${mendId}/video-circle`)).json()).toEqual({ circle: null });

    const asked = (await as(hurt).get(`/mends/${mendId}/video-circle`)).json().circle;
    expect(asked).toMatchObject({
      role: 'hurt',
      status: 'asked_hurt',
      canAnswer: true,
      note: 'Fifteen minutes, just to listen.',
      roomUrl: null,
    });
    expect(asked.questions[0]).toMatch(/What did you think/);
    expect((await as(author).post(`/video-circles/${id}/answer`, { join: true })).statusCode).toBe(404);

    await as(hurt).post(`/video-circles/${id}/answer`, { join: true });
    expect(await kinds(author)).toEqual(['A video circle about your comment']);
    const authorView = (await as(author).get(`/mends/${mendId}/video-circle`)).json().circle;
    expect(authorView).toMatchObject({
      role: 'author',
      status: 'asked_author',
      canAnswer: true,
      roomUrl: null,
    });
    expect(authorView.questions[0]).toBe('What happened?');

    const ready = (await as(author).post(`/video-circles/${id}/answer`, { join: true })).json().circle;
    expect(ready.status).toBe('ready');
    expect(ready.roomUrl).toMatch(/^https:\/\/meet\.example\.org\/PrayerTower-[\w-]{16}$/);
    for (const u of [hurt, moderator]) expect((await as(u).get(`/mends/${mendId}/video-circle`)).json().circle.roomUrl).toBe(ready.roomUrl);
    expect((await as(other).get(`/mends/${mendId}/video-circle`)).json()).toEqual({ circle: null });
    // Never listed under Live now.
    await db.query('update public.live_settings set enabled = true');
    expect((await as(hurt).get('/live')).json().rooms).toEqual([]);
    await db.query('update public.live_settings set enabled = false');

    expect((await as(hurt).post(`/video-circles/${id}/end`)).statusCode).toBe(403);
    expect((await as(moderator).post(`/video-circles/${id}/end`)).json().circle).toMatchObject({ status: 'ended', roomUrl: null });
    // A new one can be offered after it ended.
    expect((await as(moderator).post(`/moderation/mends/${mendId}/video-circle`, {})).statusCode).toBe(200);
  });

  it('keeps it from the author when the hurt person says no, and tells the hurt person kindly when the author says no', async () => {
    const hurt = await createUser('Circle Hurt 3');
    const author = await createUser('Circle Author 3');
    const mendId = await mendFor(hurt, author);
    const id = (await as(moderator).post(`/moderation/mends/${mendId}/video-circle`, {})).json().circle.id;
    expect((await as(hurt).post(`/video-circles/${id}/answer`, { join: false })).json().circle).toMatchObject({ status: 'declined', canAnswer: false });
    expect((await as(author).get(`/mends/${mendId}/video-circle`)).json()).toEqual({ circle: null });
    expect(await kinds(author)).toEqual([]);
    expect(await kinds(moderator)).toContain("The circle won't happen");

    const id2 = (await as(moderator).post(`/moderation/mends/${mendId}/video-circle`, {})).json().circle.id;
    await as(hurt).post(`/video-circles/${id2}/answer`, { join: true });
    expect((await as(author).post(`/video-circles/${id2}/answer`, { join: false })).json().circle.status).toBe('declined');
    expect(await kinds(hurt)).toContain("The circle won't happen");
  });

  it('is never offered across a block, or after the hurt person withdrew', async () => {
    const hurt = await createUser('Circle Hurt 4');
    const author = await createUser('Circle Author 4');
    const mendId = await mendFor(hurt, author);
    await db.query('insert into public.user_blocks (user_id, blocked_id) values ($1, $2)', [author, hurt]);
    expect((await as(moderator).post(`/moderation/mends/${mendId}/video-circle`, {})).json().message).toMatch(/blocked/);
    await db.query('delete from public.user_blocks where user_id = $1', [author]);
    await as(hurt).post(`/mends/${mendId}/close`);
    expect((await as(moderator).post(`/moderation/mends/${mendId}/video-circle`, {})).json().message).toMatch(/withdrew/);
  });
});

// Cross-posting: a member's own Facebook and Threads posts copied to their Prayer
// Tower account, by the browser extension or a connected account. Off by default;
// the "on" tests switch it on for this file only and switch it back off after.
import { createHmac, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { withTx } from '../src/db.js';
import * as crosspost from '../src/modules/crosspost/index.js';
import * as meta from '../src/modules/crosspost/meta.js';
import { crosspostPublicRoutes } from '../src/modules/crosspost/routes.js';
import * as notebook from '../src/modules/notebook/index.js';
import { app, as, createUser, db, drainJobs } from './helpers.js';

const opts: meta.CrosspostOptions = {
  publicUrl: 'https://api.prayertower.example',
  tokenKey: 'k'.repeat(40),
  threads: { appId: '111', appSecret: 'threads-secret', verifyToken: 'verify-token-0123456789' },
  facebook: { appId: '222', appSecret: 'facebook-secret', graphVersion: 'v26.0' },
};
// The smallest JPEG header the type check accepts.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
// And the start of an MP4 file (an "ftyp" box with the isom brand).
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(12)]);
const stored: string[] = [];
const store: crosspost.MediaStore = async (userId, _bytes, type) => {
  const path = `${userId}/${randomUUID()}.${crosspost.MEDIA_TYPES[type]}`;
  stored.push(path);
  return path;
};

/** A stand-in for Meta's servers: answers by URL. */
function fakeMeta(routes: Record<string, unknown>, calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response(JSON.stringify({ error: { message: `no route for ${url}`, code: 100 } }), { status: 400 });
    const body = routes[key];
    if (Buffer.isBuffer(body)) return new Response(new Uint8Array(body), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

const withKeys = buildApp({ db, verifyToken: async (t) => t.slice(5), crosspost: opts });
const extensionApp = Fastify();
extensionApp.register(async (open) => crosspostPublicRoutes(open, db, opts, store));
const bearer = (userId: string) => ({ authorization: `Bearer test:${userId}` });

afterAll(async () => {
  await notebook.updateSettings(db, { crosspostEnabled: false });
  await db.end();
});

describe('Cross-posting while off (the default)', () => {
  it('shows nothing, refuses keys and refuses the extension', async () => {
    const member = await createUser('Off Poster');
    expect((await as(member).get('/crosspost')).json()).toMatchObject({ enabled: false, accounts: [] });
    expect((await as(member).post('/crosspost/extension-key')).statusCode).toBe(403);
    const res = await app.inject({ method: 'POST', url: '/crosspost/extension/posts', headers: { 'x-crosspost-key': 'ptx_nope' }, payload: { source: 'facebook', text: 'hi' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('Cross-posting while on', () => {
  beforeAll(() => notebook.updateSettings(db, { crosspostEnabled: true }));

  it('copies a post the extension sends, with its photo, to the member’s own account', async () => {
    const member = await createUser('Extension Poster');
    const status = (await as(member).get('/crosspost')).json();
    expect(status).toMatchObject({ enabled: true, connectable: { facebook: false, threads: false }, extensionKeyHint: null });
    const { key } = (await as(member).post('/crosspost/extension-key')).json();
    expect(key).toMatch(/^ptx_/);
    expect((await as(member).get('/crosspost')).json().extensionKeyHint).toBe(key.slice(-4));

    const send = (payload: object, k = key) => extensionApp.inject({ method: 'POST', url: '/crosspost/extension/posts', headers: { 'x-crosspost-key': k }, payload });
    expect((await send({ source: 'facebook', text: 'x' }, 'ptx_wrong')).statusCode).toBe(401);
    const first = await send({ source: 'facebook', text: 'Beautiful morning at the lake with the kids!', pageUrl: 'https://www.facebook.com/', media: [{ data: JPEG.toString('base64') }, { data: Buffer.from('not an image').toString('base64') }] });
    expect(first.statusCode).toBe(201);
    const postId = first.json().postId;
    // The same post again (a double click) is not copied twice.
    expect((await send({ source: 'facebook', text: 'Beautiful morning at the lake with the kids!', media: [{ data: JPEG.toString('base64') }] })).json()).toEqual({ status: 'duplicate' });

    const card = (await as(member).get(`/posts/${postId}`)).json().post;
    expect(card).toMatchObject({ body: 'Beautiful morning at the lake with the kids!', crosspostedFrom: 'facebook', isMine: true });
    expect(card.media).toHaveLength(1);
    expect(card.media[0].storagePath).toBe(stored.at(-1));
    expect(['discussion', 'testimony']).toContain(card.postType);

    // A video with no words gets a short caption.
    const video = await send({ source: 'threads', text: '', media: [{ data: MP4.toString('base64') }] });
    expect(video.statusCode).toBe(201);
    const videoCard = (await as(member).get(`/posts/${video.json().postId}`)).json().post;
    expect(videoCard).toMatchObject({ body: 'Video', crosspostedFrom: 'threads' });
    expect(videoCard.media).toMatchObject([{ kind: 'video' }]);
    expect(stored.at(-1)).toMatch(/\.mp4$/);

    // Revoking the key stops the extension.
    await as(member).delete('/crosspost/extension-key');
    expect((await send({ source: 'threads', text: 'Another one' })).statusCode).toBe(401);
  });

  it('skips repeats, empty posts and paused members, and remembers why', async () => {
    const member = await createUser('Careful Poster');
    const base = { source: 'threads' as const, via: 'account' as const, text: 'Grateful for good friends today.' };
    const c = await db.connect();
    try {
      await c.query('begin');
      expect(await crosspost.importPost(c, member, { ...base, externalId: 't1' }, null)).toMatchObject({ status: 'posted' });
      // Seen by the extension and by the connected account: copied once.
      expect(await crosspost.importPost(c, member, { ...base, source: 'facebook', via: 'extension', externalId: 'ext:1', text: '  grateful for GOOD friends   today. ' }, null)).toEqual({ status: 'skipped', reason: 'Already copied' });
      expect(await crosspost.importPost(c, member, { ...base, externalId: 't1' }, null)).toEqual({ status: 'duplicate' });
      expect(await crosspost.importPost(c, member, { ...base, externalId: 't2', text: '   ' }, null)).toEqual({ status: 'skipped', reason: 'Nothing to post' });
      await crosspost.updateSettings(c, member, { paused: true });
      expect(await crosspost.importPost(c, member, { ...base, externalId: 't3', text: 'While paused' }, null)).toEqual({ status: 'skipped', reason: 'Paused' });
      await crosspost.updateSettings(c, member, { paused: false, postType: 'praise' });
      const praised = await crosspost.importPost(c, member, { ...base, externalId: 't4', text: 'Got the job!' }, null);
      const { rows } = await c.query('select post_type from public.posts where id = $1', [(praised as { postId: string }).postId]);
      expect(rows[0].post_type).toBe('praise');
      await c.query('commit');
    } finally {
      c.release();
    }
    const s = (await as(member).get('/crosspost')).json();
    expect(s.recent.map((r: { status: string; reason: string | null }) => r.reason ?? r.status)).toEqual(['posted', 'Paused', 'Nothing to post', 'Already copied', 'posted']);
    expect((await as(member).patch('/crosspost/settings', { postType: 'confessional_x' })).statusCode).toBe(400);
  });

  it('copies a post once even when the webhook, the check and the extension bring it in together', async () => {
    const member = await createUser('Racing Poster');
    const item = { source: 'threads' as const, via: 'account' as const, externalId: 'race-1', text: 'Same post, three ways at once' };
    const results = await Promise.all([
      withTx(db, (tx) => crosspost.importPost(tx, member, item, null)),
      withTx(db, (tx) => crosspost.importPost(tx, member, item, null)),
      withTx(db, (tx) => crosspost.importPost(tx, member, { ...item, via: 'extension', source: 'facebook', externalId: 'ext:race' }, null)),
    ]);
    expect(results.filter((r) => r.status === 'posted')).toHaveLength(1);
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.posts where user_id = $1', [member]);
    expect(rows[0]!.n).toBe(1);
  });

  it('keeps long posts within the post limits', () => {
    expect(crosspost.fitBody(Array(1200).fill('word').join(' ')).split(' ')).toHaveLength(1000);
    expect(crosspost.fitBody('a'.repeat(12_000)).length).toBeLessThanOrEqual(10_000);
  });

  it('connects Threads, copies new posts with photos, refreshes the token and stops on an expired one', async () => {
    const member = await createUser('Threads Poster');
    // "Connect Threads" is refused until the server has the keys.
    expect((await as(member).post('/crosspost/threads/connect')).statusCode).toBe(503);
    const res = await withKeys.inject({ method: 'POST', url: '/crosspost/threads/connect', headers: bearer(member) });
    const url = new URL(res.json().url);
    expect(url.origin + url.pathname).toBe('https://threads.com/oauth/authorize');
    expect(url.searchParams.get('scope')).toBe('threads_basic');
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.prayertower.example/crosspost/threads/callback');
    const state = url.searchParams.get('state')!;

    const threadsUser = String(Date.now());
    const signIn = fakeMeta({
      '/oauth/access_token': { access_token: 'short', user_id: threadsUser },
      '/access_token?grant_type=th_exchange_token': { access_token: 'long-token', expires_in: 5_184_000 },
      '/v1.0/me?': { id: threadsUser, username: 'poster' },
    });
    const c = await db.connect();
    try {
      await expect(meta.finishConnect(c, 'threads', 'forged-state', 'code', opts, signIn)).rejects.toThrow(/expired/);
      expect(await meta.finishConnect(c, 'threads', state, 'code#_', opts, signIn)).toMatchObject({ userId: member, username: 'poster' });
    } finally {
      c.release();
    }
    const { rows } = await db.query<{ id: string; access_token: string }>("select id, access_token from public.crosspost_accounts where user_id = $1 and provider = 'threads'", [member]);
    expect(rows[0]!.access_token).not.toContain('long-token');
    expect(meta.openToken(opts.tokenKey!, rows[0]!.access_token)).toBe('long-token');
    // Pretend the account was connected a while ago, so these posts count as new.
    await db.query("update public.crosspost_accounts set import_since = now() - interval '1 day', token_refreshed_at = now() - interval '2 days', token_expires_at = now() + interval '5 days' where id = $1", [rows[0]!.id]);

    const now = new Date().toISOString();
    const calls: string[] = [];
    const threads = fakeMeta(
      {
        '/refresh_access_token': { access_token: 'refreshed', expires_in: 5_184_000 },
        '/me/threads': {
          data: [
            { id: 'm3', media_type: 'IMAGE', text: 'Sunset walk', media_url: 'https://cdn.threads.example/sunset.jpg', timestamp: now },
            { id: 'm2', media_type: 'REPOST_FACADE', timestamp: now },
            { id: 'm1', media_type: 'TEXT_POST', text: 'First post from Threads', timestamp: now },
          ],
        },
        'sunset.jpg': JPEG,
      },
      calls,
    );
    expect(await meta.checkAccount(db, rows[0]!.id, opts, store, threads)).toEqual({ posted: 2 });
    expect(calls.some((u) => u.includes('access_token=refreshed'))).toBe(true);
    expect(await meta.checkAccount(db, rows[0]!.id, opts, store, threads)).toEqual({ posted: 0 });
    const copied = (await as(member).get('/crosspost')).json();
    expect(copied.accounts).toMatchObject([{ provider: 'threads', username: 'poster', status: 'active' }]);
    expect(copied.recent.filter((r: { status: string }) => r.status === 'posted')).toHaveLength(2);
    // "Download my data" lists the connection and the copies, never the stored token.
    const exported = (await as(member).get('/me/export')).json();
    expect(exported.crosspostAccounts).toMatchObject([{ provider: 'threads', username: 'poster' }]);
    expect(exported.crosspostAccounts[0].access_token).toBeUndefined();
    expect(exported.crosspostImports.length).toBeGreaterThanOrEqual(2);

    // A revoked token marks the account expired, so the app asks to reconnect.
    const revoked = fakeMeta({ '/me/threads': { error: { message: 'Session expired', code: 190, type: 'OAuthException' } } });
    await db.query('update public.crosspost_accounts set last_checked_at = null where id = $1', [rows[0]!.id]);
    expect(await meta.checkAccount(db, rows[0]!.id, opts, store, revoked)).toEqual({ posted: 0 });
    expect((await as(member).get('/crosspost')).json().accounts[0].status).toBe('expired');
    expect((await as(member).delete('/crosspost/threads')).statusCode).toBe(200);
    expect((await as(member).delete('/crosspost/threads')).statusCode).toBe(404);
  });

  it('copies only the member’s own Facebook posts', async () => {
    const member = await createUser('Facebook Poster');
    const fbUser = `fb${Date.now()}`;
    await db.query(
      "insert into public.crosspost_accounts (user_id, provider, external_user_id, access_token, import_since) values ($1, 'facebook', $2, $3, now() - interval '1 day')",
      [member, fbUser, meta.sealToken(opts.tokenKey!, 'fb-token')],
    );
    const { rows } = await db.query<{ id: string }>('select id from public.crosspost_accounts where external_user_id = $1', [fbUser]);
    const now = new Date().toISOString();
    const fb = fakeMeta({
      '/me/posts': {
        data: [
          { id: 'p2', message: 'Happy birthday to you!', from: { id: 'someone-else' }, created_time: now },
          { id: 'p3', message: 'Watch the puppy', from: { id: fbUser }, created_time: now, attachments: { data: [{ type: 'video_inline', media: { source: 'https://video.example/v.mp4', image: { src: 'https://scontent.example/thumb.jpg' } } }] } },
          { id: 'p1', message: 'Our garden is blooming', from: { id: fbUser }, created_time: now, attachments: { data: [{ type: 'album', subattachments: { data: [{ type: 'photo', media: { image: { src: 'https://scontent.example/a.jpg' } } }] } }] } },
        ],
      },
      'a.jpg': JPEG,
      'v.mp4': MP4,
    });
    expect(await meta.checkAccount(db, rows[0]!.id, opts, store, fb)).toEqual({ posted: 2 });
    const { rows: copied } = await db.query(
      `select p.body, (select array_agg(m.kind::text) from public.post_media m where m.post_id = p.id) as kinds
         from public.crosspost_imports i join public.posts p on p.id = i.post_id where i.user_id = $1 order by p.body`,
      [member],
    );
    expect(copied).toEqual([
      { body: 'Our garden is blooming', kinds: ['image'] },
      { body: 'Watch the puppy', kinds: ['video'] },
    ]);
  });

  it('verifies the Threads webhook and queues new posts from connected members', async () => {
    const query = (token: string) => `/crosspost/threads/webhook?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=4242`;
    expect((await withKeys.inject({ method: 'GET', url: query('verify-token-0123456789') })).body).toBe('4242');
    expect((await withKeys.inject({ method: 'GET', url: query('wrong-token-0123456789') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: query('verify-token-0123456789') })).statusCode).toBe(403);

    const member = await createUser('Webhook Poster');
    const threadsUser = `9${Date.now()}`;
    await db.query("insert into public.crosspost_accounts (user_id, provider, external_user_id, access_token) values ($1, 'threads', $2, $3)", [
      member,
      threadsUser,
      meta.sealToken(opts.tokenKey!, 'tok'),
    ]);
    const body = JSON.stringify({ app_id: '111', topic: 'interaction', target_id: threadsUser, time: 1, values: { field: 'publish', value: { id: '8901234', media_type: 'TEXT_POST' } } });
    const post = (sig: string) => withKeys.inject({ method: 'POST', url: '/crosspost/threads/webhook', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, payload: body });
    expect((await post('sha256=deadbeef')).statusCode).toBe(401);
    const sig = `sha256=${createHmac('sha256', 'threads-secret').update(body).digest('hex')}`;
    expect((await post(sig)).json()).toEqual({ queued: 1 });
    const { rows } = await db.query("select run_at from graphile_worker.jobs where key = 'crosspost-media:8901234'");
    expect(rows).toHaveLength(1);
    // Without the Threads keys in this test worker, the job finds nothing to do and finishes.
    await drainJobs();

    expect(meta.publishedPosts({ entry: [{ id: '5', changes: [{ field: 'publish', value: { id: '77' } }, { field: 'mentions', value: { id: '78' } }] }] })).toEqual([
      { threadsUserId: '5', username: null, mediaId: '77' },
    ]);
  });

  it('rejects a forged or failed sign-in return', async () => {
    const r = await withKeys.inject({ method: 'GET', url: '/crosspost/facebook/callback?code=abc&state=nope' });
    expect(r.statusCode).toBe(400);
    expect(r.body).toContain('expired');
    expect((await withKeys.inject({ method: 'GET', url: '/crosspost/facebook/callback?error=access_denied' })).statusCode).toBe(400);
    const member = await createUser('FB Connect');
    const url = new URL((await withKeys.inject({ method: 'POST', url: '/crosspost/facebook/connect', headers: bearer(member) })).json().url);
    expect(url.pathname).toBe('/v26.0/dialog/oauth');
    expect(url.searchParams.get('scope')).toBe('user_posts');
  });
});

describe('Cross-posting helpers', () => {
  it('recognizes photos and videos by their first bytes', () => {
    expect(crosspost.sniffMedia(JPEG)).toBe('image/jpeg');
    expect(crosspost.sniffMedia(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe('image/png');
    expect(crosspost.sniffMedia(Buffer.from('RIFF0000WEBPVP8 '))).toBe('image/webp');
    expect(crosspost.sniffMedia(Buffer.from('0000ftypheic0000'))).toBe('image/heic');
    expect(crosspost.sniffMedia(MP4)).toBe('video/mp4');
    expect(crosspost.sniffMedia(Buffer.from('0000ftypqt  0000'))).toBe('video/quicktime');
    expect(crosspost.sniffMedia(Buffer.from('<svg></svg>'))).toBeNull();
  });

  it('reports which Connect buttons can work', () => {
    expect(meta.connectable(null)).toEqual({ threads: false, facebook: false });
    expect(meta.connectable({ ...opts, tokenKey: null })).toEqual({ threads: false, facebook: false });
    expect(meta.connectable({ ...opts, facebook: null })).toEqual({ threads: true, facebook: false });
  });
});

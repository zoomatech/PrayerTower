// Connected Facebook and Threads accounts (docs/CROSSPOST.md). The member signs in
// once with "Connect"; after that the worker copies each new post they make there.
//
// Threads (developers.facebook.com/documentation/threads): sign-in at
// threads.com/oauth/authorize with threads_basic, a long-lived token (60 days,
// refreshed here), GET /me/threads for new posts, and the `publish` webhook so a
// post arrives within seconds instead of at the next check.
// Facebook (developers.facebook.com/docs/graph-api/reference/user/posts): sign-in
// with user_posts, a long-lived token (about 60 days, which Facebook does not let a
// server refresh, so the member reconnects), and GET /me/posts. user_posts needs
// Meta App Review before it works for anyone but the app's own testers.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Task } from 'graphile-worker';
import type { Config } from '../../config.js';
import { withTx, type Db, type Queryable } from '../../db.js';
import { AppError, badRequest, notFound } from '../../errors.js';
import { enqueue } from '../../jobs.js';
import { notify } from '../notifications/index.js';
import { available, enabled, importPost, MAX_MEDIA, MAX_VIDEO_BYTES, maxBytes, sniffMedia, type MediaStore, type MediaType, type Incoming, type Source } from './index.js';

export interface CrosspostOptions {
  /** The server's public https address (the sign-in return link is <publicUrl>/crosspost/<provider>/callback). */
  publicUrl: string | null;
  /** Encrypts stored tokens. */
  tokenKey: string | null;
  threads: { appId: string; appSecret: string; verifyToken: string | null } | null;
  facebook: { appId: string; appSecret: string; graphVersion: string } | null;
}

export function crosspostOptions(c: Config): CrosspostOptions {
  return {
    publicUrl: c.CROSSPOST_PUBLIC_URL?.replace(/\/+$/, '') ?? null,
    tokenKey: c.CROSSPOST_TOKEN_KEY ?? null,
    threads: c.THREADS_APP_ID && c.THREADS_APP_SECRET ? { appId: c.THREADS_APP_ID, appSecret: c.THREADS_APP_SECRET, verifyToken: c.THREADS_WEBHOOK_VERIFY_TOKEN ?? null } : null,
    facebook: c.FACEBOOK_APP_ID && c.FACEBOOK_APP_SECRET ? { appId: c.FACEBOOK_APP_ID, appSecret: c.FACEBOOK_APP_SECRET, graphVersion: c.FACEBOOK_GRAPH_VERSION } : null,
  };
}

/** Which "Connect" buttons can work: the provider's app keys, the public URL and the token key are all set. */
export function connectable(o: CrosspostOptions | null): Record<Source, boolean> {
  const base = !!o?.publicUrl && !!o.tokenKey;
  return { threads: base && !!o?.threads, facebook: base && !!o?.facebook };
}

const THREADS_GRAPH = 'https://graph.threads.com';
const facebookGraph = (o: CrosspostOptions) => `https://graph.facebook.com/${o.facebook!.graphVersion}`;
const redirectUri = (o: CrosspostOptions, provider: Source) => `${o.publicUrl}/crosspost/${provider}/callback`;

// Tokens at rest: AES-256-GCM with a key derived from CROSSPOST_TOKEN_KEY ------------------

const aesKey = (secret: string) => createHash('sha256').update(`crosspost-token:${secret}`).digest();

export function sealToken(secret: string, token: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', aesKey(secret), iv);
  const body = Buffer.concat([c.update(token, 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${body.toString('base64url')}`;
}

export function openToken(secret: string, sealed: string): string {
  const [v, iv, tag, body] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !body) throw new Error('Unreadable token');
  const d = createDecipheriv('aes-256-gcm', aesKey(secret), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
}

// Calls to Meta ------------------------------------------------------------------------

class MetaError extends Error {
  constructor(
    message: string,
    /** The token no longer works (expired, revoked, password changed). */
    readonly tokenInvalid: boolean,
  ) {
    super(message);
  }
}

async function metaJson<T>(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const res = await fetcher(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; type?: string }; error_message?: string };
  if (!res.ok || body.error) {
    const code = body.error?.code;
    // 190: invalid or expired token; 102: session; 10/200-299: permission removed.
    const invalid = code === 190 || code === 102 || code === 10 || (code !== undefined && code >= 200 && code < 300) || body.error?.type === 'OAuthException';
    throw new MetaError(body.error?.message ?? body.error_message ?? `Meta answered ${res.status}`, invalid);
  }
  return body as T;
}

const query = (params: Record<string, string | number>) => new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

// Connecting ---------------------------------------------------------------------------

function requireConnectable(o: CrosspostOptions | null, provider: Source): CrosspostOptions {
  if (!o || !connectable(o)[provider]) throw new AppError(503, 'not_configured', `Connecting ${provider === 'threads' ? 'Threads' : 'Facebook'} is not set up on this server yet`);
  return o;
}

/** The sign-in page to open for "Connect Threads" or "Connect Facebook". */
export async function connectUrl(q: Queryable, userId: string, provider: Source, opts: CrosspostOptions | null): Promise<string> {
  if (!(await available(q, userId))) throw new AppError(403, 'forbidden', 'Cross-posting is not available');
  const o = requireConnectable(opts, provider);
  const state = randomBytes(24).toString('base64url');
  await q.query("delete from public.crosspost_oauth_states where created_at < now() - interval '1 hour'");
  await q.query('insert into public.crosspost_oauth_states (state, user_id, provider) values ($1, $2, $3)', [state, userId, provider]);
  if (provider === 'threads') {
    return `https://threads.com/oauth/authorize?${query({ client_id: o.threads!.appId, redirect_uri: redirectUri(o, provider), scope: 'threads_basic', response_type: 'code', state })}`;
  }
  return `https://www.facebook.com/${o.facebook!.graphVersion}/dialog/oauth?${query({ client_id: o.facebook!.appId, redirect_uri: redirectUri(o, provider), scope: 'user_posts', response_type: 'code', state })}`;
}

/** The return from the sign-in page: swap the code for a long-lived token and save the account. */
export async function finishConnect(q: Queryable, provider: Source, state: string, code: string, opts: CrosspostOptions | null, fetcher: typeof fetch = fetch) {
  const o = requireConnectable(opts, provider);
  const { rows } = await q.query<{ user_id: string }>(
    "delete from public.crosspost_oauth_states where state = $1 and provider = $2 and created_at > now() - interval '1 hour' returning user_id",
    [state, provider],
  );
  const userId = rows[0]?.user_id;
  if (!userId) throw badRequest('This sign-in link has expired. Start again from the app.');
  // Threads adds "#_" to the code, which is not part of it.
  const cleanCode = code.replace(/#_$/, '');

  let token: string;
  let expiresIn: number | null;
  let externalId: string;
  let username: string | null;
  if (provider === 'threads') {
    const short = await metaJson<{ access_token: string; user_id: string | number }>(fetcher, `${THREADS_GRAPH}/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: query({ client_id: o.threads!.appId, client_secret: o.threads!.appSecret, grant_type: 'authorization_code', redirect_uri: redirectUri(o, provider), code: cleanCode }),
    });
    const long = await metaJson<{ access_token: string; expires_in?: number }>(
      fetcher,
      `${THREADS_GRAPH}/access_token?${query({ grant_type: 'th_exchange_token', client_secret: o.threads!.appSecret, access_token: short.access_token })}`,
    );
    const me = await metaJson<{ id: string; username?: string }>(fetcher, `${THREADS_GRAPH}/v1.0/me?${query({ fields: 'id,username', access_token: long.access_token })}`);
    token = long.access_token;
    expiresIn = long.expires_in ?? 60 * 86_400;
    externalId = String(me.id ?? short.user_id);
    username = me.username ?? null;
  } else {
    const graph = facebookGraph(o);
    const short = await metaJson<{ access_token: string }>(
      fetcher,
      `${graph}/oauth/access_token?${query({ client_id: o.facebook!.appId, redirect_uri: redirectUri(o, provider), client_secret: o.facebook!.appSecret, code: cleanCode })}`,
    );
    const long = await metaJson<{ access_token: string; expires_in?: number }>(
      fetcher,
      `${graph}/oauth/access_token?${query({ grant_type: 'fb_exchange_token', client_id: o.facebook!.appId, client_secret: o.facebook!.appSecret, fb_exchange_token: short.access_token })}`,
    );
    const me = await metaJson<{ id: string; name?: string }>(fetcher, `${graph}/me?${query({ fields: 'id,name', access_token: long.access_token })}`);
    token = long.access_token;
    expiresIn = long.expires_in ?? 60 * 86_400;
    externalId = me.id;
    username = me.name ?? null;
  }

  const { rows: owner } = await q.query<{ user_id: string }>('select user_id from public.crosspost_accounts where provider = $1 and external_user_id = $2', [provider, externalId]);
  if (owner[0] && owner[0].user_id !== userId) throw badRequest('That account is already connected to another Prayer Tower member');
  await q.query(
    `insert into public.crosspost_accounts (user_id, provider, external_user_id, username, access_token, token_expires_at)
     values ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))
     on conflict (user_id, provider) do update set external_user_id = excluded.external_user_id, username = excluded.username,
       access_token = excluded.access_token, token_expires_at = excluded.token_expires_at, token_refreshed_at = now(), status = 'active',
       import_since = case when crosspost_accounts.external_user_id = excluded.external_user_id then crosspost_accounts.import_since else now() end`,
    [userId, provider, externalId, username, sealToken(o.tokenKey!, token), expiresIn],
  );
  return { userId, provider, username };
}

export async function disconnect(q: Queryable, userId: string, provider: Source) {
  const { rowCount } = await q.query('delete from public.crosspost_accounts where user_id = $1 and provider = $2', [userId, provider]);
  if (!rowCount) throw notFound('Connected account');
}

// Reading new posts ----------------------------------------------------------------------

interface Account {
  id: string;
  user_id: string;
  provider: Source;
  external_user_id: string;
  access_token: string;
  token_expires_at: Date | null;
  token_refreshed_at: Date;
  import_since: Date;
  last_checked_at: Date | null;
}

interface ThreadsMedia {
  id: string;
  text?: string;
  media_type?: string;
  media_url?: string;
  permalink?: string;
  timestamp?: string;
  is_reply?: boolean;
  children?: { data?: { media_type?: string; media_url?: string }[] };
}
interface FacebookPost {
  id: string;
  message?: string;
  permalink_url?: string;
  created_time?: string;
  full_picture?: string;
  from?: { id?: string };
  attachments?: { data?: FacebookAttachment[] };
}
interface FacebookAttachment {
  type?: string;
  media?: { image?: { src?: string }; source?: string };
  subattachments?: { data?: FacebookAttachment[] };
}

const THREADS_FIELDS = 'id,text,media_type,media_url,permalink,timestamp,is_reply,children{media_type,media_url}';

/** Photo and video links in a Threads post (one image or video, or the items of a carousel). */
function threadsMedia(m: ThreadsMedia): string[] {
  const isMedia = (t?: string) => t === 'IMAGE' || t === 'VIDEO';
  if (isMedia(m.media_type) && m.media_url) return [m.media_url];
  if (m.media_type === 'CAROUSEL_ALBUM') return (m.children?.data ?? []).filter((c) => isMedia(c.media_type) && c.media_url).map((c) => c.media_url!);
  return [];
}

/** Photo and video links in a Facebook post: its attachments (an album's items), else its picture. */
function facebookMedia(p: FacebookPost): string[] {
  const out: string[] = [];
  const add = (a: FacebookAttachment) => {
    if (a.type?.startsWith('video') && a.media?.source) out.push(a.media.source);
    else if (a.type === 'photo' && a.media?.image?.src) out.push(a.media.image.src);
  };
  for (const a of p.attachments?.data ?? []) {
    const subs = a.subattachments?.data ?? [];
    if (subs.length) subs.forEach(add);
    else add(a);
  }
  if (!out.length && p.full_picture) out.push(p.full_picture);
  return out;
}

/** Download photos and videos from Meta's servers (https only, size-capped, checked by their first bytes). */
export async function downloadMedia(urls: string[], fetcher: typeof fetch): Promise<{ bytes: Buffer; contentType: MediaType }[]> {
  const out: { bytes: Buffer; contentType: MediaType }[] = [];
  for (const url of urls.slice(0, MAX_MEDIA)) {
    if (!url.startsWith('https://')) continue;
    const res = await fetcher(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (!res?.ok) continue;
    if (Number(res.headers.get('content-length') ?? 0) > MAX_VIDEO_BYTES) continue;
    const bytes = Buffer.from(await res.arrayBuffer());
    const type = sniffMedia(bytes);
    if (type && bytes.length <= maxBytes(type)) out.push({ bytes, contentType: type });
  }
  return out;
}

/** Threads tokens last 60 days; refresh any older than a day that ends within 10 days. */
async function freshToken(q: Queryable, a: Account, o: CrosspostOptions, fetcher: typeof fetch): Promise<string> {
  const token = openToken(o.tokenKey!, a.access_token);
  const endsSoon = a.token_expires_at && a.token_expires_at.getTime() - Date.now() < 10 * 86_400_000;
  const dayOld = Date.now() - a.token_refreshed_at.getTime() > 86_400_000;
  if (a.provider !== 'threads' || !endsSoon || !dayOld) return token;
  const r = await metaJson<{ access_token: string; expires_in?: number }>(fetcher, `${THREADS_GRAPH}/refresh_access_token?${query({ grant_type: 'th_refresh_token', access_token: token })}`);
  await q.query('update public.crosspost_accounts set access_token = $2, token_expires_at = now() + make_interval(secs => $3), token_refreshed_at = now() where id = $1', [
    a.id,
    sealToken(o.tokenKey!, r.access_token),
    r.expires_in ?? 60 * 86_400,
  ]);
  return r.access_token;
}

/** New posts on the account since it was last checked (never before it was connected), oldest first. */
async function newPosts(a: Account, token: string, o: CrosspostOptions, fetcher: typeof fetch): Promise<(Omit<Incoming, 'media'> & { mediaUrls: string[]; at: Date })[]> {
  // An hour of overlap: posts already copied are skipped by their id.
  const since = Math.floor(Math.max(a.import_since.getTime(), (a.last_checked_at?.getTime() ?? 0) - 3_600_000) / 1000);
  if (a.provider === 'threads') {
    const r = await metaJson<{ data?: ThreadsMedia[] }>(fetcher, `${THREADS_GRAPH}/v1.0/me/threads?${query({ fields: THREADS_FIELDS, since, limit: 25, access_token: token })}`);
    return (r.data ?? [])
      .filter((m) => !m.is_reply && m.media_type !== 'REPOST_FACADE' && (!m.timestamp || new Date(m.timestamp) >= a.import_since))
      .map((m) => ({ source: 'threads' as const, via: 'account' as const, externalId: m.id, text: m.text ?? '', permalink: m.permalink ?? null, mediaUrls: threadsMedia(m), at: new Date(m.timestamp ?? Date.now()) }))
      .reverse();
  }
  const r = await metaJson<{ data?: FacebookPost[] }>(
    fetcher,
    `${facebookGraph(o)}/me/posts?${query({ fields: 'id,message,permalink_url,created_time,full_picture,from,attachments{type,media,subattachments}', since, limit: 25, access_token: token })}`,
  );
  return (r.data ?? [])
    // /me/posts also lists posts others made on the member's timeline; copy only the member's own.
    .filter((p) => (!p.from?.id || p.from.id === a.external_user_id) && (!p.created_time || new Date(p.created_time) >= a.import_since))
    .map((p) => ({ source: 'facebook' as const, via: 'account' as const, externalId: p.id, text: p.message ?? '', permalink: p.permalink_url ?? null, mediaUrls: facebookMedia(p), at: new Date(p.created_time ?? Date.now()) }))
    .reverse();
}

const PROVIDER_NAME = { threads: 'Threads', facebook: 'Facebook' } as const;

/** Tells the member their connection stopped (or is about to), so they tap Reconnect. */
async function noticeReconnect(q: Queryable, a: Pick<Account, 'id' | 'user_id' | 'provider'>, when: 'expired' | 'soon', dedupe: string) {
  const name = PROVIDER_NAME[a.provider];
  await notify(q, a.user_id, {
    kind: 'crosspost_reconnect',
    title: when === 'expired' ? `Reconnect ${name}` : `Reconnect ${name} this week`,
    body:
      when === 'expired'
        ? `Your ${name} posts are no longer being copied here. Open Me → Copy my Facebook posts and tap Reconnect.`
        : `${name} lets a connection last about 60 days, and yours ends soon. Open Me → Copy my Facebook posts and tap Reconnect to keep your posts coming.`,
    data: { screen: 'crosspost', provider: a.provider },
    dedupeKey: `crosspost_${when}:${a.id}:${dedupe}`,
  });
}

async function markChecked(q: Queryable, a: Account, err: unknown) {
  const expired = err instanceof MetaError && err.tokenInvalid;
  await q.query(`update public.crosspost_accounts set last_checked_at = now(), status = case when $2 then 'expired' else status end where id = $1`, [a.id, expired]);
  if (expired) await noticeReconnect(q, a, 'expired', new Date().toISOString().slice(0, 10));
}

/** Check one connected account and copy its new posts. */
export async function checkAccount(db: Db, accountId: string, o: CrosspostOptions, storeMedia: MediaStore | null, fetcher: typeof fetch = fetch) {
  const { rows } = await db.query<Account>("select * from public.crosspost_accounts where id = $1 and status = 'active'", [accountId]);
  const a = rows[0];
  if (!a || !o.tokenKey || !connectable(o)[a.provider] || !(await available(db, a.user_id))) return { posted: 0 };
  let posted = 0;
  try {
    const token = await freshToken(db, a, o, fetcher);
    for (const p of await newPosts(a, token, o, fetcher)) {
      const { rowCount: seen } = await db.query('select 1 from public.crosspost_imports where user_id = $1 and source = $2 and external_id = $3', [a.user_id, p.source, p.externalId]);
      if (seen) continue;
      const media = await downloadMedia(p.mediaUrls, fetcher);
      const r = await withTx(db, (tx) => importPost(tx, a.user_id, { ...p, media }, storeMedia));
      if (r.status === 'posted') posted++;
    }
    await markChecked(db, a, null);
    // Facebook tokens can't be refreshed by a server; warn a week before one ends.
    if (a.provider === 'facebook' && a.token_expires_at && a.token_expires_at.getTime() - Date.now() < 7 * 86_400_000) {
      await noticeReconnect(db, a, 'soon', a.token_expires_at.toISOString());
    }
  } catch (err) {
    await markChecked(db, a, err);
    if (!(err instanceof MetaError)) throw err;
  }
  return { posted };
}

/** Every 5 minutes: queue a check of each connected account (oldest-checked first). */
export function pollTask(db: Db): Task {
  return async () => {
    if (!(await enabled(db))) return;
    const { rows } = await db.query<{ id: string }>(
      "select id from public.crosspost_accounts where status = 'active' and (last_checked_at is null or last_checked_at < now() - interval '4 minutes') order by last_checked_at nulls first limit 500",
    );
    for (const r of rows) await enqueue(db, 'crosspost_check_account', { accountId: r.id }, { jobKey: `crosspost:${r.id}` });
  };
}

export function checkAccountTask(db: Db, o: CrosspostOptions, storeMedia: MediaStore | null, fetcher: typeof fetch = fetch): Task {
  return async (payload) => {
    const { accountId } = payload as { accountId: string };
    await checkAccount(db, accountId, o, storeMedia, fetcher);
  };
}

// Threads webhook -------------------------------------------------------------------------

/** The GET Meta sends when the webhook is saved: answer with hub.challenge if the verify token matches. */
export function verifyWebhook(o: CrosspostOptions | null, params: Record<string, string | undefined>): string | null {
  const expected = o?.threads?.verifyToken;
  if (!expected || params['hub.mode'] !== 'subscribe' || !params['hub.challenge']) return null;
  const given = Buffer.from(params['hub.verify_token'] ?? '');
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want) ? params['hub.challenge'] : null;
}

/** X-Hub-Signature-256 is "sha256=" + HMAC-SHA256 of the raw body with the app secret. */
export function signatureOk(o: CrosspostOptions | null, raw: Buffer, header: string | undefined): boolean {
  if (!o?.threads || !header?.startsWith('sha256=')) return false;
  const want = Buffer.from(createHmac('sha256', o.threads.appSecret).update(raw).digest('hex'));
  const given = Buffer.from(header.slice(7));
  return given.length === want.length && timingSafeEqual(given, want);
}

/** The publish notifications in a webhook body: the Threads user and the new post's id. */
export function publishedPosts(body: unknown): { threadsUserId: string | null; username: string | null; mediaId: string }[] {
  const out: { threadsUserId: string | null; username: string | null; mediaId: string }[] = [];
  const add = (target: unknown, change: unknown) => {
    const c = change as { field?: string; value?: { id?: string; username?: string } } | undefined;
    if (c?.field === 'publish' && c.value?.id) out.push({ threadsUserId: target ? String(target) : null, username: c.value.username ?? null, mediaId: String(c.value.id) });
  };
  const b = body as { target_id?: unknown; values?: unknown; entry?: { id?: unknown; changes?: unknown[] }[] };
  // The documented shape: { target_id, values: { field, value } } (values may also be a list).
  for (const v of [b?.values].flat()) add(b?.target_id, v);
  // The usual Graph webhook shape: { entry: [{ id, changes: [{ field, value }] }] }.
  for (const e of b?.entry ?? []) for (const c of e.changes ?? []) add(e.id, c);
  return out;
}

/** Queue an import for each published post whose author has connected Threads. */
export async function handleWebhook(q: Queryable, body: unknown) {
  let queued = 0;
  for (const p of publishedPosts(body)) {
    const { rows } = await q.query<{ id: string }>(
      `select id from public.crosspost_accounts where provider = 'threads' and status = 'active'
          and (external_user_id = $1 or ($1 is null and username = $2))`,
      [p.threadsUserId, p.username],
    );
    if (!rows[0]) continue;
    await enqueue(q, 'crosspost_import_threads', { accountId: rows[0].id, mediaId: p.mediaId }, { jobKey: `crosspost-media:${p.mediaId}` });
    queued++;
  }
  return queued;
}

/** One post from the webhook: read it from Threads and copy it. */
export function importThreadsTask(db: Db, o: CrosspostOptions, storeMedia: MediaStore | null, fetcher: typeof fetch = fetch): Task {
  return async (payload) => {
    const { accountId, mediaId } = payload as { accountId: string; mediaId: string };
    if (!/^\d{1,30}$/.test(mediaId)) return;
    const { rows } = await db.query<Account>("select * from public.crosspost_accounts where id = $1 and status = 'active'", [accountId]);
    const a = rows[0];
    if (!a || !o.tokenKey || !connectable(o).threads || !(await available(db, a.user_id))) return;
    try {
      const token = await freshToken(db, a, o, fetcher);
      const m = await metaJson<ThreadsMedia & { owner?: { id?: string } }>(fetcher, `${THREADS_GRAPH}/v1.0/${mediaId}?${query({ fields: `${THREADS_FIELDS},owner`, access_token: token })}`);
      if (m.is_reply || m.media_type === 'REPOST_FACADE' || (m.owner?.id && m.owner.id !== a.external_user_id)) return;
      const media = await downloadMedia(threadsMedia(m), fetcher);
      await withTx(db, (tx) => importPost(tx, a.user_id, { source: 'threads', via: 'account', externalId: m.id, text: m.text ?? '', permalink: m.permalink ?? null, media }, storeMedia));
    } catch (err) {
      if (err instanceof MetaError) return markChecked(db, a, err);
      throw err;
    }
  };
}

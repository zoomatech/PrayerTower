// Growth ideas the big platforms missed (roadmap/Growth_Ideas_Big_Platforms_Missed.md,
// docs/GROWTH.md). Each is off until an admin turns it on (growth_settings):
//   1. Guest prayer: the member makes a link for their own request; anyone can
//      tap "I prayed" on the web without an account. The need is the invite.
//   2. Prayer chain: the member's existing email prayer chain gets their
//      requests with the same link. Each address confirms before anything is sent.
//   3. Prayed-for widget: who prayed for you today, for the home-screen widget.
//   4. Prayer minute: one minute a day the member chose, prayed alongside
//      everyone else who chose it, with a real live count.
// Guests never earn tokens and their prayers never count as verified.
import { createHash, randomBytes } from 'node:crypto';
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { enqueue } from '../../jobs.js';
import { getProfile } from '../accounts/index.js';
import type { Mailer } from '../digest/mailer.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';

export interface GrowthSettings {
  guest_prayer_enabled: boolean;
  prayer_chain_enabled: boolean;
  prayer_chain_max: number;
  prayed_for_widget_enabled: boolean;
  prayer_minute_enabled: boolean;
  guest_email_days: number;
}

export async function settings(q: Queryable): Promise<GrowthSettings> {
  const { rows } = await q.query<GrowthSettings>(
    `select guest_prayer_enabled, prayer_chain_enabled, prayer_chain_max, prayed_for_widget_enabled, prayer_minute_enabled, guest_email_days
       from public.growth_settings`,
  );
  return rows[0]!;
}

export const SettingsPatch = z.object({
  guestPrayerEnabled: z.boolean().optional(),
  prayerChainEnabled: z.boolean().optional(),
  prayerChainMax: z.number().int().min(1).max(500).optional(),
  prayedForWidgetEnabled: z.boolean().optional(),
  prayerMinuteEnabled: z.boolean().optional(),
  guestEmailDays: z.number().int().min(1).max(365).optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.growth_settings set
       guest_prayer_enabled = coalesce($1, guest_prayer_enabled), prayer_chain_enabled = coalesce($2, prayer_chain_enabled),
       prayer_chain_max = coalesce($3, prayer_chain_max), prayed_for_widget_enabled = coalesce($4, prayed_for_widget_enabled),
       prayer_minute_enabled = coalesce($5, prayer_minute_enabled), guest_email_days = coalesce($6, guest_email_days)`,
    [
      p.guestPrayerEnabled ?? null,
      p.prayerChainEnabled ?? null,
      p.prayerChainMax ?? null,
      p.prayedForWidgetEnabled ?? null,
      p.prayerMinuteEnabled ?? null,
      p.guestEmailDays ?? null,
    ],
  );
  return settings(q);
}

/** The switches the app needs. The prayer chain sends the guest link, so it needs guest prayer on too. */
export async function features(q: Queryable) {
  const s = await settings(q);
  return {
    guestPrayer: s.guest_prayer_enabled,
    prayerChain: s.prayer_chain_enabled && s.guest_prayer_enabled,
    prayedForWidget: s.prayed_for_widget_enabled,
    prayerMinute: s.prayer_minute_enabled,
  };
}

const newToken = () => randomBytes(18).toString('base64url');
const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || null;

/** Whether a community uses Open Circle's non-religious wording. */
async function secularCommunity(q: Queryable, communityId: string): Promise<boolean> {
  const { rows } = await q.query<{ neutral: boolean }>(
    `select coalesce(vocabulary ->> 'wording', case when tradition = 'secular' then 'neutral' else 'faith' end) = 'neutral' as neutral
       from public.communities where id = $1`,
    [communityId],
  );
  return rows[0]?.neutral === true;
}

/** The member's own request that can still be shared: visible, a prayer request, not answered. */
async function ownOpenRequest(q: Queryable, userId: string, postId: string) {
  const post = await posts.getVisible(q, postId);
  if (!post) throw notFound('Post');
  if (post.user_id !== userId) throw forbidden('Only the person who asked can share this request outside the app');
  posts.requirePrayable(post);
  if (post.state === 'answered') throw badRequest('This request is already answered');
  return post;
}

// 1. Guest prayer --------------------------------------------------------------------

/** Open Circle's links carry no religious word. */
export const guestPath = (token: string, secular = false) => `${secular ? '/circle' : '/pray'}/${token}`;

/** Make (or bring back) the link for the member's own request. One link per request. */
export async function createGuestLink(q: Queryable, userId: string, postId: string) {
  if (!(await settings(q)).guest_prayer_enabled) throw forbidden('Praying from a link is turned off for now');
  await ownOpenRequest(q, userId, postId);
  await q.query(
    `insert into public.guest_links (post_id, token, created_by) values ($1, $2, $3)
     on conflict (post_id) do update set revoked_at = null`,
    [postId, newToken(), userId],
  );
  return (await guestLink(q, userId, postId))!;
}

/** The member's link for their request, with how many guests prayed; null if none or turned off. */
export async function guestLink(q: Queryable, userId: string, postId: string) {
  const { rows } = await q.query<{ token: string; n: number; community_id: string }>(
    `select l.token, p.community_id, (select count(*)::int from public.guest_prayers g where g.link_id = l.id) as n
       from public.guest_links l join public.posts p on p.id = l.post_id
      where l.post_id = $1 and l.created_by = $2 and l.revoked_at is null`,
    [postId, userId],
  );
  const r = rows[0];
  return r ? { token: r.token, path: guestPath(r.token, await secularCommunity(q, r.community_id)), guestPrayers: r.n } : null;
}

/** Stop the link working. Prayers already offered stay counted. */
export async function revokeGuestLink(q: Queryable, userId: string, postId: string) {
  const { rowCount } = await q.query('update public.guest_links set revoked_at = now() where post_id = $1 and created_by = $2 and revoked_at is null', [
    postId,
    userId,
  ]);
  if (!rowCount) throw notFound('Link');
}

export interface GuestView {
  linkId: string;
  postId: string;
  body: string;
  /** The asker's first name; null when they posted anonymously. */
  name: string | null;
  answered: boolean;
  testimony: string | null;
  crisis: boolean;
  secular: boolean;
  /** Everyone who prayed: members and guests. */
  prayers: number;
}

/** What the public page shows: only while guest prayer is on, the link is live and the request visible. */
export async function guestView(q: Queryable, token: string): Promise<GuestView | null> {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  if (!(await settings(q)).guest_prayer_enabled) return null;
  const { rows } = await q.query<{
    link_id: string;
    post_id: string;
    body: string;
    is_anonymous: boolean;
    display_name: string | null;
    state: string;
    testimony: string | null;
    crisis: boolean;
    community_id: string;
    members: number;
    guests: number;
  }>(
    `select l.id as link_id, p.id as post_id, p.body, p.is_anonymous, pr.display_name, p.state, p.testimony, p.crisis, p.community_id,
            (select count(distinct e.user_id)::int from public.prayer_events e where e.post_id = p.id and e.user_id <> p.user_id) as members,
            (select count(*)::int from public.guest_prayers g where g.post_id = p.id) as guests
       from public.guest_links l
       join public.posts p on p.id = l.post_id
       join public.profiles pr on pr.id = p.user_id
      where l.token = $1 and l.revoked_at is null and p.moderation_status = 'visible'`,
    [token],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    linkId: r.link_id,
    postId: r.post_id,
    body: r.body,
    name: r.is_anonymous ? null : firstName(r.display_name),
    answered: r.state === 'answered',
    testimony: r.testimony,
    crisis: r.crisis,
    secular: await secularCommunity(q, r.community_id),
    prayers: r.members + r.guests,
  };
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export const GuestPrayer = z.object({
  firstName: z.string().trim().max(40).optional().transform((s) => s || undefined),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .optional()
    .transform((s) => s || undefined)
    .refine((s) => s === undefined || EMAIL.test(s), 'Enter a valid email address, or leave it empty'),
  /** "Email me if it's answered": the address is kept only with this ticked. */
  notify: z.union([z.boolean(), z.literal('on'), z.literal('true')]).optional(),
  /** A field people never see; bots fill it in. */
  website: z.string().optional(),
});

// Addresses are never stored: only a keyed hash, so one network can't tap a link over and over.
const IP_SALT = process.env.GUEST_IP_SALT || randomBytes(16).toString('hex');
const ipHash = (linkId: string, ip: string) => createHash('sha256').update(`${IP_SALT}:${linkId}:${ip}`).digest('hex');

/**
 * A guest prayed. Once per network per link per day; a bot that fills the
 * hidden field is quietly ignored. Tells the asker (one notice a day per request).
 */
export async function guestPray(q: Queryable, token: string, ip: string, input: z.infer<typeof GuestPrayer>) {
  const view = await guestView(q, token);
  if (!view) throw notFound('Link');
  if (view.answered) throw badRequest('This request is already answered');
  if (input.website) return { counted: false };
  const notify = input.notify === true || input.notify === 'on' || input.notify === 'true';
  const { rows } = await q.query<{ id: string; day: string }>(
    `insert into public.guest_prayers (link_id, post_id, first_name, email, ip_hash) values ($1, $2, $3, $4, $5)
     on conflict (link_id, ip_hash, day) do nothing returning id, day::text`,
    [view.linkId, view.postId, input.firstName ?? null, notify ? (input.email ?? null) : null, ipHash(view.linkId, ip)],
  );
  if (!rows[0]) return { counted: false };
  const post = (await posts.get(q, view.postId))!;
  const who = input.firstName ?? 'A friend';
  await notifications.notify(q, post.user_id, {
    kind: 'guest_prayer',
    title: view.secular ? `${who} is thinking of you` : `${who} prayed for you`,
    body: view.secular
      ? 'Someone you shared your request with sent support from the link. They do not need the app.'
      : 'Someone you shared your request with prayed for you from the link. They do not need the app to pray.',
    data: { postId: post.id },
    dedupeKey: `guest_prayer:${post.id}:${rows[0].day}`,
  });
  return { counted: true };
}

/** Called when a request is answered: the guests who asked to hear get one email. */
export async function queueGuestAnswered(q: Queryable, postId: string) {
  const { rowCount } = await q.query('select 1 from public.guest_prayers where post_id = $1 and email is not null and answered_sent_at is null limit 1', [postId]);
  if (rowCount) await enqueue(q, 'growth_guest_answered', { postId }, { jobKey: `growth_guest_answered:${postId}` });
}

export interface MailContext {
  mailer: Mailer | null;
  /** The public site address (PUBLIC_SITE_URL); unset = these emails are not sent. */
  siteUrl: string | null;
  /** Open Circle's name (OPEN_CIRCLE_NAME) in its members' guests' email. */
  openCircleName: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Plain-text lines in, the email's text and HTML out: everything escaped, and web addresses made links. */
const message = (lines: string[]) => ({
  text: lines.join('\n\n'),
  html: lines.map((l) => `<p>${esc(l).replace(/https?:\/\/[^\s<>"']+/g, (u) => `<a href="${u}">${u}</a>`)}</p>`).join('\n'),
});

/** Each guest who left an address hears once; the address is erased as it goes out. */
export function guestAnsweredTask(q: Queryable, ctx: MailContext): Task {
  return async (payload) => {
    if (!ctx.mailer) return;
    const { postId } = payload as { postId: string };
    const post = await posts.getVisible(q, postId);
    if (!post || post.state !== 'answered') return;
    const secular = await secularCommunity(q, post.community_id);
    const name = post.is_anonymous ? null : firstName((await getProfile(q, post.user_id))?.display_name);
    const brand = secular ? ctx.openCircleName : 'Prayer Tower';
    const { rows } = await q.query<{ id: string; email: string; first_name: string | null }>(
      'select id, email, first_name from public.guest_prayers where post_id = $1 and email is not null and answered_sent_at is null',
      [postId],
    );
    for (const g of rows) {
      const lines = [
        `${g.first_name ? `Hi ${g.first_name},` : 'Hello,'}`,
        secular
          ? `Good news: ${name ? name : 'the person you supported'} says things worked out. Thank you for thinking of them.`
          : `Good news: ${name ? name : 'the person you prayed for'} marked their prayer request answered. Thank you for praying.`,
        ...(post.testimony ? [`In their words: “${post.testimony.slice(0, 600)}”`] : []),
        `${brand} is a small, ad-free, invite-only community. If you'd like to join, ask ${name ? name : 'the person who shared the link'} for an invite${ctx.siteUrl ? `, or read about it at ${ctx.siteUrl}` : ''}.`,
        'You will not get any more email from us about this request.',
      ];
      await ctx.mailer({
        to: g.email,
        subject: secular ? 'Good news from someone you supported' : 'Good news: a prayer you prayed was answered',
        ...message(lines),
        secular,
      });
      await q.query('update public.guest_prayers set answered_sent_at = now(), email = null where id = $1', [g.id]);
    }
  };
}

// 2. Prayer chain --------------------------------------------------------------------

async function requireChain(q: Queryable) {
  const f = await features(q);
  if (!f.prayerChain) throw forbidden('The email prayer chain is turned off for now');
  return settings(q);
}

export const ChainMember = z.object({ email: z.string().trim().toLowerCase().max(254).regex(EMAIL, 'Enter a valid email address') });

/** Add an address. It gets one email asking to join; nothing else goes to it until it says yes. */
export async function addChainMember(q: Queryable, userId: string, email: string) {
  const s = await requireChain(q);
  const { rows: count } = await q.query<{ all: number; today: number }>(
    `select count(*) filter (where status <> 'left')::int as all, count(*) filter (where created_at > now() - interval '1 day')::int as today
       from public.prayer_chain_members where owner_id = $1`,
    [userId],
  );
  if (count[0]!.all >= s.prayer_chain_max) throw badRequest(`Your prayer chain can have up to ${s.prayer_chain_max} people`);
  if (count[0]!.today >= 20) throw badRequest('You can add up to 20 people a day');
  const { rows } = await q.query<{ id: string }>(
    `insert into public.prayer_chain_members (owner_id, email, token) values ($1, $2, $3)
     on conflict (owner_id, email) do nothing returning id`,
    [userId, email, newToken()],
  );
  // Someone who left, or was already asked, is never asked again.
  if (!rows[0]) throw conflict('This address is already on your list');
  await enqueue(q, 'growth_chain_confirm', { memberId: rows[0].id });
  return { id: rows[0].id };
}

export async function listChain(q: Queryable, userId: string) {
  const { rows } = await q.query<{ id: string; email: string; status: string; created_at: Date }>(
    'select id, email, status::text, created_at from public.prayer_chain_members where owner_id = $1 order by created_at',
    [userId],
  );
  return rows.map((r) => ({ id: r.id, email: r.email, status: r.status as 'pending' | 'confirmed' | 'left', createdAt: r.created_at }));
}

export async function removeChainMember(q: Queryable, userId: string, id: string) {
  const { rowCount } = await q.query('delete from public.prayer_chain_members where id = $1 and owner_id = $2', [id, userId]);
  if (!rowCount) throw notFound('Person');
}

/** The public join/leave page for one address. */
export async function chainEntry(q: Queryable, token: string) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return null;
  const { rows } = await q.query<{ id: string; status: string; display_name: string | null; owner_id: string }>(
    `select m.id, m.status::text, pr.display_name, m.owner_id from public.prayer_chain_members m join public.profiles pr on pr.id = m.owner_id
      where m.token = $1`,
    [token],
  );
  const r = rows[0];
  if (!r) return null;
  const { rows: c } = await q.query<{ id: string }>('select public.member_community_id($1) as id', [r.owner_id]);
  return { id: r.id, status: r.status as 'pending' | 'confirmed' | 'left', ownerName: firstName(r.display_name) ?? 'A friend', secular: await secularCommunity(q, c[0]!.id) };
}

export async function chainDecision(q: Queryable, token: string, join: boolean) {
  const entry = await chainEntry(q, token);
  if (!entry) throw notFound('Link');
  await q.query(
    `update public.prayer_chain_members set status = $2::public.prayer_chain_status, confirmed_at = case when $2::text = 'confirmed' then now() else confirmed_at end where id = $1`,
    [entry.id, join ? 'confirmed' : 'left'],
  );
  return { ...entry, status: join ? ('confirmed' as const) : ('left' as const) };
}

/** Send the member's own request to everyone on their chain who said yes. Once per request. */
export async function sendToChain(q: Queryable, userId: string, postId: string) {
  await requireChain(q);
  await ownOpenRequest(q, userId, postId);
  const { rows: people } = await q.query<{ n: number }>(
    `select count(*)::int as n from public.prayer_chain_members where owner_id = $1 and status = 'confirmed'`,
    [userId],
  );
  if (people[0]!.n === 0) throw badRequest('No one on your prayer chain has said yes yet');
  const link = await createGuestLink(q, userId, postId);
  const { rowCount } = await q.query('insert into public.prayer_chain_sends (post_id, owner_id) values ($1, $2) on conflict do nothing', [postId, userId]);
  if (!rowCount) throw conflict('This request already went to your prayer chain');
  await enqueue(q, 'growth_chain_send', { postId });
  return { recipients: people[0]!.n, path: link.path };
}

export function chainConfirmTask(q: Queryable, ctx: MailContext): Task {
  return async (payload) => {
    if (!ctx.mailer || !ctx.siteUrl) return;
    const { memberId } = payload as { memberId: string };
    const { rows } = await q.query<{ email: string; token: string; status: string }>(
      'select email, token, status::text from public.prayer_chain_members where id = $1',
      [memberId],
    );
    const m = rows[0];
    if (!m || m.status !== 'pending') return;
    const entry = (await chainEntry(q, m.token))!;
    const url = `${ctx.siteUrl}/chain/${m.token}`;
    const lines = entry.secular
      ? [
          `${entry.ownerName} would like to send you their requests for support by email, so you can let them know you're thinking of them.`,
          `To say yes or no, open: ${url}`,
          "If you do nothing, you won't get any more email.",
        ]
      : [
          `${entry.ownerName} would like to add you to their prayer chain, so their prayer requests reach you by email.`,
          `To say yes or no, open: ${url}`,
          "If you do nothing, you won't get any more email.",
        ];
    await ctx.mailer({
      to: m.email,
      subject: entry.secular ? `${entry.ownerName} asked to keep you posted` : `${entry.ownerName} asked you to join their prayer chain`,
      ...message(lines),
      secular: entry.secular,
    });
  };
}

export function chainSendTask(q: Queryable, ctx: MailContext): Task {
  return async (payload) => {
    if (!ctx.mailer || !ctx.siteUrl) return;
    const { postId } = payload as { postId: string };
    const post = await posts.getVisible(q, postId);
    if (!post || post.state === 'answered') return;
    const { rows: link } = await q.query<{ token: string }>('select token from public.guest_links where post_id = $1 and revoked_at is null', [postId]);
    if (!link[0]) return;
    const secular = await secularCommunity(q, post.community_id);
    const name = firstName((await getProfile(q, post.user_id))?.display_name) ?? 'A friend';
    const prayUrl = `${ctx.siteUrl}${guestPath(link[0].token, secular)}`;
    const { rows } = await q.query<{ email: string; token: string }>(
      `select email, token from public.prayer_chain_members where owner_id = $1 and status = 'confirmed'`,
      [post.user_id],
    );
    for (const m of rows) {
      const leave = `${ctx.siteUrl}/chain/${m.token}`;
      const lines = [
        secular ? `${name} shared a request with you:` : `${name} asks for your prayers:`,
        `“${post.body.slice(0, 1500)}”`,
        secular
          ? `Let them know you're thinking of them (no app or account needed): ${prayUrl}`
          : `Tap here once you've prayed (no app or account needed): ${prayUrl}`,
        `To stop these emails: ${leave}`,
      ];
      await ctx.mailer({
        to: m.email,
        subject: secular ? `${name} shared a request with you` : `${name} asks for your prayers`,
        ...message(lines),
        secular,
      });
    }
  };
}

// 3. Prayed-for widget ---------------------------------------------------------------

/**
 * Who prayed for the member's requests in the last 24 hours: up to two first
 * names (never anyone who prayed anonymously), and how many people in all,
 * guests included. Real counts only.
 */
export async function prayedForToday(q: Queryable, userId: string) {
  if (!(await settings(q)).prayed_for_widget_enabled) return { enabled: false as const };
  const { rows: members } = await q.query<{ user_id: string; name: string | null; anonymous: boolean; at: Date }>(
    `select distinct on (e.user_id) e.user_id, pr.display_name as name, e.is_anonymous as anonymous, e.created_at as at
       from public.prayer_events e
       join public.posts p on p.id = e.post_id
       join public.profiles pr on pr.id = e.user_id
      where p.user_id = $1 and e.user_id <> $1 and e.created_at > now() - interval '24 hours'
      order by e.user_id, e.created_at desc`,
    [userId],
  );
  const { rows: guests } = await q.query<{ name: string | null; at: Date }>(
    `select g.first_name as name, g.created_at as at from public.guest_prayers g join public.posts p on p.id = g.post_id
      where p.user_id = $1 and g.created_at > now() - interval '24 hours'`,
    [userId],
  );
  const named = [...members.filter((m) => !m.anonymous).map((m) => ({ name: firstName(m.name), at: m.at })), ...guests.map((g) => ({ name: firstName(g.name), at: g.at }))]
    .filter((x): x is { name: string; at: Date } => !!x.name)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const names = [...new Set(named.map((x) => x.name))].slice(0, 2);
  return { enabled: true as const, names, people: members.length + guests.length };
}

// 4. Prayer minute -------------------------------------------------------------------

export const Minute = z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM'),
  timeZone: z
    .string()
    .min(1)
    .max(64)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'Unknown time zone'),
});

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

async function requireMinute(q: Queryable) {
  if (!(await settings(q)).prayer_minute_enabled) throw forbidden('The prayer minute is turned off for now');
}

/** Members whose chosen minute is the same moment as this one, today (all time zones). */
const SAME_MOMENT = `(date_trunc('day', now() at time zone m.time_zone) + m.minute_of_day * interval '1 minute') at time zone m.time_zone`;

export async function myMinute(q: Queryable, userId: string) {
  if (!(await settings(q)).prayer_minute_enabled) return { enabled: false as const };
  const { rows } = await q.query<{ minute_of_day: number; time_zone: string; others: number }>(
    `select me.minute_of_day, me.time_zone,
            (select count(*)::int from public.prayer_minutes m
              where m.user_id <> me.user_id
                and to_char(${SAME_MOMENT} at time zone 'utc', 'HH24:MI') =
                    to_char((date_trunc('day', now() at time zone me.time_zone) + me.minute_of_day * interval '1 minute') at time zone me.time_zone at time zone 'utc', 'HH24:MI')) as others
       from public.prayer_minutes me where me.user_id = $1`,
    [userId],
  );
  const r = rows[0];
  return { enabled: true as const, time: r ? toTime(r.minute_of_day) : null, timeZone: r?.time_zone ?? null, others: r?.others ?? 0 };
}

export async function setMinute(q: Queryable, userId: string, input: z.infer<typeof Minute>) {
  await requireMinute(q);
  const [h, m] = input.time.split(':').map(Number) as [number, number];
  await q.query(
    `insert into public.prayer_minutes (user_id, minute_of_day, time_zone) values ($1, $2, $3)
     on conflict (user_id) do update set minute_of_day = excluded.minute_of_day, time_zone = excluded.time_zone`,
    [userId, h * 60 + m, input.timeZone],
  );
  return myMinute(q, userId);
}

export async function clearMinute(q: Queryable, userId: string) {
  await q.query('delete from public.prayer_minutes where user_id = $1', [userId]);
}

/** Every minute: a gentle notice to each member whose minute it is, with how many share it. Once a day each. */
export function minuteDueTask(q: Queryable): Task {
  return async () => {
    if (!(await settings(q)).prayer_minute_enabled) return;
    const { rows } = await q.query<{ user_id: string; day: string; secular: boolean }>(
      `select m.user_id, to_char(now() at time zone m.time_zone, 'YYYY-MM-DD') as day,
              (select coalesce(c.vocabulary ->> 'wording', case when c.tradition = 'secular' then 'neutral' else 'faith' end) = 'neutral'
                 from public.communities c where c.id = public.member_community_id(m.user_id)) as secular
         from public.prayer_minutes m
        where m.minute_of_day = extract(hour from now() at time zone m.time_zone)::int * 60 + extract(minute from now() at time zone m.time_zone)::int`,
    );
    const others = Math.max(rows.length - 1, 0);
    for (const r of rows) {
      await notifications.notify(q, r.user_id, {
        kind: 'prayer_minute',
        title: r.secular ? 'Your kindness minute' : 'Your prayer minute',
        body: r.secular
          ? `${others > 0 ? `${others} ${others === 1 ? 'other person' : 'others'} chose this minute too. ` : ''}Take a minute to think of someone who could use support.`
          : others > 0
            ? `${others} ${others === 1 ? 'other person' : 'others'} chose this minute too. Pray with them now.`
            : 'Take a minute to pray for someone now.',
        data: { screen: 'prayer-minute' },
        dedupeKey: `prayer_minute:${r.user_id}:${r.day}`,
      });
    }
  };
}

/** The member has the prayer-minute screen open. */
export async function join(q: Queryable, userId: string) {
  await requireMinute(q);
  await q.query(
    `insert into public.prayer_minute_presence (user_id, seen_at) values ($1, now())
     on conflict (user_id) do update set seen_at = now()`,
    [userId],
  );
}

/**
 * The prayer-minute screen: how many people have it open now (seen in the last
 * two minutes, the viewer included) and three requests to pray for, those
 * prayed for least today first. Never the viewer's own, sensitive, crisis,
 * answered or blocked ones, and only in the viewer's communities.
 */
export async function now(q: Queryable, userId: string) {
  if (!(await settings(q)).prayer_minute_enabled) return { enabled: false as const };
  const { rows: c } = await q.query<{ n: number }>("select count(*)::int as n from public.prayer_minute_presence where seen_at > now() - interval '2 minutes'");
  const { rows } = await q.query<{ id: string }>(
    `select p.id from public.posts p
      where p.post_type = 'prayer_request' and p.moderation_status = 'visible' and p.state <> 'answered'
        and not p.is_sensitive and not p.crisis and p.user_id <> $1
        and p.created_at > now() - interval '14 days'
        and p.community_id in (select community_id from public.community_memberships where user_id = $1)
        and not exists (select 1 from public.user_blocks b where (b.user_id = $1 and b.blocked_id = p.user_id) or (b.user_id = p.user_id and b.blocked_id = $1))
        and not exists (select 1 from public.hidden_posts h where h.user_id = $1 and h.post_id = p.id)
      order by (select count(*) from public.prayer_events e where e.post_id = p.id and e.created_at > now() - interval '24 hours'), p.created_at desc
      limit 3`,
    [userId],
  );
  return { enabled: true as const, together: c[0]!.n, requests: await posts.cards(q, rows.map((r) => r.id), userId) };
}

// Housekeeping -----------------------------------------------------------------------

/** Daily: erase guest emails past their time, old presence rows and chain invites nobody answered in 30 days. */
export function purgeTask(q: Queryable): Task {
  return async () => {
    const s = await settings(q);
    await q.query('update public.guest_prayers set email = null where email is not null and created_at < now() - make_interval(days => $1)', [s.guest_email_days]);
    await q.query("delete from public.prayer_minute_presence where seen_at < now() - interval '1 day'");
    await q.query("delete from public.prayer_chain_members where status = 'pending' and created_at < now() - interval '30 days'");
  };
}

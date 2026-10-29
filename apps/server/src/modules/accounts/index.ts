// Accounts module: profiles, onboarding answers, roles, follows, and how a
// person is presented to others (anonymity is applied here, at output time;
// the author link is always stored).
import { FEED_MIX_KEYS, LOCALES, NOTIFICATION_CATEGORIES, PRAY_FOR_SCOPE, type FeedMix, type FeedMixKey, type Locale, type NotificationPrefs } from '@prayer-tower/shared';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, notFound } from '../../errors.js';

export const WHY_HERE = ['pray_for_others', 'prayer_for_myself', 'pray_without_ceasing', 'extend_reach'] as const;
export type Role = 'admin' | 'moderator' | 'pastor' | 'pastor_counselor' | 'prayer_partner' | 'witness' | 'radio_operator';

/** Sites a member may link for outside support: money stays outside the community. */
export const SUPPORT_HOSTS = ['ko-fi.com', 'patreon.com', 'buymeacoffee.com', 'paypal.me', 'www.paypal.me', 'liberapay.com', 'github.com', 'zeffy.com', 'www.zeffy.com', 'opencollective.com'];

export function supportUrlAllowed(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password && SUPPORT_HOSTS.includes(u.hostname.toLowerCase()) && u.pathname.length > 1;
  } catch {
    return false;
  }
}

export const ProfileUpdate = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    handle: z.string().regex(/^[a-z0-9_]{3,30}$/),
    bio: z.string().max(500),
    whyHere: z.array(z.enum(WHY_HERE)).max(WHY_HERE.length),
    supportWanted: z.array(z.string().max(60)).max(20),
    supportOffered: z.array(z.string().max(60)).max(20),
    prayForScope: z.array(z.enum(PRAY_FOR_SCOPE)).max(PRAY_FOR_SCOPE.length),
    traumaContentOptOut: z.boolean(),
    anonymousByDefault: z.boolean(),
    updatesInFirstComment: z.boolean(),
    promptsEnabled: z.boolean(),
    promptMinHours: z.number().int().min(1).max(168).nullable(),
    /** null = the app default (admin setting). */
    promptTone: z.enum(['gentle', 'firm']).nullable(),
    feedMix: z.partialRecord(z.enum(FEED_MIX_KEYS as [FeedMixKey, ...FeedMixKey[]]), z.enum(['less', 'more'])),
    /** App language, for notification text. */
    locale: z.enum(LOCALES),
    /** Weekly email digest (off by default). */
    digestEnabled: z.boolean(),
    /** Gentle prayer stats on Me (on by default). */
    showPrayerStats: z.boolean(),
    /** Optional town ("Carol in Albuquerque"); shown only within the member's community, while switched on. */
    town: z.string().trim().min(1).max(60).nullable(),
    /** Optional outside support page (Ko-fi, Patreon and the like), while switched on. */
    supportUrl: z.url().max(200).refine(supportUrlAllowed, `Use a page on ${SUPPORT_HOSTS.join(', ')}`).nullable(),
    /** Praying across lines: see, and be seen by, one member of another faith community a day (while switched on). */
    openToOtherCommunities: z.boolean(),
    notificationPrefs: z.object({
      off: z.array(z.enum(NOTIFICATION_CATEGORIES)).max(NOTIFICATION_CATEGORIES.length),
      quietHours: z
        .object({
          start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          timeZone: z.string().max(64).refine(validTimeZone, 'Unknown time zone'),
        })
        .nullable(),
    }),
    completeOnboarding: z.boolean(),
  })
  .partial();

const columns: Record<string, string> = {
  displayName: 'display_name',
  handle: 'handle',
  bio: 'bio',
  whyHere: 'why_here',
  supportWanted: 'support_wanted',
  supportOffered: 'support_offered',
  prayForScope: 'pray_for_scope',
  traumaContentOptOut: 'trauma_content_opt_out',
  anonymousByDefault: 'anonymous_by_default',
  updatesInFirstComment: 'updates_in_first_comment',
  promptsEnabled: 'prompts_enabled',
  promptMinHours: 'prompt_min_hours',
  promptTone: 'prompt_tone',
  feedMix: 'feed_mix',
  locale: 'locale',
  digestEnabled: 'digest_enabled',
  showPrayerStats: 'show_prayer_stats',
  notificationPrefs: 'notification_prefs',
  town: 'town',
  supportUrl: 'support_url',
  openToOtherCommunities: 'open_to_other_communities',
};

export function validTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface Profile {
  id: string;
  display_name: string;
  handle: string | null;
  bio: string;
  why_here: string[];
  support_wanted: string[];
  support_offered: string[];
  pray_for_scope: string[];
  trauma_content_opt_out: boolean;
  anonymous_by_default: boolean;
  updates_in_first_comment: boolean;
  prompts_enabled: boolean;
  prompt_min_hours: number | null;
  prompt_tone: 'gentle' | 'firm' | null;
  feed_mix: FeedMix;
  locale: Locale;
  digest_enabled: boolean;
  show_prayer_stats: boolean;
  town: string | null;
  support_url: string | null;
  squire_public: boolean;
  open_to_other_communities: boolean;
  digest_sent_week: string | null;
  notification_prefs: NotificationPrefs;
  onboarded_at: Date | null;
  suspended_until: Date | null;
  deleted_at: Date | null;
  created_at: Date;
}

export async function getProfile(q: Queryable, userId: string): Promise<Profile | null> {
  const { rows } = await q.query<Profile>('select * from public.profiles where id = $1', [userId]);
  return rows[0] ?? null;
}

export async function updateProfile(q: Queryable, userId: string, input: z.infer<typeof ProfileUpdate>): Promise<Profile> {
  const sets: string[] = [];
  const values: unknown[] = [userId];
  for (const [key, value] of Object.entries(input)) {
    const col = columns[key];
    if (!col || value === undefined) continue;
    values.push(value);
    sets.push(`${col} = $${values.length}`);
  }
  if (input.completeOnboarding) sets.push('onboarded_at = coalesce(onboarded_at, now())');
  if (sets.length === 0) throw badRequest('Nothing to update');
  try {
    const { rows } = await q.query<Profile>(`update public.profiles set ${sets.join(', ')} where id = $1 returning *`, values);
    if (!rows[0]) throw notFound('Profile');
    return rows[0];
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('That handle is taken');
    throw err;
  }
}

/** Run in a transaction: the admin check locks the admin rows so two removals can't both pass it. */
export async function revokeRole(q: Queryable, userId: string, role: Role) {
  // Never leave the app without an admin: nobody could grant roles or change settings again.
  if (role === 'admin') {
    const { rows } = await q.query<{ user_id: string }>(`select user_id from public.user_roles where role = 'admin' for update`);
    if (rows.length === 1 && rows[0]!.user_id === userId) throw conflict('This is the last admin. Make someone else an admin first.');
  }
  await q.query('delete from public.user_roles where user_id = $1 and role = $2', [userId, role]);
}

export async function roles(q: Queryable, userId: string): Promise<Role[]> {
  const { rows } = await q.query<{ role: Role }>('select role from public.user_roles where user_id = $1 order by role', [userId]);
  return rows.map((r) => r.role);
}

/** Every member id, for system-wide jobs such as the weekly resupply. */
export async function allMemberIds(q: Queryable): Promise<string[]> {
  const { rows } = await q.query<{ id: string }>('select id from public.profiles order by id');
  return rows.map((r) => r.id);
}

export async function metrics(q: Queryable, since: Date) {
  const { rows } = await q.query(
    `select count(*)::int as members,
            count(*) filter (where created_at >= $1)::int as new_members,
            count(*) filter (where onboarded_at is not null)::int as onboarded
       from public.profiles`,
    [since],
  );
  return rows[0];
}

/** Communities the member sees in their feed. V1 has one: the default Christian ecumenical community. */
export async function communityIds(q: Queryable, userId: string): Promise<string[]> {
  const { rows } = await q.query<{ community_id: string }>(
    'select community_id from public.community_memberships where user_id = $1',
    [userId],
  );
  return rows.map((r) => r.community_id);
}

/** Where the member's new posts go. */
export async function primaryCommunityId(q: Queryable, userId: string): Promise<string> {
  const { rows } = await q.query<{ id: string }>(
    `select coalesce(
       (select community_id from public.community_memberships where user_id = $1 and is_primary),
       public.default_community_id()) as id`,
    [userId],
  );
  return rows[0]!.id;
}

export async function hasRole(q: Queryable, userId: string, ...roles: Role[]): Promise<boolean> {
  const { rows } = await q.query('select 1 from public.user_roles where user_id = $1 and role = any($2::public.app_role[])', [
    userId,
    roles,
  ]);
  return rows.length > 0;
}

export async function grantRole(q: Queryable, userId: string, role: Role, grantedBy: string | null) {
  await q.query('insert into public.user_roles (user_id, role, granted_by) values ($1, $2, $3) on conflict do nothing', [
    userId,
    role,
    grantedBy,
  ]);
}

/**
 * ADMIN_EMAILS: make the listed people admin once their account exists and
 * the address is confirmed (so nobody can claim it by signing up first).
 * With `viaEmail` (production), the confirmation must have come through an
 * email Supabase sent: if Auth's "Confirm email" is off, accounts are
 * confirmed on sign-up, and anyone who knows the address could claim it.
 * Returns how many new admins were made, and the listed accounts skipped for that.
 */
export async function bootstrapAdmins(q: Queryable, emails: string[], opts: { viaEmail?: boolean } = {}): Promise<{ made: number; unverified: number }> {
  const list = emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  await syncInviteExempt(q, list);
  if (!list.length) return { made: 0, unverified: 0 };
  const viaEmail = opts.viaEmail ?? false;
  const { rowCount } = await q.query(
    `insert into public.user_roles (user_id, role, granted_by)
     select u.id, 'admin', null from auth.users u
      where lower(u.email) = any($1::text[]) and u.email_confirmed_at is not null
        and (not $2 or u.confirmation_sent_at is not null)
        and exists (select 1 from public.profiles p where p.id = u.id and p.deleted_at is null)
     on conflict do nothing`,
    [list, viaEmail],
  );
  const { rows } = await q.query<{ n: number }>(
    `select count(*)::int as n from auth.users u
      where $2 and lower(u.email) = any($1::text[]) and u.confirmation_sent_at is null
        and not exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'admin')`,
    [list, viaEmail],
  );
  return { made: rowCount ?? 0, unverified: rows[0]!.n };
}

/** The ADMIN_EMAILS addresses may sign up without an invite code (the invite hook reads this table). */
async function syncInviteExempt(q: Queryable, list: string[]) {
  await q.query(`delete from public.invite_exempt_emails where not (email = any($1::text[]))`, [list]);
  await q.query(`insert into public.invite_exempt_emails (email) select unnest($1::text[]) on conflict do nothing`, [list]);
}

export async function follow(q: Queryable, userId: string, followeeId: string) {
  if (userId === followeeId) throw badRequest('You cannot follow yourself');
  // Deleted members can't be followed, and a block (either way) ends following for good.
  const { rowCount } = await q.query(
    `select 1 from public.profiles p where p.id = $2 and p.deleted_at is null
        and not exists (select 1 from public.user_blocks b
                         where (b.user_id = $1 and b.blocked_id = $2) or (b.user_id = $2 and b.blocked_id = $1))`,
    [userId, followeeId],
  );
  if (!rowCount) throw notFound('Person');
  await q.query('insert into public.follows (user_id, followee_id) values ($1, $2) on conflict do nothing', [userId, followeeId]);
}

export async function unfollow(q: Queryable, userId: string, followeeId: string) {
  await q.query('delete from public.follows where user_id = $1 and followee_id = $2', [userId, followeeId]);
}

/** Whether the viewer follows this person, and how many people do. */
export async function followStatus(q: Queryable, viewerId: string, personId: string) {
  const { rows } = await q.query<{ following: boolean; followers: number }>(
    `select exists (select 1 from public.follows where user_id = $1 and followee_id = $2) as following,
            (select count(*)::int from public.follows where followee_id = $2) as followers`,
    [viewerId, personId],
  );
  return rows[0]!;
}

/** Admin lookup by name or sign-in email, with each person's roles. */
export async function search(q: Queryable, term: string, limit = 20) {
  const { rows } = await q.query<{ id: string; display_name: string; email: string | null; roles: Role[] }>(
    `select p.id, p.display_name, u.email,
            coalesce(array_agg(r.role::text order by r.role) filter (where r.role is not null), '{}')::text[] as roles
       from public.profiles p
       left join auth.users u on u.id = p.id
       left join public.user_roles r on r.user_id = p.id
      where p.display_name ilike '%' || $1 || '%' or u.email ilike '%' || $1 || '%'
      group by p.id, u.email
      order by p.display_name
      limit $2`,
    [term, limit],
  );
  return rows;
}

export async function followers(q: Queryable, userId: string) {
  const { rows } = await q.query(
    `select p.id, p.display_name, p.handle from public.follows f join public.profiles p on p.id = f.user_id
      where f.followee_id = $1 order by f.created_at desc`,
    [userId],
  );
  return rows;
}

/** Everyone the member follows or is followed by: who they can ask to pray. */
export async function connections(q: Queryable, userId: string) {
  const { rows } = await q.query<{ id: string; display_name: string; handle: string | null }>(
    `select p.id, p.display_name, p.handle from public.profiles p
      where p.id <> $1 and p.id in (
        select followee_id from public.follows where user_id = $1
        union select user_id from public.follows where followee_id = $1)
      order by p.display_name`,
    [userId],
  );
  return rows;
}

export async function following(q: Queryable, userId: string) {
  const { rows } = await q.query(
    `select p.id, p.display_name, p.handle from public.follows f join public.profiles p on p.id = f.followee_id
      where f.user_id = $1 order by f.created_at desc`,
    [userId],
  );
  return rows;
}

export interface PublicIdentity {
  id: string | null;
  displayName: string;
  handle: string | null;
  anonymous: boolean;
}

/** How a person appears to a viewer. Anonymous people are shown as "Anonymous" to everyone but themselves. */
export function presentIdentity(
  person: { id: string; display_name: string; handle: string | null },
  isAnonymous: boolean,
  viewerId: string | null,
): PublicIdentity {
  if (isAnonymous && person.id !== viewerId) return { id: null, displayName: 'Anonymous', handle: null, anonymous: true };
  return { id: person.id, displayName: person.display_name || 'Member', handle: person.handle, anonymous: isAnonymous };
}

// Account deletion ------------------------------------------------------------------

// Tables that point at a member "on delete cascade" belong to that member, but
// the profile row stays behind (the ledger needs it), so nothing cascades on its
// own. This sweeps every such table the list in deleteAccount doesn't name, so a feature
// added later can't leave a member's rows behind. Kept: requests (handled
// there), shared group conversations, and staff safety records.
const KEEP_ON_DELETE = new Set(['posts', 'conversations', 'moderation_items', 'harm_events', 'feed_themes']);

async function deleteTheRest(q: Queryable, userId: string) {
  const { rows } = await q.query<{ tbl: string; col: string }>(
    `select c.conrelid::regclass::text as tbl, a.attname as col
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and cardinality(c.conkey) = 1
        and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
        and c.connamespace = 'public'::regnamespace and c.confdeltype = 'c'`,
  );
  for (const r of rows) {
    const table = r.tbl.replace(/^public\./, '');
    if (table === 'profiles' || KEEP_ON_DELETE.has(table)) continue;
    const col = `"${r.col.replace(/"/g, '""')}"`;
    await q.query(`delete from public.${table} where ${col} = $1`, [userId]);
  }
  // A skin the member made stays for the communities using it, no longer tied to them.
  await q.query('update public.feed_themes set owner_id = null where owner_id = $1', [userId]);
}

/**
 * Delete a member's account (App Store Review Guideline 5.1.1(v)). Their
 * sign-in, profile details and everything they wrote or did are removed. Only
 * records the app must keep stay behind, under an anonymous "Deleted member":
 * the append-only token ledger (and any request that holds tokens, emptied of
 * its text) and moderators' decisions. Returns the media paths to remove from storage.
 */
export async function deleteAccount(q: Queryable, userId: string): Promise<string[]> {
  const { rows: media } = await q.query<{ storage_path: string }>('select storage_path from public.post_media where user_id = $1', [userId]);
  // Requests: delete outright, unless the ledger points at them; then empty them and take them down.
  await q.query(
    `delete from public.posts p where p.user_id = $1 and not exists (select 1 from public.token_accounts a where a.post_id = p.id)`,
    [userId],
  );
  await q.query(
    `update public.posts set body = '(deleted)', testimony = null, is_anonymous = true, moderation_status = 'removed' where user_id = $1`,
    [userId],
  );
  for (const sql of [
    'delete from public.post_media where user_id = $1',
    'delete from public.comments where user_id = $1',
    'delete from public.reactions where user_id = $1',
    'delete from public.quick_reactions where user_id = $1',
    'delete from public.meaning_reactions where user_id = $1',
    'delete from public.request_followups where user_id = $1',
    'delete from public.check_backs where user_id = $1',
    'delete from public.kind_milestones_seen where user_id = $1',
    'delete from public.comment_thanks where from_id = $1',
    'delete from public.quiet_count_prefs where user_id = $1',
    'delete from public.thank_note_glad where user_id = $1',
    'delete from public.thank_notes where user_id = $1',
    'delete from public.heated_comments where user_id = $1',
    'delete from public.gratitude_prefs where user_id = $1',
    'delete from public.gratitude_entries where user_id = $1',
    'delete from public.lift_up_entries where user_id = $1',
    'delete from public.partner_pool where user_id = $1',
    'delete from public.kindness_nominations where author_id = $1 or nominated_by = $1',
    'delete from public.partner_checkins where from_id = $1',
    'delete from public.heated_replies where from_id = $1 or to_id = $1',
    'delete from public.cool_downs where a_id = $1 or b_id = $1',
    "delete from public.meaning_proposals where user_id = $1 and status <> 'approved'",
    'update public.meaning_proposals set user_id = null where user_id = $1',
    'update public.partnerships set ended_at = coalesce(ended_at, now()) where a_id = $1 or b_id = $1',
    'delete from public.encourager_volunteers where user_id = $1',
    'delete from public.encourager_checkins where user_id = $1',
    'delete from public.encourager_matches where newcomer_id = $1 or encourager_id = $1',
    // A circle the member started passes to its longest-standing other member; an empty one goes.
    `update public.prayer_circles c set owner_id = (select m.user_id from public.prayer_circle_members m where m.circle_id = c.id and m.user_id <> $1 order by m.joined_at limit 1)
      where c.owner_id = $1 and exists (select 1 from public.prayer_circle_members m where m.circle_id = c.id and m.user_id <> $1)`,
    'delete from public.prayer_circle_invites where created_by = $1',
    'delete from public.prayer_circles where owner_id = $1',
    'delete from public.circle_welcome_seen where user_id = $1',
    'delete from public.circle_prayed where user_id = $1',
    'delete from public.circle_replies where user_id = $1',
    'delete from public.circle_posts where user_id = $1',
    'delete from public.prayer_circle_members where user_id = $1',
    'delete from public.remembered_hidden where user_id = $1',
    'delete from public.fresh_start_days where user_id = $1',
    'delete from public.welcome_dismissed where user_id = $1',
    'delete from public.kind_asks where sender_id = $1',
    'delete from public.mends where hurt_id = $1 or author_id = $1',
    'delete from public.conversation_prefs where user_id = $1',
    'delete from public.meaning_prefs where user_id = $1',
    'delete from public.messages where user_id = $1',
    'delete from public.conversation_members where user_id = $1',
    'delete from public.follows where user_id = $1 or followee_id = $1',
    'delete from public.user_blocks where user_id = $1 or blocked_id = $1',
    'delete from public.thanks where user_id = $1 or recipient_id = $1',
    'delete from public.event_inputs where user_id = $1',
    'delete from public.witness_stories where recipient_id = $1',
    'delete from public.events where created_by = $1',
    'delete from public.event_rsvps where user_id = $1',
    'delete from public.commitments where user_id = $1',
    'delete from public.churches where applicant_id = $1',
    'delete from public.scheduled_spends where user_id = $1',
    'delete from public.care_requests where user_id = $1',
    'delete from public.circle_requests where user_id = $1',
    'delete from public.ai_usage where user_id = $1',
    'delete from public.live_rooms where host_id = $1',
    'delete from public.prayer_prompts where user_id = $1',
    'delete from public.prayer_events where user_id = $1',
    'delete from public.power_prayer_recipients where user_id = $1',
    'delete from public.power_prayers where user_id = $1',
    'delete from public.radio_prayers where user_id = $1',
    'delete from public.token_pool_draws where user_id = $1',
    'delete from public.macro_need_helpers where user_id = $1',
    'delete from public.milestone_awards where user_id = $1',
    'delete from public.priestly_progress where user_id = $1',
    'delete from public.hidden_posts where user_id = $1',
    'delete from public.notifications where user_id = $1',
    'delete from public.push_tokens where user_id = $1',
    'delete from public.feedback where user_id = $1',
    'delete from public.activity_flags where user_id = $1',
    'delete from public.moderation_appeals where user_id = $1',
    'delete from public.user_roles where user_id = $1',
    'delete from public.community_memberships where user_id = $1',
  ]) {
    await q.query(sql, [userId]);
  }
  await deleteTheRest(q, userId);
  await q.query(
    // Every setting goes back to its default too: quiet hours hold a time zone, a hint of where the member lives.
    `update public.profiles set display_name = 'Deleted member', handle = null, bio = default, why_here = default,
            support_wanted = default, support_offered = default, pray_for_scope = default, feed_mix = default,
            trauma_content_opt_out = default, anonymous_by_default = default, updates_in_first_comment = default,
            prompts_enabled = default, prompt_min_hours = default, prompt_tone = default, locale = default,
            digest_enabled = default, digest_sent_week = default, notification_prefs = default,
            show_prayer_stats = default, town = null, support_url = null, squire_public = default, open_to_other_communities = default, thanks_card_dismissed_at = default, onboarded_at = null, deleted_at = now()
      where id = $1`,
    [userId],
  );
  await q.query('delete from auth.users where id = $1', [userId]);
  return media.map((m) => m.storage_path);
}

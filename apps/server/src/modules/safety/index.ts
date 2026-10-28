// Safety module: safe messaging for suicide and self-harm, and new-member
// limits (troll prevention). Rules and sources are in the "Troll Prevention
// and Safe Messaging Rules" doc. Every limit is an admin setting.
import type { Queryable } from '../../db.js';
import { AppError, forbidden } from '../../errors.js';

/** Words that mean someone may be in danger. Errs toward offering support. */
const CRISIS_PATTERN =
  /\b(suicid\w*|kill(ing)? myself|end(ing)? (it all|my life)|take my (own )?life|want(ed)? to die|don'?t want to (live|be alive|wake up)|self[- ]?harm\w*|hurt(ing)? myself|cutting myself|overdos\w*)\b/i;

export const mentionsCrisis = (text: string) => CRISIS_PATTERN.test(text);

const LINK_PATTERN = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|co|app|xyz|info|biz|shop|link)\b/i;

export const hasLink = (text: string) => LINK_PATTERN.test(text);

export interface SafetySettings {
  new_member_limits_enabled: boolean;
  new_member_hours: number;
  new_member_min_prayers: number;
  new_member_posts_per_day: number;
  new_member_comments_per_day: number;
  new_member_links_allowed: boolean;
  messages_enabled: boolean;
  groups_per_member: number;
}

const COLUMNS = Object.keys({
  new_member_limits_enabled: 0,
  new_member_hours: 0,
  new_member_min_prayers: 0,
  new_member_posts_per_day: 0,
  new_member_comments_per_day: 0,
  new_member_links_allowed: 0,
  messages_enabled: 0,
  groups_per_member: 0,
} satisfies Record<keyof SafetySettings, 0>) as (keyof SafetySettings)[];

export async function settings(q: Queryable): Promise<SafetySettings> {
  const { rows } = await q.query<SafetySettings>(`select ${COLUMNS.join(', ')} from public.safety_settings`);
  return rows[0]!;
}

export async function updateSettings(q: Queryable, patch: Partial<SafetySettings>): Promise<SafetySettings> {
  const sets = COLUMNS.map((c, i) => `${c} = coalesce($${i + 1}, ${c})`).join(', ');
  const { rows } = await q.query<SafetySettings>(`update public.safety_settings set ${sets} returning ${COLUMNS.join(', ')}`, [
    ...COLUMNS.map((c) => patch[c] ?? null),
  ]);
  return rows[0]!;
}

/** New until both the waiting period has passed and they have prayed for others enough times. Staff are never new. */
export async function isNewMember(q: Queryable, userId: string, s: SafetySettings): Promise<boolean> {
  const { rows } = await q.query<{ age_hours: number; prayers: number; staff: boolean }>(
    `select extract(epoch from now() - p.created_at) / 3600 as age_hours,
            (select count(*)::int from public.prayer_events e join public.posts po on po.id = e.post_id
              where e.user_id = p.id and po.user_id <> p.id) as prayers,
            exists (select 1 from public.user_roles r where r.user_id = p.id and r.role in ('admin', 'moderator')) as staff
       from public.profiles p where p.id = $1`,
    [userId],
  );
  const r = rows[0];
  if (!r || r.staff) return false;
  return r.age_hours < s.new_member_hours || r.prayers < s.new_member_min_prayers;
}

const LIFT = 'This limit lifts once you have been here a day and prayed for a few requests.';

/** Why a new member can't do `what` yet, or null if they can. */
export async function newMemberBlock(q: Queryable, userId: string, what: string): Promise<string | null> {
  const s = await settings(q);
  if (!s.new_member_limits_enabled || !(await isNewMember(q, userId, s))) return null;
  return `New members can't ${what} yet. ${LIFT}`;
}

export const askBlockedReason = (q: Queryable, userId: string) => newMemberBlock(q, userId, 'ask others to pray');

/** Throws when a new member's post, comment or ask is over a limit. */
export async function checkNewMember(q: Queryable, userId: string, action: 'post' | 'comment' | 'ask', text = '') {
  const s = await settings(q);
  if (!s.new_member_limits_enabled || !(await isNewMember(q, userId, s))) return;
  if (action === 'ask') throw forbidden(`New members can't ask others to pray yet. ${LIFT}`);
  if (!s.new_member_links_allowed && LINK_PATTERN.test(text)) throw forbidden(`New members can't include links yet. ${LIFT}`);
  const [table, cap, noun] =
    action === 'post' ? ['posts', s.new_member_posts_per_day, 'requests'] : ['comments', s.new_member_comments_per_day, 'comments'];
  const { rows } = await q.query<{ n: number }>(
    `select count(*)::int as n from public.${table} where user_id = $1 and created_at > now() - interval '1 day'`,
    [userId],
  );
  if (rows[0]!.n >= cap) throw new AppError(429, 'new_member_limit', `New members can post ${cap} ${noun} a day. ${LIFT}`);
}

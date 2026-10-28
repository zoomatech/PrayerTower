// Events module: prayer meetings, local meet-ups, seminars, outreach days and
// restorative circles (notebook Page 9 #7–8, Page 12 EVENTS, Page 4). V1 has
// no in-app video; an event links to a meeting on an allowed host and/or names
// a place. Members RSVP and get a reminder before it starts.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as moderation from '../moderation/index.js';
import * as notifications from '../notifications/index.js';
import * as safety from '../safety/index.js';

export interface EventSettings {
  events_enabled: boolean;
  new_members_can_host: boolean;
  allowed_video_hosts: string[];
  reminder_minutes: number;
}

export async function settings(q: Queryable): Promise<EventSettings> {
  const { rows } = await q.query<EventSettings>(
    'select events_enabled, new_members_can_host, allowed_video_hosts, reminder_minutes from public.event_settings',
  );
  return rows[0]!;
}

export const SettingsPatch = z.object({
  eventsEnabled: z.boolean().optional(),
  newMembersCanHost: z.boolean().optional(),
  allowedVideoHosts: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).max(50).optional(),
  reminderMinutes: z.number().int().min(0).max(1440).optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>): Promise<EventSettings> {
  const { rows } = await q.query<EventSettings>(
    `update public.event_settings set
       events_enabled = coalesce($1, events_enabled),
       new_members_can_host = coalesce($2, new_members_can_host),
       allowed_video_hosts = coalesce($3, allowed_video_hosts),
       reminder_minutes = coalesce($4, reminder_minutes)
     returning events_enabled, new_members_can_host, allowed_video_hosts, reminder_minutes`,
    [p.eventsEnabled ?? null, p.newMembersCanHost ?? null, p.allowedVideoHosts ?? null, p.reminderMinutes ?? null],
  );
  return rows[0]!;
}

export const KINDS = ['prayer_meeting', 'meetup', 'seminar', 'outreach', 'circle'] as const;

export const NewEvent = z.object({
  kind: z.enum(KINDS).default('prayer_meeting'),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(5).max(1440).default(60),
  videoUrl: z.url({ protocol: /^https$/ }).max(500).optional(),
  location: z.string().trim().min(1).max(200).optional(),
  /** Make it a group's event, seen only by that group's members. */
  groupId: z.uuid().optional(),
});

/** True when the URL's host is an allowed host or a subdomain of one. */
export function allowedVideoUrl(url: string, hosts: string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

async function isGroupMember(q: Queryable, conversationId: string, userId: string) {
  const { rowCount } = await q.query(
    `select 1 from public.conversation_members m join public.conversations c on c.id = m.conversation_id
      where m.conversation_id = $1 and m.user_id = $2 and m.status = 'active' and c.kind = 'group'`,
    [conversationId, userId],
  );
  return !!rowCount;
}

export async function create(q: Queryable, userId: string, input: z.infer<typeof NewEvent>) {
  const s = await settings(q);
  if (!s.events_enabled) throw forbidden('Events are turned off for now');
  if (!s.new_members_can_host) {
    const reason = await safety.newMemberBlock(q, userId, 'host events');
    if (reason) throw forbidden(reason);
  }
  if (!input.videoUrl && !input.location) throw badRequest('Add a video meeting link, a place, or both');
  if (input.videoUrl && !allowedVideoUrl(input.videoUrl, s.allowed_video_hosts)) {
    throw badRequest(`Video links must be on ${s.allowed_video_hosts.slice(0, 4).join(', ')} or another allowed meeting site`);
  }
  if (new Date(input.startsAt).getTime() < Date.now() - 5 * 60_000) throw badRequest('Pick a time in the future');
  if (input.groupId && !(await isGroupMember(q, input.groupId, userId))) throw forbidden('Join the group first');
  // Restorative circles are scheduled by staff (Page 4: move disputes to a video circle).
  if (input.kind === 'circle' && !(await hasRole(q, userId, 'moderator', 'admin', 'pastor_counselor'))) {
    throw forbidden('Restorative circles are scheduled by moderators and pastors');
  }
  const { rows } = await q.query<{ id: string; community_id: string }>(
    `insert into public.events (created_by, kind, title, description, starts_at, duration_minutes, video_url, location, conversation_id, community_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             coalesce((select community_id from public.conversations where id = $9), public.default_community_id()))
     returning id, community_id`,
    [userId, input.kind, input.title, input.description, input.startsAt, input.durationMinutes, input.videoUrl ?? null, input.location ?? null, input.groupId ?? null],
  );
  const id = rows[0]!.id;
  await q.query(`insert into public.event_rsvps (event_id, user_id) values ($1, $2)`, [id, userId]);
  await moderation.queueScan(q, 'event', id);
  if (input.groupId) {
    const { rows: members } = await q.query<{ user_id: string }>(
      `select user_id from public.conversation_members where conversation_id = $1 and status = 'active' and user_id <> $2`,
      [input.groupId, userId],
    );
    for (const m of members) {
      await notifications.notify(q, m.user_id, {
        kind: 'event_new',
        title: 'New event in your group',
        body: `${input.title} · ${new Date(input.startsAt).toUTCString().slice(0, 22)} UTC`,
        data: { eventId: id },
        dedupeKey: `event_new:${id}`,
      });
    }
  }
  return get(q, userId, id);
}

const SELECT = `
  select e.id, e.kind, e.title, e.description, e.starts_at, e.duration_minutes, e.video_url, e.location,
         e.conversation_id, e.cancelled_at, e.created_by,
         coalesce(nullif(p.display_name, ''), 'Member') as host_name,
         (select title from public.conversations c where c.id = e.conversation_id) as group_title,
         (select count(*)::int from public.event_rsvps r where r.event_id = e.id and r.status = 'going') as going,
         (select status from public.event_rsvps r where r.event_id = e.id and r.user_id = $1) as my_rsvp
    from public.events e join public.profiles p on p.id = e.created_by`;

/** Who can see an event: members of its community, and of its group if it has one; never a host they blocked. */
const VISIBLE = `
  e.moderation_status = 'visible'
  and e.community_id = any (select community_id from public.community_memberships where user_id = $1)
  and (e.conversation_id is null or exists (
    select 1 from public.conversation_members m where m.conversation_id = e.conversation_id and m.user_id = $1 and m.status = 'active'))
  and not exists (select 1 from public.user_blocks b where b.user_id = $1 and b.blocked_id = e.created_by)`;

interface Row {
  id: string;
  kind: (typeof KINDS)[number];
  title: string;
  description: string;
  starts_at: Date;
  duration_minutes: number;
  video_url: string | null;
  location: string | null;
  conversation_id: string | null;
  cancelled_at: Date | null;
  created_by: string;
  host_name: string;
  group_title: string | null;
  going: number;
  my_rsvp: 'going' | 'maybe' | null;
}

function present(r: Row, viewerId: string) {
  const ends = new Date(r.starts_at.getTime() + r.duration_minutes * 60_000);
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    startsAt: r.starts_at,
    durationMinutes: r.duration_minutes,
    // The meeting link is shown only to people who said they're coming (keeps strangers out of the call).
    videoUrl: r.my_rsvp || r.created_by === viewerId ? r.video_url : null,
    hasVideo: !!r.video_url,
    location: r.location,
    groupId: r.conversation_id,
    groupTitle: r.group_title,
    host: { id: r.created_by, name: r.host_name },
    isHost: r.created_by === viewerId,
    going: r.going,
    myRsvp: r.my_rsvp,
    cancelled: !!r.cancelled_at,
    live: Date.now() >= r.starts_at.getTime() - 10 * 60_000 && Date.now() <= ends.getTime(),
  };
}

export async function get(q: Queryable, userId: string, id: string) {
  const { rows } = await q.query<Row>(`${SELECT} where e.id = $2 and ${VISIBLE}`, [userId, id]);
  if (!rows[0]) throw notFound('Event');
  return present(rows[0], userId);
}

/** Upcoming and happening-now events I can see, soonest first. */
export async function upcoming(q: Queryable, userId: string, opts: { mine?: boolean; groupId?: string } = {}) {
  const { rows } = await q.query<Row>(
    `${SELECT}
      where ${VISIBLE} and e.cancelled_at is null
        and e.starts_at + make_interval(mins => e.duration_minutes) > now()
        and ($2::boolean is not true or exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = $1))
        and ($3::uuid is null or e.conversation_id = $3)
      order by e.starts_at limit 100`,
    [userId, opts.mine ?? false, opts.groupId ?? null],
  );
  return rows.map((r) => present(r, userId));
}

export async function rsvp(q: Queryable, userId: string, id: string, status: 'going' | 'maybe' | null) {
  const event = await get(q, userId, id);
  if (event.cancelled) throw badRequest('This event was cancelled');
  if (status === null) {
    if (event.isHost) throw badRequest('Hosts are always going; cancel the event instead');
    await q.query('delete from public.event_rsvps where event_id = $1 and user_id = $2', [id, userId]);
  } else {
    await q.query(
      `insert into public.event_rsvps (event_id, user_id, status) values ($1, $2, $3)
       on conflict (event_id, user_id) do update set status = excluded.status`,
      [id, userId, status],
    );
  }
  return get(q, userId, id);
}

/** The host or staff cancel; everyone who RSVP'd is told. */
export async function cancel(q: Queryable, userId: string, id: string) {
  const event = await get(q, userId, id);
  if (!event.isHost && !(await hasRole(q, userId, 'moderator', 'admin'))) throw forbidden('Only the host can cancel this event');
  await q.query('update public.events set cancelled_at = now() where id = $1 and cancelled_at is null', [id]);
  const { rows } = await q.query<{ user_id: string }>('select user_id from public.event_rsvps where event_id = $1 and user_id <> $2', [id, userId]);
  for (const r of rows) {
    await notifications.notify(q, r.user_id, {
      kind: 'event_cancelled',
      title: 'An event was cancelled',
      body: `${event.title} won't happen as planned.`,
      data: { eventId: id },
      dedupeKey: `event_cancelled:${id}`,
    });
  }
}

/** Every few minutes: remind people who are going, `reminder_minutes` before the start. */
export async function sendReminders(q: Queryable): Promise<number> {
  const { rows } = await q.query<{ event_id: string; user_id: string; title: string }>(
    `update public.event_rsvps r set reminded_at = now()
       from public.events e, public.event_settings s
      where e.id = r.event_id and r.status = 'going' and r.reminded_at is null and s.reminder_minutes > 0
        and e.cancelled_at is null and e.moderation_status = 'visible'
        and e.starts_at > now() and e.starts_at <= now() + make_interval(mins => s.reminder_minutes)
     returning r.event_id, r.user_id, e.title`,
  );
  for (const r of rows) {
    await notifications.notify(q, r.user_id, {
      kind: 'event_reminder',
      title: 'Starting soon',
      body: `${r.title} starts soon. Tap to join.`,
      data: { eventId: r.event_id },
      dedupeKey: `event_reminder:${r.event_id}`,
    });
  }
  return rows.length;
}

export function remindTask(q: Queryable): Task {
  return async () => {
    await sendReminders(q);
  };
}

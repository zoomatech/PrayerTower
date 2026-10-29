// Live video rooms, off by default (docs/LIVE_VIDEO.md). Staff start a room and
// members of the same community see it under "Live now". A room is a Jitsi Meet
// room on the server in live_settings.jitsi_url, or a link on one of the
// allowed meeting sites. Nothing is recorded or stored except who opened it.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import { allowedVideoUrl, settings as eventSettings } from '../events/index.js';
import { featureOn, requireFeature } from '../communities/index.js';
import * as practice from '../practice-mode/index.js';
import { isJaasRoom, jaasJoinUrl, jaasRoomUrl, type JaasKeys } from './jaas.js';

/** What the paid and practice room options need: JaaS keys (JAAS_*) and this server's address for practice rooms. */
export interface LiveOptions {
  jaas?: JaasKeys | null;
  base?: string;
}

export interface LiveSettings {
  enabled: boolean;
  jitsi_url: string | null;
  max_minutes: number;
  /** Private video circles for a dispute (modules/video-circles). They use the same video server. */
  circles_enabled: boolean;
}

export async function settings(q: Queryable): Promise<LiveSettings> {
  const { rows } = await q.query<LiveSettings>('select enabled, jitsi_url, max_minutes, circles_enabled from public.live_settings');
  return rows[0]!;
}

export const SettingsPatch = z.object({
  enabled: z.boolean().optional(),
  /** Empty string clears it. */
  jitsiUrl: z.union([z.literal(''), z.url().regex(/^https:\/\//, 'Use an https:// address')]).optional(),
  maxMinutes: z.number().int().min(15).max(720).optional(),
  circlesEnabled: z.boolean().optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  const url = p.jitsiUrl === undefined ? undefined : p.jitsiUrl.replace(/\/+$/, '') || null;
  await q.query(
    `update public.live_settings set enabled = coalesce($1, enabled), max_minutes = coalesce($2, max_minutes),
       jitsi_url = case when $3::boolean then $4 else jitsi_url end, circles_enabled = coalesce($5, circles_enabled)`,
    [p.enabled ?? null, p.maxMinutes ?? null, url !== undefined, url ?? null, p.circlesEnabled ?? null],
  );
  return settings(q);
}

/** Who may start a room: staff who already run events, circles and care. */
const HOSTS = ['admin', 'moderator', 'pastor', 'pastor_counselor'] as const;

export async function canHost(q: Queryable, userId: string) {
  return hasRole(q, userId, ...HOSTS);
}

export interface LiveRoom {
  id: string;
  title: string;
  roomUrl: string;
  hostName: string;
  isMine: boolean;
  startedAt: string;
}

/** Rooms live now in the member's community, newest first. */
export async function liveNow(q: Queryable, userId: string, opts: LiveOptions = {}) {
  const s = await settings(q);
  if (!s.enabled || !(await featureOn(q, userId, 'live'))) return { enabled: false, canHost: false, canCreateRoom: false, rooms: [] as LiveRoom[] };
  const { rows } = await q.query<LiveRoom>(
    `select r.id, r.title, r.room_url as "roomUrl", p.display_name as "hostName", r.host_id = $1 as "isMine", r.started_at as "startedAt"
       from public.live_rooms r join public.profiles p on p.id = r.host_id
      where r.ended_at is null and r.started_at > now() - make_interval(mins => $2)
        and r.community_id = public.member_community_id($1)
      order by r.started_at desc limit 20`,
    [userId, s.max_minutes],
  );
  const practiceOn = (await practice.settings(q)).live;
  for (const r of rows) r.roomUrl = await joinUrl(q, r.roomUrl, userId, r.isMine, opts);
  return { enabled: true, canHost: await canHost(q, userId), canCreateRoom: !!s.jitsi_url || !!opts.jaas || practiceOn, rooms: rows };
}

/** The address this member opens: practice rooms are served here, and JaaS rooms need a signed join link (the host joins as moderator). */
export async function joinUrl(q: Queryable, roomUrl: string, userId: string, host: boolean, opts: LiveOptions = {}) {
  if (practice.isPracticeRoom(roomUrl)) return practice.practiceRoomUrl(roomUrl, opts.base ?? '');
  if (opts.jaas && isJaasRoom(opts.jaas, roomUrl)) return jaasJoinUrl(opts.jaas, roomUrl, { id: userId, name: await displayName(q, userId), moderator: host });
  return roomUrl;
}

/** A new room with a long random name, so nobody can guess it: own Jitsi server first, then JaaS, then a practice room. Null when none is set up. */
export async function newRoomUrl(q: Queryable, opts: LiveOptions = {}) {
  const s = await settings(q);
  const name = `PrayerTower-${randomBytes(12).toString('base64url')}`;
  if (s.jitsi_url) return `${s.jitsi_url}/${name}`;
  if (opts.jaas) return jaasRoomUrl(opts.jaas, name);
  if ((await practice.settings(q)).live) return practice.practiceRoom(name);
  return null;
}

async function displayName(q: Queryable, userId: string) {
  const { rows } = await q.query<{ display_name: string }>('select display_name from public.profiles where id = $1', [userId]);
  return rows[0]?.display_name ?? 'Member';
}

export const Start = z.object({
  title: z.string().trim().min(1).max(120),
  /** A meeting link from an allowed site; leave it out to open a new room on the Jitsi server. */
  link: z.url().optional(),
});

export async function start(q: Queryable, userId: string, input: z.infer<typeof Start>, opts: LiveOptions = {}) {
  await requireFeature(q, userId, 'live');
  const s = await settings(q);
  if (!s.enabled) throw forbidden('Live video is not available');
  if (!(await canHost(q, userId))) throw forbidden('Only staff can start a live room');
  let roomUrl: string;
  if (input.link) {
    const hosts = (await eventSettings(q)).allowed_video_hosts;
    if (!allowedVideoUrl(input.link, hosts)) throw badRequest(`Live links must be on ${hosts.slice(0, 4).join(', ')} or another allowed meeting site`);
    roomUrl = input.link;
  } else {
    const url = await newRoomUrl(q, opts);
    if (!url) throw badRequest('No video server is set up. Paste a meeting link instead.');
    roomUrl = url;
  }
  const { rows } = await q.query<{ id: string }>(
    `insert into public.live_rooms (host_id, community_id, title, room_url) values ($1, public.member_community_id($1), $2, $3) returning id`,
    [userId, input.title, roomUrl],
  );
  return { id: rows[0]!.id, roomUrl };
}

export async function end(q: Queryable, userId: string, id: string) {
  const { rows } = await q.query<{ host_id: string }>('select host_id from public.live_rooms where id = $1 and ended_at is null', [id]);
  if (!rows[0]) throw notFound('Live room');
  if (rows[0].host_id !== userId && !(await hasRole(q, userId, 'admin', 'moderator'))) throw forbidden('Only the host or a moderator can end this room');
  await q.query('update public.live_rooms set ended_at = now() where id = $1', [id]);
  return { ended: true };
}

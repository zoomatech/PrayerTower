// "Where it was heard" (docs/STATION_OPERATOR_GUIDE.md, "Where it was heard"),
// from the HAM Operators notebook page: the trail of receivers that really
// decoded a radio prayer, never an estimate of reach. Off until an admin turns
// on heard_trail_enabled. A listener node is named, with its signal; a phone or
// listening page is never identified, only counted. The member who sent the
// prayer and the person who asked see the trail on the request.
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select heard_trail_enabled as on from public.token_settings');
  return rows[0]!.on;
}

export async function setEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set heard_trail_enabled = $1', [on]);
}

/** Keep who heard these radio prayers (receipts.heard). `node` is null for a phone or listening page. */
export async function record(q: Queryable, radioPrayerIds: string[], snrDb: number, node: { id: string; name: string } | null) {
  if (!radioPrayerIds.length || !(await enabled(q))) return;
  await q.query(
    `insert into public.radio_prayer_heard (radio_prayer_id, node_id, heard_by, snr_db)
     select unnest($1::uuid[]), $2::uuid, $3::text, $4::real
     on conflict (radio_prayer_id, node_id) where node_id is not null
       do update set snr_db = greatest(public.radio_prayer_heard.snr_db, excluded.snr_db)`,
    [radioPrayerIds, node?.id ?? null, node?.name ?? null, snrDb],
  );
}

export interface TrailEntry {
  sentAt: string;
  callSign: string | null;
  amplified: boolean;
  nodes: { name: string; snrDb: number; at: string }[];
  phones: number;
}

/** The trail for a request: each transmission the viewer sent, or of the viewer's own request, with who heard it. */
export async function forPost(q: Queryable, viewerId: string, postId: string): Promise<TrailEntry[]> {
  if (!(await enabled(q))) throw notFound('Where it was heard');
  const { rows } = await q.query<{ sent_at: Date; call_sign: string | null; repeats: number; nodes: { name: string; snrDb: number; at: string }[]; phones: number }>(
    `select r.transmitted_at as sent_at, r.call_sign, r.repeats,
            coalesce((select json_agg(json_build_object('name', h.heard_by, 'snrDb', round(h.snr_db::numeric, 1), 'at', h.heard_at) order by h.heard_at)
                        from public.radio_prayer_heard h where h.radio_prayer_id = r.id and h.heard_by is not null), '[]') as nodes,
            (select count(*)::int from public.radio_prayer_heard h where h.radio_prayer_id = r.id and h.node_id is null and h.heard_by is null) as phones
       from public.radio_prayers r join public.posts p on p.id = r.post_id
      where r.post_id = $2 and r.status = 'transmitted' and (r.user_id = $1 or p.user_id = $1)
      order by r.transmitted_at desc limit 20`,
    [viewerId, postId],
  );
  return rows.map((r) => ({ sentAt: r.sent_at.toISOString(), callSign: r.call_sign, amplified: r.repeats > 1, nodes: r.nodes.map((n) => ({ ...n, snrDb: Number(n.snrDb) })), phones: r.phones }));
}

// "Answered" on the air (docs/RADIO_BURST.md, "Answered: a thanksgiving burst"),
// off until an admin turns on radio_thanksgiving_enabled. When a member marks
// answered a request that already went out by radio, one short thanksgiving is
// queued for the station: free, at most once per request, sent like any other
// radio prayer (moderation holds, windows and the content filter all apply).
// Open Circle requests get wording with no religious words.
import type { Queryable } from '../../db.js';
import { enqueue } from '../../jobs.js';

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select radio_thanksgiving_enabled as on from public.token_settings');
  return rows[0]!.on;
}

export async function setEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set radio_thanksgiving_enabled = $1', [on]);
}

/** The words that go on the air: the opening, then the start of the request. */
export function thanksText(body: string, neutral: boolean, max = 160): string {
  const lead = neutral ? 'Good news, answered. Thank you for your support: ' : 'Answered! Thank you for praying: ';
  const room = max - lead.length;
  const text = body.replace(/\s+/g, ' ').trim();
  return lead + (text.length > room ? `${text.slice(0, room - 3).trimEnd()}...` : text);
}

/**
 * Queue the thanksgiving for an answered request, if the switch is on and the
 * request went out by radio at least once. Returns the new radio prayer's id, or null.
 */
export async function onAnswered(q: Queryable, postId: string): Promise<string | null> {
  if (!(await enabled(q))) return null;
  const { rows } = await q.query<{ id: string }>(
    `insert into public.radio_prayers (post_id, user_id, cost, idempotency_key, repeats, funded_by, kind, sent_text)
     select p.id, p.user_id, 0, 'thanksgiving:' || p.id, 1, 'free', 'thanksgiving', $2
       from public.posts p
      where p.id = $1 and p.state = 'answered' and not p.is_sensitive and p.moderation_status = 'visible'
        and exists (select 1 from public.radio_prayers r where r.post_id = p.id and r.kind in ('prayer', 'auto') and r.status = 'transmitted')
     on conflict do nothing
     returning id`,
    [postId, await textFor(q, postId)],
  );
  const id = rows[0]?.id ?? null;
  if (id) await enqueue(q, 'radio_transmit', { radioPrayerId: id }, { jobKey: `radio_transmit:${id}` });
  return id;
}

async function textFor(q: Queryable, postId: string): Promise<string> {
  const { rows } = await q.query<{ body: string; neutral: boolean }>(
    `select p.body, coalesce(c.vocabulary ->> 'wording', case when c.tradition = 'secular' then 'neutral' else 'faith' end) = 'neutral' as neutral
       from public.posts p join public.communities c on c.id = p.community_id where p.id = $1`,
    [postId],
  );
  const r = rows[0];
  return r ? thanksText(r.body, r.neutral) : '';
}

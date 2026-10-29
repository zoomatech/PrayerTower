// The order the station is handed queued radio prayers (claimNext), shared with the
// operator console's "next up" list so the operator sees the real order.
// Over a join of radio_prayers r and posts p.

/** By need puts the most urgent, least-prayed-for request first. */
const NEED_ORDER = `p.urgency desc, (select count(*) from public.prayer_events e where e.post_id = p.id) asc, r.id`;
/** Urgent first: "Today" and "Right now" requests ahead of the rest. */
const URGENT_LEVEL = 2;
const URGENT_FIRST = `(p.urgency >= ${URGENT_LEVEL}) desc, `;

/** Free automatic sends (fair air's every-request sends, ceaseless re-sends) go after members' own prayers. */
export function queueOrder(s: { radio_urgent_first: boolean; radio_order: string }): string {
  return `(r.kind in ('auto', 'ceaseless')), ${s.radio_urgent_first ? URGENT_FIRST : ''}${s.radio_order === 'need' ? NEED_ORDER : 'r.id'}`;
}

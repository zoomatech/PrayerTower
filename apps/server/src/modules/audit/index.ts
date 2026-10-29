// Staff audit log: after a staff route succeeds, who did what to which record.
// Recorded by a hook on the signed-in routes (see app.ts), so a new staff route
// is covered by adding its pattern below.
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Queryable } from '../../db.js';

/**
 * Routes that change something on behalf of staff. Every /admin route is
 * staff-only. The rest are logged only when the member has a staff role, since
 * some (closing a care request, ending a macro need) members can call too.
 */
const STAFF_ROUTES = new Set([
  'POST /moderation/items/:id/decision',
  'POST /moderation/items/bulk',
  'POST /moderation/items/:id/escalate',
  'POST /moderation/appeals/:id/decision',
  'POST /moderation/activity-flags/:id',
  'POST /posts/:id/witness',
  'PATCH /witness/cases/:id',
  'POST /witness/cases/:id/notes',
  'POST /care-requests/:id/claim',
  'POST /care-requests/:id/close',
  'POST /macro-needs',
  'POST /macro-needs/:id/end',
  'POST /macro-needs/:id/helped',
  'PATCH /radio/console',
]);
/** Bodies that hold pastoral, private or legal-case text: the action is logged, the text is not. */
const NO_BODY = new Set(['POST /witness/cases/:id/notes', 'PATCH /witness/cases/:id', 'POST /admin/legal/cases', 'POST /admin/legal/cases/:id/notes', 'POST /moderation/items/:id/escalate']);
/**
 * Bodies that name people who may not be members (an invitee's email, a church's
 * member list): the settings are logged, the people are not.
 */
const SHAPE_BODY: Record<string, (body: Record<string, unknown>) => Record<string, unknown>> = {
  'POST /admin/import': ({ csv, ...rest }) => ({ ...rest, csvLines: typeof csv === 'string' ? csv.split(/\r?\n/).filter((l) => l.trim()).length : 0 }),
  'POST /admin/invites/:code/email': ({ email: _email, ...rest }) => rest,
};
const MAX_BODY_CHARS = 4000;
/** Runs of text between separators; each run is checked for an email address without backtracking. */
const WORD = /[^\s"<>,;:]+/g;
const looksLikeEmail = (w: string) => {
  const at = w.indexOf('@');
  return at > 0 && w.indexOf('.', at + 2) !== -1;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function auditedAction(method: string, url: string | undefined): string | null {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || !url) return null;
  const action = `${method} ${url}`;
  return url.startsWith('/admin/') || STAFF_ROUTES.has(action) ? action : null;
}

export const bodyOf = (action: string, body: unknown) => {
  if (NO_BODY.has(action) || body === undefined || body === null) return null;
  const shape = SHAPE_BODY[action];
  if (shape && typeof body === 'object' && !Array.isArray(body)) body = shape(body as Record<string, unknown>);
  // Any other email address (an invite note, a free-text field) is blanked as well.
  const json = JSON.stringify(body).replace(WORD, (w) => (looksLikeEmail(w) ? '[email]' : w));
  return json.length > MAX_BODY_CHARS ? { truncated: json.slice(0, MAX_BODY_CHARS) } : JSON.parse(json);
};

/** onSend hook: records successful staff changes before the reply goes out. Never fails the request. */
export function auditHook(db: Queryable) {
  return async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const actor = req.auth?.userId;
    const action = auditedAction(req.method, req.routeOptions?.url);
    // A replayed answer (an offline retry, see modules/idempotency) changed nothing new.
    if (!actor || !action || reply.statusCode >= 400 || reply.getHeader('idempotent-replay')) return payload;
    try {
      const params = (req.params ?? {}) as Record<string, string>;
      await db.query(
        `insert into public.staff_audit_log (actor_id, action, target_id, params, body, status)
         select $1, $2, $3, $4, $5, $6
          where $7 or exists (select 1 from public.user_roles where user_id = $1)`,
        [actor, action, UUID.test(params.id ?? '') ? params.id : null, params, bodyOf(action, req.body), reply.statusCode, action.includes(' /admin/')],
      );
    } catch (err) {
      req.log.error({ err, action }, 'staff audit log write failed');
    }
    return payload;
  };
}

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_id: string | null;
  params: Record<string, string>;
  body: unknown;
  status: number;
  created_at: string;
}

export interface ListOptions {
  actorId?: string;
  targetId?: string;
  before?: string;
  /** With `before`: the id of the last entry shown, so entries sharing its time aren't skipped. */
  beforeId?: string;
  limit: number;
  /** Moderation tools: part of the action ('moderation', 'PATCH /admin/'), words anywhere in the entry, and a start time. */
  action?: string;
  q?: string;
  since?: string;
}

/** `ilike` text matching `s` anywhere, with its wildcards taken literally. */
export const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function list(q: Queryable, opts: ListOptions): Promise<AuditEntry[]> {
  const { rows } = await q.query<AuditEntry>(
    `select l.id, l.actor_id, p.display_name as actor_name, l.action, l.target_id, l.params, l.body, l.status, l.created_at
       from public.staff_audit_log l left join public.profiles p on p.id = l.actor_id
      where ($1::uuid is null or l.actor_id = $1) and ($2::uuid is null or l.target_id = $2) 
        -- Pages compare whole milliseconds, as the app receives them: a time cut to the
        -- millisecond, or entries written in one transaction, would otherwise drop off a page.
        and ($3::timestamptz is null or (date_trunc('milliseconds', l.created_at), l.id) < ($3, coalesce($8::uuid, '00000000-0000-0000-0000-000000000000')))
        and ($5::text is null or l.action ilike $5)
        and ($6::text is null or concat_ws(' ', l.action, p.display_name, l.target_id::text, l.body::text) ilike $6)
        and ($7::timestamptz is null or l.created_at >= $7)
      order by date_trunc('milliseconds', l.created_at) desc, l.id desc limit $4`,
    [opts.actorId ?? null, opts.targetId ?? null, opts.before ?? null, opts.limit, opts.action ? like(opts.action) : null, opts.q ? like(opts.q) : null, opts.since ?? null, opts.beforeId ?? null],
  );
  return rows;
}

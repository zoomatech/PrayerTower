// Seeding beneficial prayers (migration 20261029003400_seed_prayers.sql). Off by default.
// Staff keep a library. Nothing is posted until an admin approves the text, and approved
// prayers are posted from one real staff account, at most max_per_day a day.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import * as accounts from '../accounts/index.js';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, notFound } from '../../errors.js';
import * as posts from '../posts/index.js';

export interface SeedSettings {
  enabled: boolean;
  publish_as: string | null;
  max_per_day: number;
}

export async function settings(q: Queryable): Promise<SeedSettings> {
  const { rows } = await q.query<SeedSettings>('select enabled, publish_as, max_per_day from public.seed_prayer_settings');
  return rows[0]!;
}

export const SettingsPatch = z.object({
  enabled: z.boolean().optional(),
  publishAs: z.uuid().nullable().optional(),
  maxPerDay: z.number().int().min(1).max(24).optional(),
});

async function isStaff(q: Queryable, userId: string) {
  return (await accounts.hasRole(q, userId, 'admin')) || (await accounts.hasRole(q, userId, 'moderator'));
}

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  if (p.publishAs && !(await isStaff(q, p.publishAs))) throw badRequest('Seed prayers must be posted from a staff account (admin or moderator)');
  await q.query(
    `update public.seed_prayer_settings set enabled = coalesce($1, enabled),
            publish_as = case when $2 then $3::uuid else publish_as end, max_per_day = coalesce($4, max_per_day)`,
    [p.enabled ?? null, p.publishAs !== undefined, p.publishAs ?? null, p.maxPerDay ?? null],
  );
  return settings(q);
}

const SEED_TYPES = ['open_prayer', 'praise', 'prayer_request', 'testimony'] as const;
const Body = posts.NewPost.shape.body;

export const NewSeed = z.object({
  postType: z.enum(SEED_TYPES).default('open_prayer'),
  body: Body,
  theme: z.string().trim().max(40).optional(),
  publishAfter: z.iso.datetime({ offset: true }).optional(),
});

export const SeedPatch = z.object({
  postType: z.enum(SEED_TYPES).optional(),
  body: Body.optional(),
  theme: z.string().trim().max(40).nullable().optional(),
  publishAfter: z.iso.datetime({ offset: true }).nullable().optional(),
});

export interface SeedPrayer {
  id: string;
  post_type: string;
  body: string;
  theme: string | null;
  status: 'draft' | 'approved' | 'published' | 'retired';
  publish_after: Date | null;
  approved_at: Date | null;
  published_post_id: string | null;
  published_at: Date | null;
  created_at: Date;
}

const COLUMNS = 'id, post_type, body, theme, status, publish_after, approved_at, published_post_id, published_at, created_at';

export const ListFilter = z.object({ status: z.enum(['draft', 'approved', 'published', 'retired']).optional() });

export async function list(q: Queryable, f: z.infer<typeof ListFilter>): Promise<SeedPrayer[]> {
  const { rows } = await q.query<SeedPrayer>(
    `select ${COLUMNS} from public.seed_prayers where ($1::public.seed_prayer_status is null or status = $1)
      order by (status = 'approved') desc, publish_after nulls first, id desc limit 500`,
    [f.status ?? null],
  );
  return rows;
}

async function get(q: Queryable, id: string, lock = false): Promise<SeedPrayer> {
  const { rows } = await q.query<SeedPrayer>(`select ${COLUMNS} from public.seed_prayers where id = $1${lock ? ' for update' : ''}`, [id]);
  if (!rows[0]) throw notFound('Seed prayer');
  return rows[0];
}

export async function create(q: Queryable, adminId: string, s: z.infer<typeof NewSeed>) {
  const { rows } = await q.query<{ id: string }>(
    `insert into public.seed_prayers (post_type, body, theme, publish_after, created_by) values ($1, $2, $3, $4, $5) returning id`,
    [s.postType, s.body, s.theme ?? null, s.publishAfter ?? null, adminId],
  );
  return get(q, rows[0]!.id);
}

/** Editing an approved prayer sends it back to draft: changed text needs approving again. */
export async function update(q: Queryable, id: string, p: z.infer<typeof SeedPatch>) {
  const s = await get(q, id, true);
  if (s.status === 'published' || s.status === 'retired') throw conflict(`This prayer is ${s.status}`);
  const textChanged = (p.body !== undefined && p.body !== s.body) || (p.postType !== undefined && p.postType !== s.post_type);
  await q.query(
    `update public.seed_prayers set post_type = coalesce($2, post_type), body = coalesce($3, body),
            theme = case when $4 then $5 else theme end, publish_after = case when $6 then $7::timestamptz else publish_after end,
            status = case when $8 then 'draft'::public.seed_prayer_status else status end,
            approved_by = case when $8 then null else approved_by end, approved_at = case when $8 then null else approved_at end,
            updated_at = now()
      where id = $1`,
    [id, p.postType ?? null, p.body ?? null, p.theme !== undefined, p.theme ?? null, p.publishAfter !== undefined, p.publishAfter ?? null, textChanged],
  );
  return get(q, id);
}

export async function approve(q: Queryable, adminId: string, id: string) {
  const s = await get(q, id, true);
  if (s.status !== 'draft') throw conflict(`Only drafts can be approved (this one is ${s.status})`);
  await q.query(`update public.seed_prayers set status = 'approved', approved_by = $2, approved_at = now(), updated_at = now() where id = $1`, [id, adminId]);
  return get(q, id);
}

export async function retire(q: Queryable, id: string) {
  const s = await get(q, id, true);
  if (s.status === 'published' || s.status === 'retired') throw conflict(`This prayer is already ${s.status}`);
  await q.query(`update public.seed_prayers set status = 'retired', updated_at = now() where id = $1`, [id]);
  return get(q, id);
}

/** Post one approved prayer from the staff account. Works with the switch off too, so an admin can post one by hand. */
export async function publish(q: Queryable, id: string) {
  const s = await get(q, id, true);
  if (s.status !== 'approved') throw conflict('Only approved prayers can be posted');
  const cfg = await settings(q);
  if (!cfg.publish_as) throw conflict('Choose the staff account seed prayers are posted from first (publishAs)');
  if (!(await isStaff(q, cfg.publish_as))) throw conflict('The publishing account is no longer staff');
  const post = await posts.create(q, cfg.publish_as, posts.NewPost.parse({ postType: s.post_type, body: s.body, isAnonymous: false }));
  await q.query(`update public.seed_prayers set status = 'published', published_post_id = $2, published_at = now(), updated_at = now() where id = $1`, [
    id,
    post.id,
  ]);
  return get(q, id);
}

/** Every 15 minutes: post approved, due prayers while the switch is on, up to max_per_day in 24 hours. */
export async function publishDue(q: Queryable): Promise<number> {
  const cfg = await settings(q);
  if (!cfg.enabled || !cfg.publish_as) return 0;
  const { rows: today } = await q.query<{ n: number }>(`select count(*)::int as n from public.seed_prayers where published_at > now() - interval '1 day'`);
  let room = cfg.max_per_day - today[0]!.n;
  let posted = 0;
  while (room-- > 0) {
    const { rows } = await q.query<{ id: string }>(
      `select id from public.seed_prayers where status = 'approved' and (publish_after is null or publish_after <= now())
        order by publish_after nulls first, id limit 1`,
    );
    if (!rows[0]) break;
    await publish(q, rows[0].id);
    posted++;
  }
  return posted;
}

export function publishDueTask(): Task {
  return async (_payload, helpers) => {
    await helpers.withPgClient(async (client) => {
      await client.query('begin');
      try {
        // One run at a time: a second worker waits here instead of posting twice.
        await client.query('select 1 from public.seed_prayer_settings for update');
        await publishDue(client);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    });
  };
}

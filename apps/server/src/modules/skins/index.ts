// Feed skins (Steve, 2026-10-29; docs/FEED_SKINS.md). Each part is off until an
// admin turns it on (skin_settings):
//   * gated skins in Me → Feed style: Beanstalk, Golden Wood, Moonlit Gate and
//     the full-screen Wall (feed_themes.gated);
//   * comments as branches and leaves: a few leaves per branch, the rest fade
//     into a blur, and replies stop at a set depth. For encouragement, not debate;
//   * the theme maker: a member builds a skin (layout, colors, leaf shape, stem,
//     backdrop) and can use it at once; others see it only after an admin
//     approves it into the community (feed_themes.owner_id);
//   * the longest video a member can attach (7 seconds by default);
//   * seasonal skins, offered only in their season (feed_themes.season, seasonsOn());
//   * the skin gallery: previews, who made each skin, likes and "Use this skin".
import { CHURCH_SEASONS, COMMENT_TEXT, contrastRatio, seasonsOn, WEATHER_SEASONS } from '@prayer-tower/shared';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { primaryCommunityId } from '../accounts/index.js';

export interface SkinSettings {
  skins_enabled: boolean;
  comment_tree_enabled: boolean;
  comment_tree_leaves: number;
  comment_tree_max_depth: number;
  proposals_enabled: boolean;
  video_max_seconds: number;
  seasonal_enabled: boolean;
  seasonal_auto: boolean;
  gallery_enabled: boolean;
}

export async function settings(q: Queryable): Promise<SkinSettings> {
  const { rows } = await q.query<SkinSettings>(
    `select skins_enabled, comment_tree_enabled, comment_tree_leaves, comment_tree_max_depth, proposals_enabled, video_max_seconds,
            seasonal_enabled, seasonal_auto, gallery_enabled
       from public.skin_settings`,
  );
  return rows[0]!;
}

export const SettingsPatch = z.object({
  skinsEnabled: z.boolean().optional(),
  commentTreeEnabled: z.boolean().optional(),
  commentTreeLeaves: z.number().int().min(1).max(20).optional(),
  commentTreeMaxDepth: z.number().int().min(0).max(6).optional(),
  proposalsEnabled: z.boolean().optional(),
  videoMaxSeconds: z.number().int().min(1).max(600).optional(),
  seasonalEnabled: z.boolean().optional(),
  seasonalAuto: z.boolean().optional(),
  galleryEnabled: z.boolean().optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.skin_settings set
       skins_enabled = coalesce($1, skins_enabled), comment_tree_enabled = coalesce($2, comment_tree_enabled),
       comment_tree_leaves = coalesce($3, comment_tree_leaves), comment_tree_max_depth = coalesce($4, comment_tree_max_depth),
       proposals_enabled = coalesce($5, proposals_enabled), video_max_seconds = coalesce($6, video_max_seconds),
       seasonal_enabled = coalesce($7, seasonal_enabled), seasonal_auto = coalesce($8, seasonal_auto),
       gallery_enabled = coalesce($9, gallery_enabled)`,
    [
      p.skinsEnabled ?? null,
      p.commentTreeEnabled ?? null,
      p.commentTreeLeaves ?? null,
      p.commentTreeMaxDepth ?? null,
      p.proposalsEnabled ?? null,
      p.videoMaxSeconds ?? null,
      p.seasonalEnabled ?? null,
      p.seasonalAuto ?? null,
      p.galleryEnabled ?? null,
    ],
  );
  return settings(q);
}

/** The switches the app needs. The two numbers ride along so the app can show the same limits. */
export async function features(q: Queryable) {
  const s = await settings(q);
  return {
    feedSkins: s.skins_enabled,
    commentTree: s.comment_tree_enabled,
    commentTreeLeaves: s.comment_tree_leaves,
    commentTreeMaxDepth: s.comment_tree_max_depth,
    themeProposals: s.proposals_enabled,
    videoMaxSeconds: s.video_max_seconds,
    skinGallery: s.skins_enabled && s.gallery_enabled,
  };
}

/**
 * SQL that keeps a feed_themes row `t` out of sight while it shouldn't show: retired,
 * gated with skins off, or seasonal out of season (or seasonal skins off). `seasons`
 * is the placeholder for today's seasons, e.g. '$2'.
 */
export const themeVisible = (seasons: string) =>
  `(t.status <> 'retired' and (not t.gated or (select skins_enabled from public.skin_settings))
    and (t.season is null or ((select seasonal_enabled from public.skin_settings) and t.season = any(${seasons}::text[]))))`;

/** Today's seasons for themeVisible(). */
export const seasonsNow = (now = new Date()) => seasonsOn(now);

// Limits used by posts/ ------------------------------------------------------------------

/**
 * Videos longer than the cap are refused. The app reports each clip's length
 * from the picker; a clip without one is let through (older app builds).
 */
export async function checkVideos(q: Queryable, media: { kind: string; durationMs?: number | undefined }[]) {
  if (!media.some((m) => m.kind === 'video' && m.durationMs != null)) return;
  const { video_max_seconds: max } = await settings(q);
  // Picker lengths are rounded; allow half a second over.
  if (media.some((m) => m.kind === 'video' && (m.durationMs ?? 0) > max * 1000 + 500)) throw badRequest(`Videos can be up to ${max} seconds long for now`);
}

/** While the comment tree is on, replies stop at comment_tree_max_depth. */
export async function checkReplyDepth(q: Queryable, parentId: string | undefined) {
  if (!parentId) return;
  const s = await settings(q);
  if (!s.comment_tree_enabled) return;
  const { rows } = await q.query<{ depth: number }>(
    `with recursive up as (
       select id, parent_id, 0 as depth from public.comments where id = $1
       union all
       select c.id, c.parent_id, up.depth + 1 from public.comments c join up on c.id = up.parent_id where up.depth < 20)
     select max(depth)::int as depth from up`,
    [parentId],
  );
  // The parent sits at `depth`, so the reply would sit one deeper.
  if ((rows[0]?.depth ?? 0) + 1 > s.comment_tree_max_depth) throw badRequest('This branch has grown as far as it can. Reply to an earlier comment instead.');
}

// Member-proposed skins ------------------------------------------------------------------

const Hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Colors are #RRGGBB');

export const MAKER_LAYOUTS = ['vine', 'wall', 'tower', 'circuit'] as const;

/** Every look a member can set. Only these keys, and only these values, reach a theme. */
export const ThemeTokens = z
  .object({
    backdrop: Hex,
    stem: Hex,
    branch: Hex,
    leaf: Hex,
    leafSoft: Hex,
    tendril: Hex,
    stemWidth: z.number().int().min(2).max(14),
    stemDouble: z.boolean(),
    stemGlow: z.boolean(),
    leafShape: z.enum(['round', 'pointed', 'flower', 'star', 'tablet']),
    scenery: z.enum(['', 'fairytale']),
    vineStyle: z.enum(['', 'beanstalk', 'ink', 'neon', 'gate']),
    ink: Hex,
    stone: Hex,
    mortar: Hex,
    wire: Hex,
    burst: Hex,
    screen: Hex,
    tilt: z.number().int().min(0).max(20),
  })
  .partial()
  .strict();

/**
 * A skin file (docs/CLAUDE_DESIGN_SKINS.md, docs/skin-template.json): one theme row made in
 * Claude Design or by hand. `npm run skin:add -- file.json` checks it and writes a migration.
 */
export const SkinFile = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slugs are lowercase words joined by hyphens').max(40),
    name: z.string().trim().min(2).max(40),
    layout: z.enum(['vine', 'wall', 'tower', 'circuit']),
    /** Offered only during this season, while Admin → Feed skins → Seasonal skins is on. */
    season: z.enum([...CHURCH_SEASONS, ...WEATHER_SEASONS]).optional(),
    /** Which communities offer it: Open Circle, every faith community, or all. */
    for: z.enum(['all', 'faith', 'open']).default('all'),
    description: z.string().max(300).optional(),
    animations: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).default({ enter: 'fade' }),
    tokens: ThemeTokens.extend({
        leafEvery: z.number().int().min(0).max(20),
        idleBirdSeconds: z.number().int().min(0).max(600),
        tipText: z.string().max(160),
        birdText: z.string().max(160),
        climber: z.string().max(8),
      })
      .partial()
      .strict(),
  })
  .strict();
export type SkinFile = z.infer<typeof SkinFile>;

/** SQL that adds a skin file's theme row and offers it in its communities (gated, beta). */
export function skinMigration(raw: unknown): string {
  const f = SkinFile.parse(raw);
  if (typeof f.tokens.leafSoft === 'string' && contrastRatio(f.tokens.leafSoft, COMMENT_TEXT) < 4.5) throw new Error(`${f.slug}: leafSoft is too dark for comment text (needs 4.5:1)`);
  const lit = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  const str = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const where = f.for === 'open' ? `c.slug = 'open-circle'` : f.for === 'faith' ? `c.slug <> 'open-circle'` : 'true';
  return [
    `-- Feed skin "${f.name}" (${f.layout}${f.season ? `, ${f.season}` : ''}), from a skin file. docs/CLAUDE_DESIGN_SKINS.md.`,
    ...(f.description ? [`-- ${f.description.replace(/\n/g, ' ')}`] : []),
    `insert into public.feed_themes (slug, name, layout, status, gated, season, animations, tokens) values`,
    `  (${str(f.slug)}, ${str(f.name)}, ${str(f.layout)}, 'beta', true, ${f.season ? str(f.season) : 'null'}, ${lit(f.animations)}, ${lit(f.tokens)})`,
    `on conflict (slug) do nothing;`,
    `insert into public.community_feed_themes (community_id, theme_id, is_default)`,
    `select c.id, t.id, false from public.communities c, public.feed_themes t where t.slug = ${str(f.slug)} and ${where}`,
    `on conflict do nothing;`,
    '',
  ].join('\n');
}

export const NewProposal = z.object({
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().min(1).max(500),
  layout: z.enum(MAKER_LAYOUTS),
  /** The first version's three colors; still accepted, folded into tokens. */
  colors: z.object({ stem: Hex, leaf: Hex, backdrop: Hex }).optional(),
  tokens: ThemeTokens.default({}),
});

/** The tokens a new skin starts with: the member's choices over the older three colors. */
function tokensFor(layout: (typeof MAKER_LAYOUTS)[number], colors: { stem?: string; leaf?: string; backdrop?: string } | undefined, tokens: z.infer<typeof ThemeTokens>) {
  const base: Record<string, unknown> =
    layout === 'vine' && colors ? { stem: colors.stem, branch: colors.stem, leaf: colors.leaf, backdrop: colors.backdrop } : colors ? { backdrop: colors.backdrop } : {};
  return { ...(layout === 'vine' ? { leafEvery: 4 } : {}), ...base, ...tokens };
}

interface ProposalRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  layout: (typeof MAKER_LAYOUTS)[number];
  colors: { stem?: string; leaf?: string; backdrop?: string };
  tokens: Record<string, unknown>;
  status: 'pending' | 'approved' | 'declined';
  review_note: string | null;
  theme_slug: string | null;
  created_at: Date;
  display_name?: string;
}

const present = (r: ProposalRow) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  layout: r.layout,
  colors: r.colors,
  tokens: r.tokens,
  status: r.status,
  reviewNote: r.review_note,
  themeSlug: r.theme_slug,
  createdAt: r.created_at,
  ...(r.display_name !== undefined ? { from: { id: r.user_id, name: r.display_name } } : {}),
});

const proposalSelect = `select tp.id, tp.user_id, tp.name, tp.description, tp.layout, tp.colors, tp.tokens, tp.status, tp.review_note,
                               t.slug as theme_slug, tp.created_at
                          from public.theme_proposals tp left join public.feed_themes t on t.id = tp.theme_id`;

async function requireProposals(q: Queryable) {
  if (!(await settings(q)).proposals_enabled) throw forbidden('Skin ideas are turned off for now');
}

/**
 * A member makes a skin. It's theirs to use straight away (a gated theme they
 * own); it joins their community's Feed style list only once an admin
 * approves it. Up to 3 can wait for review at once.
 */
export async function propose(q: Queryable, userId: string, raw: z.infer<typeof NewProposal>) {
  await requireProposals(q);
  const input = NewProposal.parse(raw);
  const { rows: open } = await q.query<{ n: number }>(`select count(*)::int as n from public.theme_proposals where user_id = $1 and status = 'pending'`, [
    userId,
  ]);
  if (open[0]!.n >= 3) throw badRequest('You have 3 skin ideas waiting already. Wait for those to be reviewed first.');
  const community = await primaryCommunityId(q, userId);
  const tokens = tokensFor(input.layout, input.colors, input.tokens);
  // Comments sit on leafSoft in dark text, so it must stay readable (WCAG AA 4.5:1).
  if (typeof tokens.leafSoft === 'string' && contrastRatio(tokens.leafSoft, COMMENT_TEXT) < 4.5)
    throw badRequest('That comment background is too dark to read. Pick a lighter color.');
  const { rows: theme } = await q.query<{ id: string }>(
    `insert into public.feed_themes (slug, name, layout, status, gated, owner_id, animations, tokens)
     values ($1, $2, $3::public.feed_layout, 'beta', true, $4, '{"enter": "fade"}', $5) returning id`,
    [`${slugify(input.name)}-${randomBytes(4).toString('hex')}`, input.name, input.layout, userId, JSON.stringify(tokens)],
  );
  const { rows } = await q.query<{ id: string }>(
    `insert into public.theme_proposals (user_id, community_id, name, description, layout, colors, tokens, theme_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [userId, community, input.name, input.description, input.layout, JSON.stringify(input.colors ?? {}), JSON.stringify(tokens), theme[0]!.id],
  );
  return (await mine(q, userId)).find((p) => p.id === rows[0]!.id)!;
}

export async function mine(q: Queryable, userId: string) {
  const { rows } = await q.query<ProposalRow>(`${proposalSelect} where tp.user_id = $1 order by tp.created_at desc limit 50`, [userId]);
  return rows.map(present);
}

/** Admin queue: pending first, then the latest decisions. */
export async function list(q: Queryable) {
  const { rows } = await q.query<ProposalRow>(
    `select tp.id, tp.user_id, tp.name, tp.description, tp.layout, tp.colors, tp.tokens, tp.status, tp.review_note,
            t.slug as theme_slug, tp.created_at, coalesce(nullif(p.display_name, ''), 'Member') as display_name
       from public.theme_proposals tp
       join public.profiles p on p.id = tp.user_id
       left join public.feed_themes t on t.id = tp.theme_id
      order by (tp.status = 'pending') desc, tp.created_at desc
      limit 100`,
  );
  return rows.map(present);
}

export const Review = z.object({ note: z.string().trim().max(500).optional() });

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'skin';

/**
 * Approving turns the idea into a gated beta theme in the proposer's
 * community, built from its colors. Admins can retune its tokens later.
 */
export async function approve(q: Queryable, adminId: string, id: string, review: z.infer<typeof Review>) {
  const { rows } = await q.query<ProposalRow & { community_id: string; theme_id: string | null }>(
    `select *, null as theme_slug from public.theme_proposals where id = $1 and status = 'pending' for update`,
    [id],
  );
  const p = rows[0];
  if (!p) throw notFound('Pending skin idea');
  // Ideas sent before the theme maker have no theme yet: make one from their colors.
  let themeId = p.theme_id;
  if (!themeId) {
    const { rows: theme } = await q.query<{ id: string }>(
      `insert into public.feed_themes (slug, name, layout, status, gated, owner_id, animations, tokens)
       values ($1, $2, $3::public.feed_layout, 'beta', true, $4, '{"enter": "fade"}', $5) returning id`,
      [`${slugify(p.name)}-${id.slice(-6)}`, p.name, p.layout, p.user_id, JSON.stringify(tokensFor(p.layout, p.colors, {}))],
    );
    themeId = theme[0]!.id;
  }
  await q.query('insert into public.community_feed_themes (community_id, theme_id, is_default) values ($1, $2, false) on conflict do nothing', [p.community_id, themeId]);
  await q.query(`update public.theme_proposals set status = 'approved', review_note = $3, reviewed_by = $2, reviewed_at = now(), theme_id = $4 where id = $1`, [
    id,
    adminId,
    review.note ?? null,
    themeId,
  ]);
  const { rows: slug } = await q.query<{ slug: string }>('select slug from public.feed_themes where id = $1', [themeId]);
  return { id, status: 'approved' as const, themeSlug: slug[0]!.slug };
}

export async function decline(q: Queryable, adminId: string, id: string, review: z.infer<typeof Review>) {
  const { rowCount } = await q.query(
    `update public.theme_proposals set status = 'declined', review_note = $3, reviewed_by = $2, reviewed_at = now() where id = $1 and status = 'pending'`,
    [id, adminId, review.note ?? null],
  );
  if (!rowCount) throw notFound('Pending skin idea');
  return { id, status: 'declined' as const };
}

// Skin gallery ---------------------------------------------------------------------------

export interface GallerySkin {
  slug: string;
  name: string;
  layout: string;
  season: string | null;
  tokens: Record<string, unknown>;
  /** Who made it, for members' own skins; null for the built-in ones. */
  maker: { id: string; name: string } | null;
  likes: number;
  liked: boolean;
  inUse: boolean;
}

async function requireGallery(q: Queryable) {
  const s = await settings(q);
  if (!s.skins_enabled || !s.gallery_enabled) throw forbidden('The skin gallery is not open');
}

/**
 * Every skin the member can use right now (the same rules as Me → Feed style: shared in
 * their community, or their own), most liked first.
 */
export async function gallery(q: Queryable, userId: string, now = new Date()): Promise<GallerySkin[]> {
  await requireGallery(q);
  const { rows } = await q.query<GallerySkin & { maker_id: string | null; maker_name: string | null }>(
    `select t.slug, t.name, t.layout, t.season, t.tokens, t.owner_id as maker_id,
            case when t.owner_id is null then null else coalesce(nullif(p.display_name, ''), 'Member') end as maker_name,
            (select count(*)::int from public.theme_likes l where l.theme_id = t.id) as likes,
            exists (select 1 from public.theme_likes l where l.theme_id = t.id and l.user_id = $1) as liked,
            (m.feed_theme_id = t.id) as "inUse"
       from public.community_memberships m
       join public.feed_themes t on (
            t.id in (select d.theme_id from public.community_feed_themes d where d.community_id = m.community_id)
            or t.owner_id = m.user_id)
       left join public.profiles p on p.id = t.owner_id
      where m.user_id = $1 and m.is_primary and ${themeVisible('$2')}
      order by likes desc, t.name`,
    [userId, seasonsNow(now)],
  );
  return rows.map(({ maker_id, maker_name, ...r }) => ({ ...r, inUse: !!r.inUse, maker: maker_id ? { id: maker_id, name: maker_name! } : null }));
}

/** Like or unlike a skin the member can see in the gallery. */
export async function like(q: Queryable, userId: string, slug: string, on: boolean, now = new Date()) {
  const skins = await gallery(q, userId, now);
  if (!skins.some((s) => s.slug === slug)) throw notFound('Skin');
  if (on)
    await q.query(
      `insert into public.theme_likes (theme_id, user_id) select id, $1 from public.feed_themes where slug = $2 on conflict do nothing`,
      [userId, slug],
    );
  else await q.query(`delete from public.theme_likes l using public.feed_themes t where t.id = l.theme_id and t.slug = $2 and l.user_id = $1`, [userId, slug]);
  return gallery(q, userId, now);
}

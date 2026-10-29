// Feed skins (Steve, 2026-10-29; docs/FEED_SKINS.md). Each part is off until an
// admin turns it on (skin_settings):
//   * gated skins in Me → Feed style: Beanstalk, Golden Wood, Moonlit Gate and
//     the full-screen Wall (feed_themes.gated);
//   * comments as branches and leaves: a few leaves per branch, the rest fade
//     into a blur, and replies stop at a set depth. For encouragement, not debate;
//   * the theme maker: a member builds a skin (layout, colors, leaf shape, stem,
//     backdrop) and can use it at once; others see it only after an admin
//     approves it into the community (feed_themes.owner_id);
//   * the longest video a member can attach (7 seconds by default).
import { COMMENT_TEXT, contrastRatio } from '@prayer-tower/shared';
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
}

export async function settings(q: Queryable): Promise<SkinSettings> {
  const { rows } = await q.query<SkinSettings>(
    `select skins_enabled, comment_tree_enabled, comment_tree_leaves, comment_tree_max_depth, proposals_enabled, video_max_seconds
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
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.skin_settings set
       skins_enabled = coalesce($1, skins_enabled), comment_tree_enabled = coalesce($2, comment_tree_enabled),
       comment_tree_leaves = coalesce($3, comment_tree_leaves), comment_tree_max_depth = coalesce($4, comment_tree_max_depth),
       proposals_enabled = coalesce($5, proposals_enabled), video_max_seconds = coalesce($6, video_max_seconds)`,
    [
      p.skinsEnabled ?? null,
      p.commentTreeEnabled ?? null,
      p.commentTreeLeaves ?? null,
      p.commentTreeMaxDepth ?? null,
      p.proposalsEnabled ?? null,
      p.videoMaxSeconds ?? null,
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
  };
}

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
    stone: Hex,
    mortar: Hex,
    wire: Hex,
    burst: Hex,
    screen: Hex,
    tilt: z.number().int().min(0).max(20),
  })
  .partial()
  .strict();

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

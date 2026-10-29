// Member-made emoji meanings (docs/CONVERSATION_HELPERS.md): members suggest a new
// meaning for one of the emoji, an admin rewords it if needed and approves or declines,
// and an approved meaning joins the tree. Off until conversation_settings
// .meaning_proposals_enabled, and Emoji meanings must be on too.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, notFound } from '../../errors.js';
import { assess } from '../kindness/index.js';
import { enabled } from './index.js';

/** Waiting suggestions one member may have at once. */
export const MAX_PENDING = 5;
const MAX_MEANINGS = 5;

async function requireOn(q: Queryable) {
  const { rows } = await q.query<{ on: boolean }>('select meaning_proposals_enabled as on from public.conversation_settings');
  if (!rows[0]?.on || !(await enabled(q))) throw badRequest('Suggesting meanings is switched off');
}

export const NewProposal = z.object({ emoji: z.string().min(1).max(30), label: z.string().trim().min(2).max(40) });

export async function propose(q: Queryable, userId: string, p: z.infer<typeof NewProposal>) {
  await requireOn(q);
  const { rowCount } = await q.query('select 1 from public.reaction_meanings where emoji_key = $1 and enabled', [p.emoji]);
  if (!rowCount) throw badRequest('Unknown emoji');
  // Meanings are positive by design: anything the kind cloud would flag isn't taken.
  if (assess(p.label).level !== 'ok') throw badRequest('Meanings are kind words. Please try other words.');
  const { rows: same } = await q.query(
    `select 1 from public.reaction_meanings where emoji_key = $1 and enabled and (lower(faith_label) = lower($2) or lower(neutral_label) = lower($2))
     union all select 1 from public.meaning_proposals where emoji_key = $1 and status = 'pending' and lower(label) = lower($2)`,
    [p.emoji, p.label],
  );
  if (same.length) throw conflict('That meaning is already there or waiting.');
  const { rows: n } = await q.query<{ n: number }>(`select count(*)::int as n from public.meaning_proposals where user_id = $1 and status = 'pending'`, [userId]);
  if (n[0]!.n >= MAX_PENDING) throw conflict(`You have ${MAX_PENDING} suggestions waiting. Please wait until an admin has read them.`);
  await q.query('insert into public.meaning_proposals (user_id, emoji_key, label) values ($1, $2, $3)', [userId, p.emoji, p.label]);
  return mine(q, userId);
}

export async function mine(q: Queryable, userId: string) {
  const { rows } = await q.query<{ id: string; emoji_key: string; label: string; status: string; created_at: Date }>(
    `select id, emoji_key, label, status, created_at from public.meaning_proposals where user_id = $1 order by created_at desc limit 20`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, emoji: r.emoji_key, label: r.label, status: r.status, createdAt: r.created_at }));
}

/** Admin: waiting suggestions, oldest first, with the emoji's current meanings to compare. Never who suggested it. */
export async function queue(q: Queryable) {
  const { rows } = await q.query<{ id: string; emoji_key: string; label: string; created_at: Date }>(
    `select id, emoji_key, label, created_at from public.meaning_proposals where status = 'pending' order by created_at limit 100`,
  );
  const { rows: current } = await q.query<{ emoji_key: string; emoji: string; meaning_key: string; faith_label: string }>(
    'select emoji_key, emoji, meaning_key, faith_label from public.reaction_meanings where enabled order by emoji_key, position',
  );
  return rows.map((r) => {
    const now = current.filter((c) => c.emoji_key === r.emoji_key);
    return { id: r.id, emoji: r.emoji_key, icon: now[0]?.emoji ?? '', label: r.label, createdAt: r.created_at, current: now.map((c) => ({ key: c.meaning_key, label: c.faith_label })) };
  });
}

export const Decision = z.object({
  approve: z.boolean(),
  /** The faith-wording label; defaults to the member's words. */
  label: z.string().trim().min(2).max(40).optional(),
  /** Open Circle wording; defaults to the label. */
  neutralLabel: z.string().trim().min(2).max(40).optional(),
  /** When the emoji already has five meanings: the one to retire. */
  replaces: z.string().min(1).max(40).optional(),
});

const slug = (s: string) =>
  `${s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24) || 'meaning'}_${randomBytes(3).toString('hex')}`;

export async function decide(q: Queryable, adminId: string, id: string, d: z.infer<typeof Decision>) {
  const { rows } = await q.query<{ emoji_key: string; label: string }>(`select emoji_key, label from public.meaning_proposals where id = $1 and status = 'pending' for update`, [id]);
  const p = rows[0];
  if (!p) throw notFound('Suggestion');
  if (!d.approve) {
    await q.query(`update public.meaning_proposals set status = 'declined', decided_at = now(), decided_by = $2 where id = $1`, [id, adminId]);
    return { status: 'declined' as const };
  }
  const { rows: now } = await q.query<{ meaning_key: string; position: number; emoji: string }>(
    'select meaning_key, position, emoji from public.reaction_meanings where emoji_key = $1 and enabled order by position',
    [p.emoji_key],
  );
  if (!now.length) throw badRequest('Unknown emoji');
  let position: number;
  if (d.replaces) {
    const old = now.find((m) => m.meaning_key === d.replaces);
    if (!old) throw badRequest('That meaning is not on this emoji');
    // The first meaning is what a plain tap adds; keep it unless the admin replaces it on purpose.
    await q.query('update public.reaction_meanings set enabled = false where emoji_key = $1 and meaning_key = $2', [p.emoji_key, old.meaning_key]);
    position = old.position;
  } else {
    if (now.length >= MAX_MEANINGS) throw conflict(`This emoji already has ${MAX_MEANINGS} meanings. Choose one to retire.`);
    position = [1, 2, 3, 4, 5].find((n) => !now.some((m) => m.position === n))!;
  }
  const label = d.label ?? p.label;
  const key = slug(label);
  await q.query(
    `insert into public.reaction_meanings (emoji_key, emoji, meaning_key, position, faith_label, neutral_label) values ($1, $2, $3, $4, $5, $6)`,
    [p.emoji_key, now[0]!.emoji, key, position, label, d.neutralLabel ?? label],
  );
  await q.query(`update public.meaning_proposals set status = 'approved', meaning_key = $2, decided_at = now(), decided_by = $3 where id = $1`, [id, key, adminId]);
  return { status: 'approved' as const, meaning: key };
}

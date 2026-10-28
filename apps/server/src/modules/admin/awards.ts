// Annual Prayer Warrior Award (Business Plan 6.4), off by default. An admin
// selects a year's winners from the standings; each winner accepts (token
// prizes are paid then) or declines, and decides whether the public Hall of
// Prayer Warriors shows their name. Other prizes are described in prize_note
// and handled outside the app.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { AppError, conflict, notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';
import * as tokens from '../tokens/index.js';
import { standingsBetween } from './warriors.js';
import { featureOn, requireFeature } from '../communities/index.js';

export interface AwardSettings {
  enabled: boolean;
  winners: number;
  token_prize: number;
  priestly_prize: number;
  prize_note: string;
  public_hall: boolean;
}

const COLS = 'enabled, winners, token_prize, priestly_prize, prize_note, public_hall';

export async function settings(q: Queryable): Promise<AwardSettings> {
  return (await q.query<AwardSettings>(`select ${COLS} from public.award_settings`)).rows[0]!;
}

export const SettingsPatch = z.object({
  enabled: z.boolean().optional(),
  winners: z.number().int().min(1).max(50).optional(),
  tokenPrize: z.number().int().min(0).max(100_000).optional(),
  priestlyPrize: z.number().int().min(0).max(100_000).optional(),
  prizeNote: z.string().trim().max(500).optional(),
  publicHall: z.boolean().optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>): Promise<AwardSettings> {
  const { rows } = await q.query<AwardSettings>(
    `update public.award_settings set enabled = coalesce($1, enabled), winners = coalesce($2, winners), token_prize = coalesce($3, token_prize),
            priestly_prize = coalesce($4, priestly_prize), prize_note = coalesce($5, prize_note), public_hall = coalesce($6, public_hall)
      returning ${COLS}`,
    [p.enabled ?? null, p.winners ?? null, p.tokenPrize ?? null, p.priestlyPrize ?? null, p.prizeNote ?? null, p.publicHall ?? null],
  );
  return rows[0]!;
}

async function requireOn(q: Queryable) {
  const s = await settings(q);
  if (!s.enabled) throw new AppError(404, 'feature_off', 'The Prayer Warrior Award is not turned on');
  return s;
}

interface AwardRow {
  id: string;
  year: number;
  rank: number;
  user_id: string;
  name: string;
  prayers: number;
  checkins: number;
  people: number;
  status: 'offered' | 'accepted' | 'declined';
  show_name: boolean;
  prize_choice: PrizeChoice;
  decided_at: Date | null;
}
const shape = (r: AwardRow) => ({
  id: r.id, year: r.year, rank: r.rank, userId: r.user_id, name: r.name, prayers: r.prayers, checkins: r.checkins,
  peoplePrayedFor: r.people, status: r.status, showName: r.show_name, prizeChoice: r.prize_choice, decidedAt: r.decided_at,
});
const SELECT = `select a.*, coalesce(nullif(p.display_name, ''), 'Member') as name
                  from public.prayer_warrior_awards a join public.profiles p on p.id = a.user_id`;

/** The calendar year's standings (UTC), for the admin to review before selecting. */
export function yearStandings(q: Queryable, year: number, limit = 50) {
  return standingsBetween(q, new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year + 1, 0, 1)), limit);
}

export async function forYear(q: Queryable, year: number) {
  const { rows } = await q.query<AwardRow>(`${SELECT} where a.year = $1 order by a.rank`, [year]);
  return rows.map(shape);
}

/**
 * Offer the award to the year's top pray-ers who haven't been offered it yet,
 * up to the configured number of winners (declines free a place for the next).
 */
export async function select(q: Queryable, year: number) {
  const s = await requireOn(q);
  const { rows: had } = await q.query<{ user_id: string; status: string; rank: number }>(
    'select user_id, status, rank from public.prayer_warrior_awards where year = $1',
    [year],
  );
  const open = s.winners - had.filter((h) => h.status !== 'declined').length;
  if (open <= 0) throw conflict(`All ${s.winners} awards for ${year} have been offered`);
  const taken = new Set(had.map((h) => h.user_id));
  let rank = had.reduce((m, h) => Math.max(m, h.rank), 0);
  const picks = (await yearStandings(q, year, 200)).filter((x) => !taken.has(x.userId)).slice(0, open);
  for (const w of picks) {
    rank += 1;
    const { rows } = await q.query<{ id: string }>(
      `insert into public.prayer_warrior_awards (year, rank, user_id, prayers, checkins, people) values ($1, $2, $3, $4, $5, $6) returning id`,
      [year, rank, w.userId, w.prayers, w.checkins, w.peoplePrayedFor],
    );
    await notifications.notify(q, w.userId, {
      kind: 'award',
      title: `You are a ${year} Prayer Warrior`,
      body: `You prayed for others ${w.prayers + w.checkins} times this year. Open Me to accept the award.`,
      t: { key: 'award', params: { year, count: w.prayers + w.checkins } },
      data: { awardId: rows[0]!.id },
      dedupeKey: `award:${year}:${w.userId}`,
    });
  }
  return forYear(q, year);
}

/** The member's own offers and awards, with the prizes on offer. */
export async function mine(q: Queryable, userId: string) {
  const s = await settings(q);
  if (!s.enabled || !(await featureOn(q, userId, 'awards'))) return { enabled: false as const, awards: [] };
  const { rows } = await q.query<AwardRow>(`${SELECT} where a.user_id = $1 order by a.year desc`, [userId]);
  return {
    enabled: true as const,
    prize: { tokens: s.token_prize, priestly: s.priestly_prize, note: s.prize_note },
    publicHall: s.public_hall,
    awards: rows.map(shape),
  };
}

export const PRIZE_CHOICES = ['keep', 'donate', 'split'] as const;
export type PrizeChoice = (typeof PRIZE_CHOICES)[number];
/** `prize` counts only while the "Award winners choose" switch is on; otherwise the winner keeps it. */
export const Accept = z.object({ showName: z.boolean().default(false), prize: z.enum(PRIZE_CHOICES).default('keep') });

/** The share given away: all of it, half (rounded down) for a split, or none. */
export const donatedShare = (amount: number, choice: PrizeChoice) => (choice === 'donate' ? amount : choice === 'split' ? Math.floor(amount / 2) : 0);

/** Accept: pay the token prizes once, and record whether the Hall may show the name. */
export async function accept(q: Queryable, userId: string, id: string, input: z.infer<typeof Accept>) {
  await requireFeature(q, userId, 'awards');
  const s = await requireOn(q);
  const { rows } = await q.query<AwardRow>(`${SELECT} where a.id = $1 and a.user_id = $2 for update of a`, [id, userId]);
  const a = rows[0];
  if (!a) throw notFound('Award');
  if (a.status === 'declined') throw conflict('You declined this award');
  const { rows: sw } = await q.query<{ on: boolean }>('select prize_choice_enabled as on from public.notebook_settings');
  // The choice is made once, on accepting; afterwards only the name setting can change.
  const choice: PrizeChoice = a.status === 'offered' ? (sw[0]?.on ? input.prize : 'keep') : a.prize_choice;
  const give = { tokens: donatedShare(s.token_prize, choice), priestly: donatedShare(s.priestly_prize, choice) };
  if (a.status === 'offered') {
    // The winner is paid the whole prize, then gives the donated share to the infrastructure fund, so the ledger shows both.
    const t = s.token_prize > 0 ? await tokens.awardBonus(q, userId, `award-${a.year}`, s.token_prize) : null;
    const p = s.priestly_prize > 0 ? await tokens.awardBonus(q, userId, `award-${a.year}-priestly`, s.priestly_prize, 'priestly') : null;
    if (give.tokens > 0) await tokens.donate(q, userId, give.tokens, `award-${a.year}`, 'regular');
    if (give.priestly > 0) await tokens.donate(q, userId, give.priestly, `award-${a.year}-priestly`, 'priestly');
    await q.query(
      `update public.prayer_warrior_awards set status = 'accepted', decided_at = now(), token_transfer_id = $2, priestly_transfer_id = $3, prize_choice = $4 where id = $1`,
      [id, t?.id ?? null, p?.id ?? null, choice],
    );
  }
  await q.query('update public.prayer_warrior_awards set show_name = $2 where id = $1', [id, input.showName]);
  const paid = a.status === 'offered';
  return {
    accepted: true,
    prizeChoice: choice,
    tokens: paid ? s.token_prize - give.tokens : 0,
    priestly: paid ? s.priestly_prize - give.priestly : 0,
    donated: paid ? give : { tokens: 0, priestly: 0 },
  };
}

export async function decline(q: Queryable, userId: string, id: string) {
  const { rowCount } = await q.query(
    `update public.prayer_warrior_awards set status = 'declined', decided_at = now() where id = $1 and user_id = $2 and status = 'offered'`,
    [id, userId],
  );
  if (!rowCount) throw notFound('Award');
  return { declined: true };
}

/** The public Hall: accepted awards, by year; a name only when its winner said yes. */
export async function hall(q: Queryable) {
  const s = await settings(q);
  if (!s.enabled || !s.public_hall) return { enabled: false as const, years: [] };
  const { rows } = await q.query<AwardRow>(`${SELECT} where a.status = 'accepted' and p.deleted_at is null order by a.year desc, a.rank`);
  const years = new Map<number, { rank: number; name: string | null; prayers: number; peoplePrayedFor: number }[]>();
  for (const r of rows) {
    const list = years.get(r.year) ?? [];
    list.push({ rank: list.length + 1, name: r.show_name ? r.name : null, prayers: r.prayers + r.checkins, peoplePrayedFor: r.people });
    years.set(r.year, list);
  }
  return { enabled: true as const, years: [...years].map(([year, winners]) => ({ year, winners })) };
}

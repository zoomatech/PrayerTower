// Practice mode for the paid services (migration 20261029091400_practice_mode.sql,
// docs/PRACTICE_MODE.md). Three switches in Admin → Practice mode, all off. Each
// lets a feature be tried before its paid key is set, and says plainly that it
// is practice. A real key always wins over its switch.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import type { Converse } from '../ai/provider.js';

export interface PracticeSettings {
  ai: boolean;
  live: boolean;
  purchases: boolean;
}

export async function settings(q: Queryable): Promise<PracticeSettings> {
  const { rows } = await q.query<PracticeSettings>('select ai, live, purchases from public.paid_practice_settings');
  return rows[0] ?? { ai: false, live: false, purchases: false };
}

export const SettingsPatch = z.object({ ai: z.boolean().optional(), live: z.boolean().optional(), purchases: z.boolean().optional() });

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query('update public.paid_practice_settings set ai = coalesce($1, ai), live = coalesce($2, live), purchases = coalesce($3, purchases)', [
    p.ai ?? null,
    p.live ?? null,
    p.purchases ?? null,
  ]);
  return settings(q);
}

// ----- AI -----

export const PRACTICE_REPLY_PREFIX = 'Practice reply:';

/** A fixed reply that says it is practice, used while no AI key is set. */
export const practiceConverse: Converse = async () => ({
  text: `${PRACTICE_REPLY_PREFIX} no AI service is connected yet, so this is a fixed answer, not a real one.`,
});

/** The real AI when its key is set; otherwise the practice reply while its switch is on; otherwise none. */
export async function converser(q: Queryable, real: Converse | null): Promise<Converse | null> {
  if (real) return real;
  return (await settings(q)).ai ? practiceConverse : null;
}

// ----- Live video -----

const PRACTICE_ROOM = 'practice:';

export const isPracticeRoom = (url: string) => url.startsWith(PRACTICE_ROOM);
export const practiceRoom = (name: string) => `${PRACTICE_ROOM}${name}`;
/** Where a practice room opens: a page on this server (no video). */
export const practiceRoomUrl = (url: string, base: string) => `${base}/live/practice/${encodeURIComponent(url.slice(PRACTICE_ROOM.length))}`;

export function practiceRoomPage(name: string) {
  const safe = name.replace(/[^A-Za-z0-9_-]/g, '');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Practice room</title><style>body{font:17px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:32px 20px;background:#f6f4ef;color:#222}
@media (prefers-color-scheme:dark){body{background:#1b1a17;color:#eee}}main{max-width:32rem;margin:auto}code{font-size:14px}</style></head>
<body><main><h1>Practice room</h1><p>No video service is connected yet, so this room has no video. Once one is set up, live rooms open real video here.</p>
<p>Room: <code>${safe}</code></p></main></body></html>`;
}

// ----- Token purchases -----

/**
 * A practice purchase, made by the app in place of StoreKit while practice purchases are on:
 * `practice.<base64url JSON {productId, appAccountToken, transactionId}>`. It carries no money.
 */
export const PracticeTransaction = z.object({ productId: z.string().min(1).max(200), appAccountToken: z.uuid(), transactionId: z.uuid() });

export function readPracticeTransaction(signed: string) {
  if (!signed.startsWith('practice.')) return null;
  try {
    return PracticeTransaction.parse(JSON.parse(Buffer.from(signed.slice('practice.'.length), 'base64url').toString('utf8')));
  } catch {
    return null;
  }
}

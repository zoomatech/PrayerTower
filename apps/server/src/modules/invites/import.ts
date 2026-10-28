// CSV import for a pilot church (Admin → Invite codes → Import): members become
// single-use invite codes (optionally emailed), and starter prayer requests are
// posted by the importing admin. Every import can be previewed first (dryRun).
// docs/CSV_IMPORT.md.
import { z } from 'zod';
import { withTx, type Db, type Queryable } from '../../db.js';
import type { Mailer } from '../digest/mailer.js';
import * as posts from '../posts/index.js';
import { renderInviteEmail, type InviteLinks } from './email.js';
import * as invites from './index.js';

export const MAX_ROWS = 500;

/** RFC 4180 CSV: quoted fields, "" inside quotes, commas, CRLF or LF. Also accepts semicolons (Excel in Spanish). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = !firstLine.includes(',') && firstLine.includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const blank = (r: string[]) => r.every((f) => f.trim() === '');

// English and Spanish column names.
const HEADERS: Record<string, string> = {
  email: 'email', 'e-mail': 'email', correo: 'email', 'correo electrónico': 'email', 'correo electronico': 'email',
  name: 'name', nombre: 'name',
  language: 'language', idioma: 'language', lang: 'language',
  request: 'request', body: 'request', prayer: 'request', 'prayer request': 'request', petición: 'request', peticion: 'request', oración: 'request', oracion: 'request',
  anonymous: 'anonymous', anónimo: 'anonymous', anonimo: 'anonymous',
};
const YES = new Set(['yes', 'y', 'true', '1', 'sí', 'si', 'x']);

interface CsvRow {
  line: number;
  cells: Record<string, string>;
}

/** The rows under the header, keyed by column, each with its row number in the file (the header is row 1). Blank rows are left out. */
function table(text: string, required: string): { rows: CsvRow[]; error?: string } {
  const all = parseCsv(text);
  const first = all.findIndex((r) => !blank(r));
  if (first < 0) return { rows: [], error: 'The file is empty.' };
  const header = all[first]!.map((h) => HEADERS[h.trim().toLowerCase()] ?? null);
  if (!header.includes(required)) return { rows: [], error: `The first row needs a column named "${required}".` };
  const body = all.map((r, i) => ({ r, line: i + 1 })).slice(first + 1).filter(({ r }) => !blank(r));
  if (body.length > MAX_ROWS) return { rows: [], error: `At most ${MAX_ROWS} rows at a time.` };
  return { rows: body.map(({ r, line }) => ({ line, cells: Object.fromEntries(header.flatMap((h, i) => (h ? [[h, (r[i] ?? '').trim()]] : []))) })) };
}

export const ImportInput = z.object({
  kind: z.enum(['members', 'requests']),
  csv: z.string().min(1).max(1_000_000),
  /** Preview only: check every row, change nothing. */
  dryRun: z.boolean().default(true),
  /** Members: also email each person their code. */
  sendEmails: z.boolean().default(false),
  /** Members: days until the codes expire (null = never). */
  expiresInDays: z.number().int().min(1).max(365).nullable().default(60),
  /** Members: what the codes are for, shown in Admin → Invite codes. */
  note: z.string().trim().max(120).default(''),
  /** Members: a personal line in the email. */
  message: z.string().trim().max(500).optional(),
});

export type RowStatus = 'ok' | 'invited' | 'emailed' | 'posted' | 'skipped' | 'error';
export interface ImportRow {
  line: number;
  status: RowStatus;
  /** Why it was skipped or failed, in English. */
  reason?: string;
  email?: string;
  name?: string;
  code?: string;
  request?: string;
  postId?: string;
}
export interface ImportResult {
  kind: 'members' | 'requests';
  dryRun: boolean;
  error?: string;
  rows: ImportRow[];
  counts: Record<RowStatus, number>;
}

const EMAIL = z.email().max(320);
const counts = (rows: ImportRow[]) =>
  rows.reduce((c, r) => ({ ...c, [r.status]: c[r.status] + 1 }), { ok: 0, invited: 0, emailed: 0, posted: 0, skipped: 0, error: 0 } as Record<RowStatus, number>);

export async function importCsv(
  q: Db,
  adminId: string,
  input: z.infer<typeof ImportInput>,
  deps: { mailer: Mailer | null; links: InviteLinks; from: string; adminLocale: 'en' | 'es' },
): Promise<ImportResult> {
  const { rows, error } = table(input.csv, input.kind === 'members' ? 'email' : 'request');
  if (error) return { kind: input.kind, dryRun: input.dryRun, error, rows: [], counts: counts([]) };
  const out = input.kind === 'members' ? await members(q, adminId, rows, input, deps) : await requests(q, adminId, rows, input);
  return { kind: input.kind, dryRun: input.dryRun, rows: out, counts: counts(out) };
}

async function members(
  q: Queryable,
  adminId: string,
  rows: CsvRow[],
  input: z.infer<typeof ImportInput>,
  deps: { mailer: Mailer | null; links: InviteLinks; from: string; adminLocale: 'en' | 'es' },
): Promise<ImportRow[]> {
  const emails = rows.map((r) => (r.cells.email ?? '').toLowerCase());
  const { rows: existing } = await q.query<{ email: string }>(`select lower(email) as email from auth.users where lower(email) = any($1::text[])`, [emails]);
  const members = new Set(existing.map((e) => e.email));
  const seen = new Set<string>();
  const out: ImportRow[] = [];
  for (const r of rows) {
    const { line } = r;
    const email = (r.cells.email ?? '').toLowerCase();
    const name = (r.cells.name ?? '').slice(0, 80);
    if (!EMAIL.safeParse(email).success) {
      out.push({ line, status: 'error', reason: 'Not a valid email address', email: r.cells.email, name });
      continue;
    }
    if (seen.has(email)) {
      out.push({ line, status: 'skipped', reason: 'Listed twice', email, name });
      continue;
    }
    seen.add(email);
    if (members.has(email)) {
      out.push({ line, status: 'skipped', reason: 'Already a member', email, name });
      continue;
    }
    const raw = (r.cells.language ?? '').toLowerCase();
    const lang: 'en' | 'es' = raw.startsWith('es') || raw === 'spanish' || raw === 'español' ? 'es' : raw ? 'en' : deps.adminLocale;
    if (input.dryRun) {
      out.push({ line, status: 'ok', email, name });
      continue;
    }
    const note = [input.note, name || email].filter(Boolean).join(': ').slice(0, 200);
    const [invite] = await invites.create(q, adminId, { note, maxUses: 1, expiresInDays: input.expiresInDays, count: 1 });
    const row: ImportRow = { line, status: 'invited', email, name, code: invite!.code };
    if (input.sendEmails && deps.mailer) {
      try {
        await deps.mailer(renderInviteEmail({ to: email, code: invite!.code, lang, from: deps.from, message: input.message, links: deps.links }));
        row.status = 'emailed';
      } catch (e) {
        row.reason = `Code made, but the email failed: ${(e as Error).message.slice(0, 120)}`;
      }
    }
    out.push(row);
  }
  return out;
}

async function requests(db: Db, adminId: string, rows: CsvRow[], input: z.infer<typeof ImportInput>): Promise<ImportRow[]> {
  const out: ImportRow[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const { line } = r;
    const request = r.cells.request ?? '';
    const parsed = posts.NewPost.safeParse({ postType: 'prayer_request', body: request, isAnonymous: YES.has((r.cells.anonymous ?? '').toLowerCase()) });
    if (!parsed.success) {
      out.push({ line, status: 'error', reason: parsed.error.issues[0]?.message ?? 'Not a valid request', request: request.slice(0, 120) });
      continue;
    }
    const key = request.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) {
      out.push({ line, status: 'skipped', reason: 'Listed twice', request: request.slice(0, 120) });
      continue;
    }
    seen.add(key);
    if (input.dryRun) {
      out.push({ line, status: 'ok', request: request.slice(0, 120) });
      continue;
    }
    try {
      // One transaction per request, so one bad row doesn't undo the rest.
      const post = await withTx(db, (tx) => posts.create(tx, adminId, parsed.data));
      out.push({ line, status: 'posted', request: request.slice(0, 120), postId: post.id });
    } catch (e) {
      out.push({ line, status: 'error', reason: (e as Error).message.slice(0, 160), request: request.slice(0, 120) });
    }
  }
  return out;
}

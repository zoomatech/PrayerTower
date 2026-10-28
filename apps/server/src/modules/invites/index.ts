// Invite codes for the invite-only pilot. Supabase Auth checks and uses a code
// at sign-up (hook_before_user_created in the invite_codes migration); this
// module is the admin side: the on/off switch, and making and revoking codes.
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';

// No 0/O, 1/I/L: codes are read aloud and typed from paper.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = (length = 8) => Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export async function inviteOnly(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ invite_only: boolean }>('select invite_only from public.invite_settings');
  return rows[0]?.invite_only ?? true;
}

export async function setInviteOnly(q: Queryable, on: boolean): Promise<boolean> {
  const { rows } = await q.query<{ invite_only: boolean }>('update public.invite_settings set invite_only = $1 returning invite_only', [on]);
  return rows[0]!.invite_only;
}

export const NewInvites = z.object({
  note: z.string().trim().max(200).default(''),
  maxUses: z.number().int().min(1).max(1000).default(1),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(30),
  count: z.number().int().min(1).max(50).default(1),
});

export interface Invite {
  code: string;
  note: string;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  status: 'active' | 'used' | 'expired' | 'revoked';
}

const SELECT = `select c.code, c.note, c.max_uses, c.uses, c.expires_at, c.revoked_at, c.created_at, p.display_name as created_by
                  from public.invite_codes c left join public.profiles p on p.id = c.created_by`;

interface InviteRow {
  code: string;
  note: string;
  max_uses: number;
  uses: number;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  created_by: string | null;
}

function toInvite(r: InviteRow, now = new Date()): Invite {
  const status = r.revoked_at ? 'revoked' : r.uses >= r.max_uses ? 'used' : r.expires_at && new Date(r.expires_at) <= now ? 'expired' : 'active';
  return {
    code: r.code,
    note: r.note,
    maxUses: r.max_uses,
    uses: r.uses,
    expiresAt: r.expires_at?.toISOString() ?? null,
    revokedAt: r.revoked_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by ?? null,
    status,
  };
}

export async function create(q: Queryable, staffId: string, input: z.infer<typeof NewInvites>): Promise<Invite[]> {
  const out: Invite[] = [];
  for (let i = 0; i < input.count; i++) {
    // 31^8 codes: a clash is very unlikely, and the loop simply draws again.
    for (;;) {
      const { rows } = await q.query(
        `insert into public.invite_codes (code, created_by, note, max_uses, expires_at)
         values ($1, $2, $3, $4, case when $5::int is null then null else now() + make_interval(days => $5::int) end)
         on conflict (code) do nothing returning code`,
        [newCode(), staffId, input.note, input.maxUses, input.expiresInDays],
      );
      if (rows[0]) {
        out.push(...(await list(q, { code: rows[0].code })));
        break;
      }
    }
  }
  return out;
}

export async function list(q: Queryable, { code, limit = 100 }: { code?: string; limit?: number } = {}): Promise<Invite[]> {
  const { rows } = code
    ? await q.query<InviteRow>(`${SELECT} where c.code = $1`, [code])
    : await q.query<InviteRow>(`${SELECT} order by c.created_at desc limit $1`, [limit]);
  return rows.map((r) => toInvite(r));
}

export async function revoke(q: Queryable, code: string): Promise<Invite> {
  const { rowCount } = await q.query('update public.invite_codes set revoked_at = coalesce(revoked_at, now()) where code = $1', [code.toUpperCase()]);
  if (!rowCount) throw notFound('Invite code');
  return (await list(q, { code: code.toUpperCase() }))[0]!;
}

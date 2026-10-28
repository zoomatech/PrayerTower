// "Download my data": everything a member wrote or that belongs to their
// account, as one JSON document. Staff-only records (reports others made,
// fraud flags, witness notes) and other people's identities in staff fields
// are left out. Photo and video files stay in Storage; their paths are listed.
import type { Queryable } from '../../db.js';

type Section = { table: string; where: string; omit?: string[] };

const SECTIONS: Record<string, Section> = {
  roles: { table: 'user_roles', where: 'user_id = $1', omit: ['granted_by'] },
  posts: { table: 'posts', where: 'user_id = $1' },
  media: { table: 'post_media', where: 'user_id = $1' },
  comments: { table: 'comments', where: 'user_id = $1' },
  reactions: { table: 'reactions', where: 'user_id = $1' },
  hiddenPosts: { table: 'hidden_posts', where: 'user_id = $1' },
  commitments: { table: 'commitments', where: 'user_id = $1' },
  prayers: { table: 'prayer_events', where: 'user_id = $1' },
  prompts: { table: 'prayer_prompts', where: 'user_id = $1' },
  thanksSent: { table: 'thanks', where: 'user_id = $1' },
  thanksReceived: { table: 'thanks', where: 'recipient_id = $1', omit: ['user_id'] },
  messages: { table: 'messages', where: 'user_id = $1' },
  conversations: { table: 'conversation_members', where: 'user_id = $1', omit: ['invited_by'] },
  communities: { table: 'community_memberships', where: 'user_id = $1' },
  eventsCreated: { table: 'events', where: 'created_by = $1' },
  rsvps: { table: 'event_rsvps', where: 'user_id = $1' },
  careRequests: { table: 'care_requests', where: 'user_id = $1', omit: ['claimed_by'] },
  churchApplications: { table: 'churches', where: 'applicant_id = $1', omit: ['reviewed_by'] },
  feedback: { table: 'feedback', where: 'user_id = $1', omit: ['closed_by'] },
  following: { table: 'follows', where: 'user_id = $1' },
  blocked: { table: 'user_blocks', where: 'user_id = $1' },
  notifications: { table: 'notifications', where: 'user_id = $1', omit: ['dedupe_key'] },
  milestones: { table: 'milestone_awards', where: 'user_id = $1' },
  tokenAccounts: { table: 'token_accounts', where: 'user_id = $1' },
  tokenTransfers: {
    table: 'token_transfers',
    where: 'debit_account_id in (select id from public.token_accounts where user_id = $1) or credit_account_id in (select id from public.token_accounts where user_id = $1)',
    omit: ['actor_id', 'idempotency_key'],
  },
  scheduledGifts: { table: 'scheduled_spends', where: 'user_id = $1' },
  pools: { table: 'token_pools', where: 'owner_id = $1', omit: ['closed_by'] },
  poolDraws: { table: 'token_pool_draws', where: 'user_id = $1' },
  radioPrayers: { table: 'radio_prayers', where: 'user_id = $1' },
  powerPrayers: { table: 'power_prayers', where: 'user_id = $1' },
  priestlyProgress: { table: 'priestly_progress', where: 'user_id = $1' },
  macroNeedHelp: { table: 'macro_need_helpers', where: 'user_id = $1' },
  moderationActions: { table: 'moderation_actions', where: 'user_id = $1', omit: ['moderator_id'] },
  appeals: { table: 'moderation_appeals', where: 'user_id = $1', omit: ['decided_by'] },
  devices: { table: 'push_tokens', where: 'user_id = $1', omit: ['token'] },
};

export async function exportData(q: Queryable, userId: string) {
  const { rows: profile } = await q.query('select * from public.profiles where id = $1', [userId]);
  const { rows: auth } = await q.query<{ email: string | null; created_at: string }>(
    'select email, created_at from auth.users where id = $1',
    [userId],
  );
  const data: Record<string, unknown[]> = {};
  for (const [key, s] of Object.entries(SECTIONS)) {
    const omit = s.omit ?? [];
    const { rows } = await q.query<{ row: unknown }>(
      `select to_jsonb(t) - $2::text[] as row from public.${s.table} t where ${s.where} order by 1`,
      [userId, omit],
    );
    data[key] = rows.map((r) => r.row);
  }
  return {
    exportedAt: new Date().toISOString(),
    format: 'prayer-tower-export/1',
    account: { email: auth[0]?.email ?? null, createdAt: auth[0]?.created_at ?? null },
    profile: profile[0] ?? null,
    ...data,
  };
}

// "Download my data": everything a member wrote or that belongs to their
// account, as one JSON document. Staff-only records (reports others made,
// fraud flags, witness notes) and other people's identities in staff fields
// are left out. Photo and video files stay in Storage; their paths are listed.
import type { Queryable } from '../../db.js';
import { isSecular } from '../communities/index.js';

type Section = { table: string; where: string; omit?: string[] };

const SECTIONS: Record<string, Section> = {
  roles: { table: 'user_roles', where: 'user_id = $1', omit: ['granted_by'] },
  posts: { table: 'posts', where: 'user_id = $1' },
  media: { table: 'post_media', where: 'user_id = $1' },
  comments: { table: 'comments', where: 'user_id = $1' },
  reactions: { table: 'reactions', where: 'user_id = $1' },
  quickReactions: { table: 'quick_reactions', where: 'user_id = $1' },
  meaningReactions: { table: 'meaning_reactions', where: 'user_id = $1' },
  followups: { table: 'request_followups', where: 'user_id = $1' },
  checkBacks: { table: 'check_backs', where: 'user_id = $1' },
  kindMilestonesSeen: { table: 'kind_milestones_seen', where: 'user_id = $1' },
  commentThanks: { table: 'comment_thanks', where: 'from_id = $1' },
  quietCounts: { table: 'quiet_count_prefs', where: 'user_id = $1' },
  thankNotes: { table: 'thank_notes', where: 'user_id = $1' },
  thankNoteGlad: { table: 'thank_note_glad', where: 'user_id = $1' },
  heatedComments: { table: 'heated_comments', where: 'user_id = $1' },
  gratitudeDay: { table: 'gratitude_prefs', where: 'user_id = $1' },
  gratitude: { table: 'gratitude_entries', where: 'user_id = $1' },
  liftUp: { table: 'lift_up_entries', where: 'user_id = $1' },
  partnerCheckins: { table: 'partner_checkins', where: 'from_id = $1' },
  coolDowns: { table: 'cool_downs', where: 'a_id = $1 or b_id = $1' },
  heatedReplies: { table: 'heated_replies', where: 'from_id = $1' },
  meaningProposals: { table: 'meaning_proposals', where: 'user_id = $1', omit: ['decided_by'] },
  kindnessHighlights: { table: 'kindness_nominations', where: 'author_id = $1' },
  encourager: { table: 'encourager_volunteers', where: 'user_id = $1' },
  encouragerMatches: { table: 'encourager_matches', where: 'newcomer_id = $1 or encourager_id = $1' },
  encouragerCheckins: { table: 'encourager_checkins', where: 'user_id = $1' },
  prayerCircles: { table: 'prayer_circles', where: 'owner_id = $1' },
  prayerCircleMembership: { table: 'prayer_circle_members', where: 'user_id = $1' },
  circlePosts: { table: 'circle_posts', where: 'user_id = $1' },
  circleReplies: { table: 'circle_replies', where: 'user_id = $1' },
  circlePrayed: { table: 'circle_prayed', where: 'user_id = $1' },
  circleWelcomeSeen: { table: 'circle_welcome_seen', where: 'user_id = $1' },
  rememberedHidden: { table: 'remembered_hidden', where: 'user_id = $1' },
  freshStartDays: { table: 'fresh_start_days', where: 'user_id = $1' },
  kindAsksSent: { table: 'kind_asks', where: 'sender_id = $1' },
  mendsWritten: { table: 'mends', where: 'author_id = $1', omit: ['hurt_id'] },
  mendsInvited: { table: 'mends', where: 'hurt_id = $1' },
  conversationPrefs: { table: 'conversation_prefs', where: 'user_id = $1' },
  meaningWords: { table: 'meaning_prefs', where: 'user_id = $1' },
  hiddenPosts: { table: 'hidden_posts', where: 'user_id = $1' },
  commitments: { table: 'commitments', where: 'user_id = $1' },
  prayerList: { table: 'prayer_list_items', where: 'user_id = $1' },
  // Cross-posting: never the stored Meta token or the extension key's hash.
  crosspostSettings: { table: 'crosspost_settings', where: 'user_id = $1', omit: ['extension_key_hash'] },
  crosspostAccounts: { table: 'crosspost_accounts', where: 'user_id = $1', omit: ['access_token'] },
  crosspostImports: { table: 'crosspost_imports', where: 'user_id = $1' },
  readings: { table: 'reading_plan_reads', where: 'user_id = $1' },
  libraryPlans: { table: 'library_plan_follows', where: 'user_id = $1' },
  libraryPlanReads: { table: 'library_plan_reads', where: 'user_id = $1' },
  prayers: { table: 'prayer_events', where: 'user_id = $1' },
  prompts: { table: 'prayer_prompts', where: 'user_id = $1' },
  thanksSent: { table: 'thanks', where: 'user_id = $1' },
  thanksReceived: { table: 'thanks', where: 'recipient_id = $1', omit: ['user_id'] },
  messages: { table: 'messages', where: 'user_id = $1' },
  prayerWarriorAwards: { table: 'prayer_warrior_awards', where: 'user_id = $1' },
  spokenPrayersSent: { table: 'spoken_prayers', where: 'user_id = $1' },
  spokenPrayersReceived: { table: 'spoken_prayers', where: 'recipient_id = $1', omit: ['user_id'] },
  conversations: { table: 'conversation_members', where: 'user_id = $1', omit: ['invited_by'] },
  communities: { table: 'community_memberships', where: 'user_id = $1' },
  eventsCreated: { table: 'events', where: 'created_by = $1' },
  rsvps: { table: 'event_rsvps', where: 'user_id = $1' },
  eventNotes: { table: 'event_inputs', where: 'user_id = $1' },
  witnessStoriesAboutYou: { table: 'witness_stories', where: 'recipient_id = $1', omit: ['author_id'] },
  careRequests: { table: 'care_requests', where: 'user_id = $1', omit: ['claimed_by'] },
  circleRequests: { table: 'circle_requests', where: 'user_id = $1', omit: ['closed_by'] },
  churchApplications: { table: 'churches', where: 'applicant_id = $1', omit: ['reviewed_by'] },
  feedback: { table: 'feedback', where: 'user_id = $1', omit: ['closed_by'] },
  skinIdeas: { table: 'theme_proposals', where: 'user_id = $1', omit: ['reviewed_by'] },
  skinLikes: { table: 'theme_likes', where: 'user_id = $1' },
  following: { table: 'follows', where: 'user_id = $1' },
  blocked: { table: 'user_blocks', where: 'user_id = $1' },
  muted: { table: 'user_mutes', where: 'user_id = $1' },
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
  adFines: { table: 'ad_fines', where: 'user_id = $1', omit: ['decided_by'] },
  devices: { table: 'push_tokens', where: 'user_id = $1', omit: ['token'] },
  lockScreenFollows: { table: 'live_activities', where: 'user_id = $1', omit: ['push_token'] },
  outsideShares: { table: 'share_consents', where: 'post_id in (select id from public.posts where user_id = $1)', omit: ['token'] },
  guestLinks: { table: 'guest_links', where: 'created_by = $1', omit: ['token'] },
  prayerChain: { table: 'prayer_chain_members', where: 'owner_id = $1', omit: ['token'] },
  prayerChainSends: { table: 'prayer_chain_sends', where: 'owner_id = $1' },
  prayerMinutes: { table: 'prayer_minutes', where: 'user_id = $1' },
  prayerMinutePresence: { table: 'prayer_minute_presence', where: 'user_id = $1' },
  lampsGiven: { table: 'lamp_awards', where: 'giver_id = $1' },
  lampsReceived: { table: 'lamp_awards', where: 'recipient_id = $1', omit: ['giver_id'] },
  circleGoals: { table: 'circle_goals', where: 'set_by = $1' },
  conversationsStarted: { table: 'conversations', where: 'created_by = $1' },
  liveRooms: { table: 'live_rooms', where: 'host_id = $1' },
  liveAmplifier: { table: 'live_amplifier_operators', where: 'user_id = $1', omit: ['verified_by'] },
  skinsMade: { table: 'feed_themes', where: 'owner_id = $1' },
  inviteUsed: { table: 'invite_redemptions', where: 'user_id = $1' },
  donations: { table: 'donations', where: 'donor_id = $1', omit: ['recorded_by'] },
  tokenPurchases: { table: 'token_purchases', where: 'user_id = $1' },
  materialHelp: { table: 'material_help_matches', where: 'user_id = $1', omit: ['fulfilled_by'] },
  powerPrayerFor: { table: 'power_prayer_recipients', where: 'user_id = $1' },
  radioRequests: { table: 'radio_allocation_requests', where: 'user_id = $1', omit: ['decided_by'] },
  radioAllowance: { table: 'radio_allowances', where: 'user_id = $1' },
  spokenPrayerInvites: { table: 'spoken_prayer_invites', where: 'user_id = $1' },
  surveysAnswered: { table: 'survey_respondents', where: 'user_id = $1' },
  surveyResponses: { table: 'survey_responses', where: 'user_id = $1' },
  reportsMade: { table: 'moderation_items', where: 'reporter_id = $1', omit: ['user_id', 'decided_by', 'ai_categories', 'source'] },
  assistantUse: { table: 'ai_usage', where: 'user_id = $1' },
  announcementsDismissed: { table: 'announcement_dismissals', where: 'user_id = $1' },
  dailyReminder: { table: 'daily_reminders', where: 'user_id = $1' },
  partnerPool: { table: 'partner_pool', where: 'user_id = $1' },
  partnerships: { table: 'partnerships', where: 'a_id = $1 or b_id = $1' },
  kindnessPromise: { table: 'kindness_promises', where: 'user_id = $1' },
  commentsThatHelped: { table: 'comment_appreciations', where: 'user_id = $1' },
};

// Tables that point at a member but are left out of the download on purpose:
// staff records, safety signals, and bookkeeping with nothing the member wrote.
// test/export.test.ts fails when a new table points at profiles and is in
// neither list.
export const NOT_EXPORTED = [
  // Offline replay keys and the first answer, kept a week; the posts they made are exported.
  'request_keys',
  // A moderator's decision on a heated thread, kept on the post; it holds no member's words.
  'calm_threads',
  // A circle's current invite code; it is a key to the circle, not the member's words.
  'prayer_circle_invites',
  'account_deletion_requests',
  'activity_flags',
  'announcements',
  'common_fund_entries',
  'sponsors',
  'crosspost_oauth_states',
  // The error log names only the last member an error happened to (docs/PILOT_TOOLS.md).
  'error_reports',
  'evidence_holds',
  'harm_events',
  'invite_codes',
  'legal_case_notes',
  'legal_cases',
  'macro_needs',
  'oncall_notes',
  'oncall_settings',
  'oncall_shifts',
  'podcast_shows',
  'push_deliveries',
  'radio_setup_tests',
  'reading_plans',
  'seed_prayer_settings',
  'seed_prayers',
  'staff_audit_log',
  'surveys',
  'talk_count_quota',
  'token_ledger_checks',
  // Hashes of two-step backup codes and wrong guesses: of no use to the member, and safer kept in.
  'two_step_backup_attempts',
  'two_step_backup_codes',
  'welcome_dismissed',
  'witness_cases',
  'witness_notes',
];

export const EXPORTED_TABLES = [...new Set(Object.values(SECTIONS).map((s) => s.table))];

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
  const out = {
    exportedAt: new Date().toISOString(),
    format: 'member-data/1',
    account: { email: auth[0]?.email ?? null, createdAt: auth[0]?.created_at ?? null },
    profile: profile[0] ?? null,
    ...data,
  };
  // Open Circle: the file's own names (sections and fields) use plain words too.
  // What the member wrote stays exactly as written.
  return (await isSecular(q, userId)) ? (neutralKeys(out) as typeof out) : out;
}

// Longest first, so "prayerWarrior" is handled before "prayer". Case follows the
// original: "prayer" → "support", "Prayer" → "Support", "PRAYER" → "SUPPORT".
const PLAIN: [RegExp, string][] = [
  [/prayer[_ ]?warrior/gi, 'kindness_champion'],
  [/prayed/gi, 'supported'],
  [/praying/gi, 'supporting'],
  [/prayers|prayer|pray/gi, 'support'],
  [/priestly/gi, 'lighthouse'],
  [/churches|church/gi, 'group'],
  [/pastor/gi, 'leader'],
  [/sermon/gi, 'talk'],
  [/scripture|bible/gi, 'reading'],
  [/blessings|blessing/gi, 'kindness'],
  [/faith/gi, 'belief'],
];
const sameCase = (found: string, word: string) =>
  found === found.toUpperCase() ? word.toUpperCase() : found[0] === found[0]!.toUpperCase() ? word[0]!.toUpperCase() + word.slice(1) : word;
/** A key in plain words, keeping camelCase or snake_case. */
export function plainKey(key: string) {
  let k = key;
  for (const [re, word] of PLAIN) {
    k = k.replace(re, (found) => {
      // kindness_champion inside a camelCase key becomes kindnessChampion.
      const w = /_/.test(key) || !word.includes('_') ? word : word.replace(/_(.)/g, (_, c: string) => c.toUpperCase());
      return sameCase(found, w);
    });
  }
  return k;
}

function neutralKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(neutralKeys);
  if (!v || typeof v !== 'object' || v instanceof Date) return v;
  const out: Record<string, unknown> = {};
  const entries = Object.entries(v);
  const taken = new Set(entries.map(([k]) => k));
  for (const [k, x] of entries) {
    const plain = plainKey(k);
    // Never let a renamed key overwrite another one: keep the original name then.
    const name = plain !== k && (taken.has(plain) || plain in out) ? k : plain;
    out[name] = neutralKeys(x);
  }
  return out;
}

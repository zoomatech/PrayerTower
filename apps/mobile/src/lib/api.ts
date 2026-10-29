// Typed client for the Prayer Tower API. Every call sends the Supabase access token.
import type {
  Appeal,
  CommunityFeature,
  AppNotification,
  Card,
  CareKind,
  CareQueueItem,
  CareRequest,
  Church,
  ChurchApplicationInput,
  ChurchForReview,
  ChurchStatus,
  ChatMessage,
  Comment,
  Commitment,
  FeedPage,
  FeedbackSeverity,
  FeedbackTag,
  FeedThemeChoices,
  ConversationSummary,
  ConversationView,
  ModerationItem,
  ModerationRule,
  Person,
  Role,
  Frequency,
  PostBackground,
  PostType,
  PrayerKind,
  PrayerRealm,
  Profile,
  Prompt,
  PrayerStats,
  PrayerEvent,
  EventKind,
  PublicGroup,
  TierStatus,
  TokenSummary,
  WeeklyReview,
} from '@prayer-tower/shared';

import { env } from './env';
import { enqueue, flushQueue, isOffline, markOnline, OfflineError, readCached, saveCached } from './offline';
import { supabase } from './supabase';
import type { Move, Pack } from './talk';


/** Switches for the notebook ideas built in Batch 7. */
/** The kind cloud's verdict on a draft: ok, a gentle nudge, or a firmer ask (threats, a stream of swearing). Never a refusal. */
export interface KindVerdict {
  level: 'ok' | 'nudge' | 'strong';
  reason?: 'threat' | 'foul' | 'aimed' | 'shouting' | 'advice';
}

/** A gentle redirect for a request that wishes harm (thread "Prepare for harmful prayer requests"), shown in the kind cloud. */
export interface HarmNote {
  category: string;
  action?: string;
  title?: string;
  message: string;
  resources?: { name?: string; label?: string; phone?: string; url?: string }[];
}

export interface Precheck {
  warn: boolean;
  cloud?: KindVerdict;
  harm?: HarmNote | null;
}

/** Emoji meanings: an emoji and its up-to-five positive meanings (first = what a tap adds). */
export interface MeaningEmoji {
  key: string;
  emoji: string;
  meanings: { key: string; label: string; neutralLabel: string }[];
}

/** A member's own suggested meaning. */
export interface MeaningProposal {
  id: string;
  emoji: string;
  label: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
}
/** Admin: a waiting suggestion, with the emoji's meanings now. */
export interface MeaningProposalQueueItem {
  id: string;
  emoji: string;
  icon: string;
  label: string;
  createdAt: string;
  current: { key: string; label: string }[];
}

/** A chosen meaning on a post, shown as a leaf. */
export interface MeaningLeaf {
  emoji: string;
  icon: string;
  meaning: string;
  label: string;
  neutralLabel: string;
  count: number;
  mine: boolean;
}

/** A private kindness milestone: the highest level reached for one kind of kindness. */
export interface KindMilestone {
  metric: 'people' | 'requests' | 'encouragements' | 'checkins' | 'words';
  level: number;
  count: number;
  new: boolean;
}

export interface Features {
  worldwideCount: boolean;
  thanksCard: boolean;
  sermonInputs: boolean;
  supportLabel: boolean;
  witnessStories: boolean;
  /** The "don't pressure people" community rule. */
  pressureRule: boolean;
  misleadingRule: boolean;
  automationRule: boolean;
  urgencyGlow: boolean;
  reactionTray: boolean;
  memberTown: boolean;
  prizeChoice: boolean;
  crossCommunity: boolean;
  /** Post anatomy lines from Mockups 1 and 2. */
  postLines: boolean;
  checkinAffirmation: boolean;
  whyGifts: boolean;
  poolMatching: boolean;
  /** The kind cloud on composers: a gentle "Are you sure?" (server modules/kindness). */
  kindCloud: boolean;
  /** Emoji reactions that open to positive meanings, shown as leaves. */
  meaningReactions: boolean;
  lamps: boolean;
  poolLedger: boolean;
  circleGoals: boolean;
  supportLinks: boolean;
  squireBoard: boolean;
  groupGifts: boolean;
  prayerList: boolean;
  readingPlan: boolean;
  /** Moderators can escalate a report for a law-enforcement review. */
  legalReview: boolean;
  podcasts: boolean;
  /** Paid radio prayers are matched with equal material help. */
  materialMatch: boolean;
  /** Growth ideas (docs/GROWTH.md). */
  guestPrayer: boolean;
  prayerChain: boolean;
  prayedForWidget: boolean;
  prayerMinute: boolean;
  /** Sharing outside the app only with the author's consent (docs/GROWTH.md). */
  shareConsent: boolean;
  /** Giving split (docs/GIVING_SPLIT.md): a share of gifts to the member's own support page. */
  givingSplit: boolean;
  givingSplitMax: number;
  /** "Praying for you now" on the Lock Screen (iOS Live Activity, docs/GROWTH.md). */
  prayedForLive: boolean;
  /** Mobile numbers on the prayer chain, by text message (docs/GROWTH.md). */
  prayerChainSms: boolean;
  /** Growth practices (docs/GROWTH_PRACTICES.md): "how's it going?" follow-ups, the weekly gratitude card, days this month in place of the streak. */
  followupNudge: boolean;
  gratitudeCard: boolean;
  gentleRhythm: boolean;
  /** A welcoming volunteer for a newcomer's first days, and the "Answered & remembered" look-back. */
  encourager: boolean;
  remembered: boolean;
  /** Gentle repair (docs/GENTLE_REPAIR.md): first-comment welcome card, "ask kindly" notes, Mend. */
  welcomeCard: boolean;
  askKindly: boolean;
  mend: boolean;
  liftUp: boolean;
  gratitudeCount: boolean;
  believe: boolean;
  partners: boolean;
  kindnessHighlights: boolean;
  coolDown: boolean;
  lament: boolean;
  answeredStories: boolean;
  kindnessIntro: boolean;
  checkBack: boolean;
  kindMilestones: boolean;
  /** Conversation helpers (docs/CONVERSATION_HELPERS.md); members opt in on Me too. */
  replySuggestions: boolean;
  meaningPrefs: boolean;
  troubleNudge: boolean;
  greetingPacks: boolean;
  ownWords: boolean;
  kindClosings: boolean;
  talkCounts: boolean;
  meaningIconRow: boolean;
  kindnessResearch: boolean;
  meaningProposals: boolean;
  typePrompts: boolean;
  /** Members can turn on two-step sign-in with an authenticator app. */
  twoStep: boolean;
  /** Feed skins (docs/FEED_SKINS.md): the gated skins, comment trees, skin ideas. */
  feedSkins: boolean;
  commentTree: boolean;
  /** Leaves shown on a branch before the rest fade into a blur. */
  commentTreeLeaves: number;
  /** Deepest reply level while the tree is on (0 = top-level comments only). */
  commentTreeMaxDepth: number;
  themeProposals: boolean;
  skinGallery: boolean;
  /** Longest video a member can attach, in seconds. */
  videoMaxSeconds: number;
}

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

/** One skin in Me → Skin gallery. */
export interface GallerySkin {
  slug: string;
  name: string;
  layout: string;
  season: string | null;
  tokens: Record<string, unknown>;
  maker: { id: string; name: string } | null;
  likes: number;
  liked: boolean;
  inUse: boolean;
}

export type MakerLayout = 'vine' | 'wall' | 'tower' | 'circuit';

export interface ThemeProposal {
  id: string;
  name: string;
  description: string;
  layout: MakerLayout;
  colors: { stem?: string; leaf?: string; backdrop?: string };
  /** The look the member built in the theme maker. */
  tokens: Record<string, unknown>;
  status: 'pending' | 'approved' | 'declined';
  reviewNote: string | null;
  themeSlug: string | null;
  createdAt: string;
  from?: { id: string; name: string };
}

export interface PracticeSettings {
  followup_enabled: boolean;
  followup_days: number;
  gratitude_enabled: boolean;
  gentle_rhythm_enabled: boolean;
  encourager_enabled: boolean;
  encourager_days: number;
  newcomer_days: number;
  remembered_enabled: boolean;
  welcome_card_enabled: boolean;
  welcome_text: string | null;
  ask_kindly_enabled: boolean;
  mend_enabled: boolean;
  lift_up_enabled: boolean;
  gratitude_count_enabled: boolean;
  believe_enabled: boolean;
  partners_enabled: boolean;
  partner_days: number;
  highlights_enabled: boolean;
  cool_down_enabled: boolean;
  lament_enabled: boolean;
  answered_stories_enabled: boolean;
  kindness_intro_enabled: boolean;
  check_back_enabled: boolean;
  kind_milestones_enabled: boolean;
}
export interface ConversationSettings {
  reply_suggestions_enabled: boolean;
  meaning_prefs_enabled: boolean;
  trouble_nudge_enabled: boolean;
  greeting_packs_enabled: boolean;
  own_words_enabled: boolean;
  kind_closings_enabled: boolean;
  talk_counts_enabled: boolean;
  meaning_row_enabled: boolean;
  research_page_enabled: boolean;
  meaning_proposals_enabled: boolean;
  type_prompts_enabled: boolean;
}
export interface ConversationPrefs {
  replySuggestions: boolean;
  troubleNudge: boolean;
  kindClosings: boolean;
  greetingPack: Pack | null;
  shareCounts: boolean;
}
/** Move labels only: never words, never who. */
export type TalkCount = { kind: 'chain'; moves: [Move, Move | 'other', Move | 'other'] } | { kind: 'emoji'; emoji: string; meaning: string; toMove: Move | 'other' };
export interface TalkCountSummary {
  weeks: number;
  minShown: number;
  chains: { moves: string[]; n: number }[];
  otherChains: number;
  emoji: { emoji: string; meaning: string; toMove: string; n: number }[];
  otherEmoji: number;
}
export interface MeaningPref {
  emoji: string;
  defaultMeaning: string | null;
  hidden: string[];
}
export type KindAskReason = 'dismissive' | 'grief' | 'unkind' | 'other';
export type MendStatus = 'invited' | 'review' | 'returned' | 'delivered' | 'accepted' | 'closed' | 'withdrawn';
export interface Sorry {
  whatIDid: string;
  onMe: string;
  nextTime: string;
}
export interface Mend {
  id: string;
  role: 'author' | 'hurt' | 'moderator';
  status: MendStatus;
  comment: { postId: string; body: string };
  author: { displayName: string } | null;
  sorry: Sorry | null;
  canRevise: boolean;
  moderatorNote: string | null;
}
export interface EncouragerMatch {
  id: string;
  role: 'newcomer' | 'encourager';
  other: { id: string; displayName: string };
  endsAt: string;
}
export type EncouragerState = { enabled: false } | { enabled: true; volunteer: boolean; canAsk: boolean; matches: EncouragerMatch[]; matched?: boolean };
export interface RememberedItem {
  id: string;
  body: string;
  testimony: string | null;
  answeredAt: string;
}
export type FollowupAnswer = 'grateful' | 'still' | 'changed' | 'private';
export type Gratitude = { enabled: false } | { enabled: true; weekday: number | null; weekStart: string; items: string[]; weeks?: number | null };
export type PartnerState =
  | { enabled: false }
  | {
      enabled: true;
      days: number;
      status: 'none' | 'waiting' | 'paired';
      partner: { id: string; displayName: string } | null;
      endsAt: string | null;
      canCheckIn: boolean;
      checkins: { id: string; mine: boolean; mood: 'good' | 'okay' | 'hard'; note: string | null; at: string }[];
    };
export type KindnessHighlights = { enabled: false; weeks: [] } | { enabled: true; weeks: { week: string; items: { id: string; text: string }[] }[] };
export type HighlightAsks = { enabled: boolean; asks: { id: string; status: 'asked' | 'consented' | 'picked'; body: string; shownText: string | null }[] };
export interface HighlightQueueItem {
  id: string;
  status: 'consented' | 'picked';
  body: string;
  shownText: string | null;
  community: string | null;
}
export type LiftUp = { enabled: false } | { enabled: true; weekStart: string; body: string };

export interface GrowthSettings {
  guest_prayer_enabled: boolean;
  prayer_chain_enabled: boolean;
  prayer_chain_max: number;
  prayed_for_widget_enabled: boolean;
  prayer_minute_enabled: boolean;
  guest_email_days: number;
  share_consent_enabled: boolean;
  prayed_for_live_enabled: boolean;
  prayer_chain_sms_enabled: boolean;
}
export interface GivingSplit {
  url: string;
  percent: number;
  shareCents: number | null;
}
export interface MyGivingSplit {
  enabled: boolean;
  maxPercent: number;
  percent: number;
  supportUrl: string | null;
}
/** Who may share a post outside the app, chosen by its author. */
export type ShareLevel = 'private' | 'link' | 'card';
export interface ShareState {
  mine: boolean;
  level: ShareLevel;
  canShare: boolean;
  cardAllowed: boolean;
  /** True on a share card: the message may carry the post's words. */
  words: boolean;
  /** /post/<id> (members-only app link) or /card/<token> (public card, on the site host). */
  path: string;
}
export interface GuestLink {
  token: string;
  /** /pray/<token> (or /circle/<token> in Open Circle), on the site host. */
  path: string;
  guestPrayers: number;
}
export interface ChainPerson {
  id: string;
  /** One of the two: an email address, or a mobile number (+15055550100) while texts are on. */
  email: string | null;
  phone?: string | null;
  status: 'pending' | 'confirmed' | 'left';
  createdAt: string;
}
export type PrayedFor = { enabled: false } | { enabled: true; names: string[]; people: number };
export type PrayerMinute = { enabled: false } | { enabled: true; time: string | null; timeZone: string | null; others: number };
export type PrayerMinuteNow = { enabled: false } | { enabled: true; together: number; requests: Card[] };

export type WorldwideStats =
  | { enabled: false }
  | { enabled: true; prayersToday: number; prayersAllTime: number; peopleToday: number; peoplePrayedForYou: number };

export interface EventInput {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  from: { id: string; name: string };
}

export interface NotebookSettings {
  worldwide_count_enabled: boolean;
  thanks_card_enabled: boolean;
  thanks_card_days: number;
  sermon_inputs_enabled: boolean;
  support_label_enabled: boolean;
  witness_stories_enabled: boolean;
  pressure_rule_enabled: boolean;
  misleading_rule_enabled: boolean;
  automation_rule_enabled: boolean;
  urgency_glow_enabled: boolean;
  reaction_tray_enabled: boolean;
  member_town_enabled: boolean;
  prize_choice_enabled: boolean;
  waitlist_enabled: boolean;
  cross_community_enabled: boolean;
  post_lines_enabled: boolean;
  tier_upkeep_enabled: boolean;
  tier_upkeep_days: number;
  checkin_affirmation_enabled: boolean;
  why_gifts_enabled: boolean;
  pool_matching_enabled: boolean;
  kind_cloud_enabled: boolean;
  meaning_reactions_enabled: boolean;
  lamps_enabled: boolean;
  lamps_per_week: number;
  pool_ledger_enabled: boolean;
  circle_goals_enabled: boolean;
  giving_ask_enabled: boolean;
  giving_ask_after_days: number;
  support_links_enabled: boolean;
  squire_board_enabled: boolean;
  squire_board_days: number;
  group_gifts_enabled: boolean;
  prayer_list_enabled: boolean;
  reading_plan_enabled: boolean;
  promise_page_enabled: boolean;
  podcasts_enabled: boolean;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** How long to wait on a slow connection before treating the request as offline. */
const TIMEOUT_MS = 15_000;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: abort.signal,
    });
  } catch {
    // fetch only rejects when the server can't be reached (or we gave up waiting).
    markOnline(false);
    throw new OfflineError();
  } finally {
    clearTimeout(timer);
  }
  markOnline(true);
  // Back online: send anything that was waiting (not from inside the queue itself).
  if (!sendingQueued) void sendQueued();
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issue = json.issues?.[0]?.message;
    throw new ApiError(res.status, json.error ?? 'error', issue ?? json.message ?? 'Something went wrong');
  }
  return json as T;
}

const get = <T>(path: string) => request<T>('GET', path);

let sendingQueued = false;
/** Send queued offline actions now (also called when the app comes back to the foreground). */
export async function sendQueued() {
  sendingQueued = true;
  try {
    await flushQueue((a) => request(a.method, a.path, a.body));
  } finally {
    sendingQueued = false;
  }
}

/** A GET whose last good answer is kept on the device and returned, marked, when offline. */
async function cachedGet<T extends object>(key: string, path: string): Promise<T & { savedAt?: number }> {
  try {
    const fresh = await get<T>(path);
    void saveCached(key, fresh);
    return fresh;
  } catch (e) {
    if (!isOffline(e)) throw e;
    const saved = await readCached<T>(key);
    if (!saved) throw e;
    return { ...saved.value, savedAt: saved.savedAt };
  }
}

/** A POST that waits in the offline queue when the server can't be reached. */
async function postOrQueue<T>(path: string, body: unknown, label: string): Promise<T | { queued: true }> {
  try {
    return await post<T>(path, body);
  } catch (e) {
    if (!isOffline(e)) throw e;
    await enqueue({ method: 'POST', path, body, label });
    return { queued: true };
  }
}

/** A plain-text download (e.g. CSV), with the same auth as JSON calls. */
async function getText(path: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${env.apiUrl}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'error', 'Download failed');
  return res.text();
}
const post = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);
const put = <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body);

export interface AdminTokenSettings {
  priestly_prayers_per_token: number;
  verified_prayer_min_gap_seconds: number;
  radio_prayer_cost: number;
  radio_funding: 'tokens' | 'free';
  verified_prayers_per_day: number;
  /** Priestly tokens for one Amplify while radio prayers cost tokens; null = paid Amplify off. */
  amplify_paid_cost: number | null;
}
export interface AdminRadioSettings {
  radio_transmitter: 'log' | 'station';
  radio_station_requires_free: boolean;
  radio_max_chars: number;
  radio_amplify_repeats: number;
  radio_order: 'oldest' | 'need';
  /** Most prayers the station may claim at once (burst mode); 1 = one at a time. */
  radio_batch_max: number;
  /** The public /listen page that decodes bursts from a phone's microphone. */
  listen_page_enabled: boolean;
  radio_receipts_enabled: boolean;
  on_air_page_enabled: boolean;
}

/** A station health alert in Admin → Radio (server radio/health.ts). */
export interface StationAlert {
  kind: 'no_audio_device' | 'ptt_failed' | 'burst_failed' | 'burst_overdue' | 'station_silent' | 'queue_empty';
  level: 'problem' | 'info';
  detail: string;
  callSign: string | null;
  since: string | null;
}
export interface RadioWindow {
  days: number[];
  start: string;
  end: string;
}

export interface RadioSchedule {
  enabled: boolean;
  timeZone: string;
  windows: RadioWindow[];
  quietStart: string | null;
  quietEnd: string | null;
}

export interface StationHealth {
  enabled: boolean;
  health: {
    stations: { callSign: string; lastHeartbeat: string | null; silent: boolean; checks: { name: string; ok: boolean; detail: string }[]; bursts24h: number; failed24h: number; prayers24h: number; lastBurstAt: string | null; lastError: string | null }[];
    queue: { queued: number; sending: number; oldestMinutes: number | null };
    snr: { callSign: string; preset: string; reports: number; avgDb: number; minDb: number; lastAt: string }[];
    failures: { at: string; callSign: string | null; kind: 'burst' | 'prayer'; error: string }[];
  } | null;
  acks: { enabled: boolean; timeoutMinutes: number; maxRetries: number; heard: number; waiting: number; unheard: number; retried: number };
}

export interface StationAlerts {
  enabled: boolean;
  overdueMinutes: number;
  alerts: StationAlert[];
}

/** A receive-only listener node (server radio/nodes.ts). */
export interface RadioNode {
  id: string;
  name: string;
  role: 'listener' | 'station';
  enabled: boolean;
  created_at: string;
  last_seen_at: string | null;
}
export interface RadioNodes {
  enabled: boolean;
  /** Several stations share the queue, each with its own key. */
  multiStation: boolean;
  /** Listener nodes must sign each request (LISTEN_SIGN=on) instead of sending their key. */
  signaturesRequired: boolean;
  /** Prayers each station holds now and sent in the last 24 hours; node null is the main station. */
  stations: { node: string | null; sending: number; sent: number }[];
  nodes: RadioNode[];
  reports: { node: string; call_sign: string; preset: string; snr_db: number; heard_at: string }[];
}

/** Admin → Radio → Setup wizard (server radio/setup.ts). */
export interface RadioSetupChoice {
  rig?: string;
  model?: number;
  port?: string;
  speed?: number;
  band?: 'fm' | 'hf';
  frequencyHz?: number;
}
export interface RadioSetupTest {
  id: string;
  kind: 'tone' | 'burst';
  status: 'requested' | 'sending' | 'sent' | 'heard' | 'failed';
  seconds: number;
  code: string;
  call_sign: string | null;
  preset: string | null;
  peak_dbfs: number | null;
  heard_by: string | null;
  heard_snr_db: number | null;
  heard_peak_dbfs: number | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
  heard_at: string | null;
  /** The receiver's level: quiet (under -30 dBFS), good, or hot (clipping). */
  advice?: 'quiet' | 'good' | 'hot' | null;
}
export interface RadioSetup {
  enabled: boolean;
  choice: RadioSetupChoice;
  rigs: { id: string; label: string; model: number | null }[];
  env: { rigctld: string[]; station: string[] };
  checks: { call_sign: string; checks: { name: string; ok: boolean; detail: string }[]; reported_at: string }[];
  tests: RadioSetupTest[];
}

/** Admin → Radio → Coverage map (server radio/coverage.ts). Locations are rounded to about a city. */
export interface CoveragePoint {
  id: string;
  name: string;
  place: string | null;
  lat: number;
  lon: number;
  snrDb: number | null;
  reports: number;
  lastHeardAt: string | null;
  lastSeenAt: string | null;
  quality: 'strong' | 'fair' | 'weak' | 'none';
}
export interface RadioCoverage {
  enabled: boolean;
  tileUrl: string;
  station: { lat: number; lon: number } | null;
  points: CoveragePoint[];
  unplaced: { id: string; name: string }[];
}

/** Admin → Radio → Weekly radio digest (server radio/digest.ts). */
export interface RadioDigestWeek {
  week_start: string;
  aired: number;
  heard: number;
  answered: number;
  thanksgiving: number;
  praying_too: number;
  failed: number;
}
export interface RadioDigest {
  enabled: boolean;
  email: boolean;
  weeks: RadioDigestWeek[];
}

/** One burst the station sent (burst mode), newest first in Admin → Radio. */
export interface StationBurst {
  id: string;
  created_at: string;
  call_sign: string;
  mode: 'audio' | 'fldigi' | 'simulate';
  preset: string;
  prayers: number;
  frames: number;
  bytes: number;
  seconds: number;
  /** Prayers decoded back from the burst audio (simulate mode); null when not checked. */
  decoded: number | null;
  ok: boolean;
  error: string | null;
}

export interface PowerPrayerStatus {
  reach: number;
  freeLeft: number;
  cost: number;
  /** Set when the member can't use it yet (e.g. new members). */
  blockedReason: string | null;
}

export interface TokenPool {
  id: string;
  name: string;
  purpose: string;
  realm: string | null;
  drawAmount: number;
  drawsPerMemberDay: number;
  /** Null unless the donor chose to be named. */
  donor: string | null;
  isMine: boolean;
  open: boolean;
  balance: number;
  /** A matching pledge, while matching is switched on. */
  match: { mode: 'ratio' | 'quadratic'; ratio: number; cap: number; matched: number } | null;
  /** Only when listed for a request: why the member can't draw, or null. */
  blockedReason?: string | null;
}

export interface ScheduledSpend {
  id: string;
  post_id: string;
  amount: number;
  next_run_at: string;
  repeat_weeks: number;
  runs: number;
  status: 'active' | 'done' | 'cancelled' | 'failed';
  error: string | null;
  excerpt: string;
}

export interface MilestoneRule {
  id: string;
  label: string;
  metric: 'prayers_for_others' | 'commitment_checkins' | 'answered_requests';
  threshold: number;
  amount: number;
  currency: 'regular' | 'priestly';
  enabled: boolean;
  awarded: number;
}

export interface MacroNeed {
  id: string;
  title: string;
  helpOptions: { label: string; url: string }[];
  endsAt: string | null;
  card: Card | null;
  prayers: number;
  tokens: number;
  helpers: number;
  helped: boolean;
}

export interface PrayerCast {
  totals: { prayers: number; sends: number };
  cast: { id: string; post_id: string; text: string; repeats: number; transmitter: string | null; call_sign: string | null; transmitted_at: string }[];
}

export interface Highlights {
  days: number;
  topPrayers: { prayers: number; card: Card }[];
  topWarriors: { id: string | null; displayName: string; prayers: number }[];
}

export interface FeedbackItem {
  id: string;
  kind: string;
  body: string;
  platform: string | null;
  appVersion: string | null;
  createdAt: string;
  name: string;
  status: 'open' | 'closed';
  tags: FeedbackTag[];
  severity: FeedbackSeverity | null;
  note: string | null;
  triagedAt: string | null;
  closedAt: string | null;
}

export type ImportStatus = 'ok' | 'invited' | 'emailed' | 'posted' | 'skipped' | 'error';
export interface ImportResult {
  kind: 'members' | 'requests';
  dryRun: boolean;
  error?: string;
  rows: { line: number; status: ImportStatus; reason?: string; email?: string; name?: string; code?: string; request?: string; postId?: string }[];
  counts: Record<ImportStatus, number>;
}

export interface FailedJob {
  id: string;
  task: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  key: string | null;
  createdAt: string;
  failedAt: string;
}
export interface RetryingTask {
  task: string;
  jobs: number;
  attempts: number;
  lastError: string | null;
}

export type OpsProblem = 'worker_down' | 'jobs_overdue' | 'jobs_failed' | 'server_errors' | 'station_silent';
export interface OpsStatus {
  checkedAt: string;
  database: { ms: number };
  worker: { lastSeen: string | null; ok: boolean };
  queue: { waiting: number; running: number; overdue: number; oldestOverdueSeconds: number; failed: number; retrying: number };
  errors: { lastHour: number; last24h: number; recent: { at: string; method: string; route: string; status: number }[] };
  radio: {
    mode: 'log' | 'station';
    queued: number;
    sending: number;
    sentToday: number;
    failedToday: number;
    lastSentAt: string | null;
    station: { lastSeen: string | null; ok: boolean | null };
  };
  problems: OpsProblem[];
}

export interface LedgerCheck {
  id: string;
  checkedAt: string;
  ok: boolean;
  accountsChecked: number;
  transfersChecked: number;
  problems: ({ check: 'balance_mismatch' | 'currency_total' | 'negative_balance' | 'clawback_mismatch' } & Record<string, string>)[];
  triggeredBy: string | null;
}

export interface Announcement {
  id: string;
  kind: 'banner' | 'notice';
  title: string;
  body: string;
  titleEs: string | null;
  bodyEs: string | null;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
}

export interface SurveyQuestion {
  id: string;
  position: number;
  kind: 'single' | 'multi' | 'scale' | 'text';
  prompt: string;
  /** Choices; for a scale, its two end labels (or none). */
  options: string[];
  required: boolean;
}
export interface Survey {
  id: string;
  title: string;
  intro: string | null;
  status: 'draft' | 'open' | 'closed';
  anonymous: boolean;
  community: string | null;
  closesAt: string | null;
  questions: SurveyQuestion[];
}
export interface SurveyAnswer {
  questionId: string;
  choices?: string[];
  value?: number;
  text?: string;
}
export type NewSurveyQuestion = Pick<SurveyQuestion, 'kind' | 'prompt' | 'options' | 'required'>;
export interface SurveyResults {
  survey: Survey;
  responses: number;
  /** False while an anonymous survey has too few answers to show. */
  shown: boolean;
  questions: { id: string; prompt: string; kind: SurveyQuestion['kind']; answered: number; counts?: Record<string, number>; average?: number | null; texts?: string[] }[];
}

export interface PodcastEpisode {
  id: string;
  guid: string;
  title: string;
  description: string;
  audioUrl: string;
  audioBytes: number;
  audioType: string;
  durationSeconds: number | null;
  episodeNumber: number | null;
  /** Null: a draft. */
  publishedAt: string | null;
}
/** Why the app runs on gifts, not ads (GET /why-gifts): the website's words for this edition. */
export interface WhyGifts {
  title: string;
  intro: string;
  points: { heading: string; body: string }[];
  /** The website's Give link (the app opens Me → Give instead). */
  giveUrl: string | null;
  /** The public fund report's path on the API host, while it is published. */
  fundPath: string | null;
}

export interface PodcastShow {
  id: string;
  slug: string;
  community: string | null;
  title: string;
  description: string;
  author: string;
  imageUrl: string | null;
  category: string;
  published: boolean;
  episodes: PodcastEpisode[];
}

export interface LegalCase {
  id: string;
  kind: 'preservation' | 'legal_process' | 'emergency' | 'referral';
  status: 'open' | 'closed';
  agency: string | null;
  reference: string | null;
  receivedAt: string | null;
  subjectId: string | null;
  subjectName: string | null;
  moderationItemId: string | null;
  summary: string;
  createdAt: string;
  closedAt: string | null;
  activeHolds: number;
}
export interface LegalCaseDetail {
  case: LegalCase;
  notes: { id: string; body: string; createdAt: string; author: string | null }[];
  holds: { id: string; userId: string; createdAt: string; expiresAt: string; releasedAt: string | null; items: number }[];
}

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
  /** The community a new member joins with this code; null means the default. */
  community: { slug: string; name: string; secular: boolean } | null;
}

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_id: string | null;
  params: Record<string, string>;
  body: unknown;
  status: number;
  created_at: string;
}

export interface PilotWeek {
  week_start: string;
  new_members: number;
  requests_posted: number;
  prayers_answered: number;
  praying_now_taps: number;
  active_pray_ers: number;
  commitments_made: number;
  commitment_checkins: number;
  encouragements: number;
  moderation_items: number;
  removals: number;
}

export interface AdminSafetySettings {
  new_member_limits_enabled: boolean;
  new_member_hours: number;
  new_member_min_prayers: number;
  new_member_posts_per_day: number;
  new_member_comments_per_day: number;
  new_member_links_allowed: boolean;
  posts_per_hour: number;
  comments_per_hour: number;
  messages_per_minute: number;
}
export type WitnessStatus = 'watching' | 'reaching_out' | 'helped' | 'closed';

export interface WitnessCase {
  id: string;
  postId: string;
  status: WitnessStatus;
  postBody: string;
  posterName: string;
  anonymousPost: boolean;
  assignedTo: string | null;
  helpCount: number;
  lastNote: string | null;
  updatedAt: string;
}

export interface AdminMessagingSettings {
  prayer_messages_enabled: boolean;
  prayer_messages_any_prayer: boolean;
  direct_messages_enabled: boolean;
  direct_requires_mutual_follow: boolean;
  groups_enabled: boolean;
  request_message_limit: number;
  new_members_can_start: boolean;
  new_member_messages_per_day: number;
  group_max_members: number;
}

export interface AdminTier {
  tier: string;
  label: string;
  rank: number;
  min_prayer_events: number | null;
  weekly_allotment: number | null;
}
export interface AdminPerson {
  id: string;
  display_name: string;
  email: string | null;
  roles: Role[];
}

export interface NewPost {
  postType: PostType;
  body: string;
  urgency?: number;
  kind?: PrayerKind;
  realm?: PrayerRealm;
  background?: PostBackground;
  isAnonymous?: boolean;
  isSensitive?: boolean;
  /** "Prayer and positive thoughts welcome" from people of any faith or none. */
  allSupportWelcome?: boolean;
  isLament?: boolean;
  lamentRadio?: boolean;
  media?: { kind: 'image' | 'video'; storagePath: string; durationMs?: number }[];
}

/** Annual Prayer Warrior Award (off by default). */
export interface Award {
  id: string;
  year: number;
  rank: number;
  userId: string;
  name: string;
  prayers: number;
  checkins: number;
  peoplePrayedFor: number;
  status: 'offered' | 'accepted' | 'declined';
  showName: boolean;
  prizeChoice?: PrizeChoice;
  decidedAt: string | null;
}
export interface WaitlistEntry {
  id: string;
  email: string;
  name: string;
  note: string;
  edition: 'prayer-tower' | 'open-circle';
  inviteCode: string | null;
  invitedAt: string | null;
  createdAt: string;
}
export type PrizeChoice = 'keep' | 'donate' | 'split';
export interface AwardSettings {
  enabled: boolean;
  winners: number;
  token_prize: number;
  priestly_prize: number;
  prize_note: string;
  public_hall: boolean;
}
export type LiveRoom = { id: string; title: string; roomUrl: string; hostName: string; isMine: boolean; startedAt: string };
/** Harmful prayers (docs/HARMFUL_PRAYERS.md). Off by default. */
export type HarmLevel = 'hold' | 'review' | 'allow';
export type HarmSettings = {
  enabled: boolean;
  threat_action: HarmLevel;
  hate_action: HarmLevel;
  harm_wish_action: HarmLevel;
  curse_action: HarmLevel;
  revenge_action: HarmLevel;
  abuse_action: 'support' | 'allow';
  foul_hold_at: number;
  foul_junk_filter: boolean;
  flood_per_day: number;
  extra_hate_words: string[];
  explain_held: boolean;
};
export type ModeratorCare = {
  settings: { enabled: boolean; dashboard_enabled: boolean; weekly_report_enabled: boolean; restore_enabled: boolean; blur_hard: boolean; break_after_minutes: number; break_after_hard_items: number; break_minutes: number };
  colleagues: { id: string; display_name: string }[];
};
export type ModerationDashboard = {
  days: number;
  queue: { source: string; pending: number; oldest_minutes: number | null }[];
  speed: { source: string; decided: number; median_minutes: number | null; p90_minutes: number | null }[];
  falseAlarms: { category: string; decided: number; dismissed: number; rate: number | null }[];
  floods: { floods: number; accounts: number; items: number };
  handoffs: number;
};
export type HarmReport = {
  id: string;
  week_start: string;
  report: { flagged: number; bundled: number; rules: { rule: string; flagged: number; dismissed: number; removed: number; falseAlarmRate: number | null; tooLoose: boolean }[] };
};
export type OncallSettings = { enabled: boolean; max_wait_minutes: number; remind_at_percent: number; timezone: string; escalate_to: string | null };
export type OncallShift = { id: string; user_id: string; display_name: string; weekday: number; start_minute: number; end_minute: number };
export type OncallStatus = {
  settings: OncallSettings;
  onCall: { user_id: string; display_name: string; end_minute: number }[];
  waiting: number;
  oldest_minutes: number | null;
  over: number;
  notes: { id: string; author_name: string | null; body: string; created_at: string }[];
};
export type HarmFlood = { user_id: string; display_name: string; items: number; categories: string[]; first_at: string; last_at: string };
export type LiveSettings = { enabled: boolean; jitsi_url: string | null; max_minutes: number };
export type AiTurn = { role: 'user' | 'assistant'; content: string };
export type CircleRole = 'harmed' | 'caused' | 'unsure';
export type CircleRequest = { id: string; userId: string; displayName: string; role: CircleRole; summary: string; status: 'open' | 'closed'; createdAt: string };
export type AiSettings = {
  chat_daily_limit: number;
  facilitator_enabled: boolean;
  facilitator_daily_limit: number;
  auto_pray_enabled: boolean;
  auto_pray_per_day: number;
  auto_pray_daily_limit: number;
  auto_pray_days: number;
};

/** Circle goals: "N people pray for this by <date>". */
export type CircleGoal =
  | { enabled: false }
  | { enabled: true; canSet: boolean; goal: { target: number; endsAt: string; prayed: number; met: boolean; ended: boolean } | null };

/** Lamp awards: thanks with a note, recognition only. */
export type SquireBoard =
  | { enabled: false }
  | {
      enabled: true;
      days: number;
      onBoard: boolean;
      canJoin: boolean;
      entries: { rank: number; personId: string; name: string; prayers: number; peoplePrayedFor: number; you: boolean }[];
    };

export type PrayerListItem = { id: string; name: string; note: string; remind: 'off' | 'daily' | 'weekly'; nextReminderAt: string | null; lastPrayedAt: string | null; prayedCount: number };
export type PrayerList = { enabled: false } | { enabled: true; items: PrayerListItem[] };

export type ReadingPlanToday =
  | { enabled: false }
  | {
      enabled: true;
      plan: {
        id: string;
        title: string;
        day: number;
        days: number;
        conversationId: string | null;
        reading: { reference: string; url: string; read: boolean; readers: number } | null;
      } | null;
    };
export type StaffReadingPlan = { id: string; title: string; startsOn: string; days: number; readers: number; archived: boolean };

export type Lamps = {
  enabled: boolean;
  count: number;
  lamps: { id: string; note: string; createdAt: string; giverId: string; giverName: string }[];
  canGive: boolean;
  leftThisWeek: number;
};

/** Auto-Pray: AI prayers under a request, counted apart from prayers by people. */
export type AiPrayers = {
  enabled: boolean;
  optedIn: boolean;
  until: string | null;
  count: number;
  prayers: { id: string; body: string; createdAt: string }[];
  isMine?: boolean;
};
export type MyAwards = { enabled: false; awards: [] } | { enabled: true; prize: { tokens: number; priestly: number; note: string }; publicHall: boolean; awards: Award[] };
export type AwardHall =
  | { enabled: false; years: [] }
  | { enabled: true; years: { year: number; winners: { rank: number; name: string | null; prayers: number; peoplePrayedFor: number }[] }[] };

export interface SpokenPrayerSettings {
  enabled: boolean;
  max_seconds: number;
  max_offer_tokens: number;
}

/** A voice prayer someone recorded for a request (spoken prayers). */
export interface SpokenPrayer {
  id: string;
  from: { id: string; displayName: string };
  durationSeconds: number;
  offerTokens: number;
  paid: boolean;
  listened: boolean;
  createdAt: string;
  url: string | null;
}
export type SpokenPrayerStatus =
  | { enabled: false }
  | { enabled: true; mine: true; invited: boolean; offerTokens: number; maxSeconds: number; maxOfferTokens: number; received: SpokenPrayer[] }
  | { enabled: true; mine: false; invited: boolean; offerTokens: number; maxSeconds: number; sent: boolean; prayed: boolean };

/** A community members belong to; "neutral" wording (Open Circle) has no religious words. */
export interface Community {
  slug: string;
  name: string;
  tradition: string;
  status: 'active' | 'hidden';
  isDefault: boolean;
  enabledPostTypes: string[];
  /** Features an admin hid for this community (Admin → Communities). */
  hiddenFeatures?: CommunityFeature[];
  wording?: 'faith' | 'neutral';
  description?: string | null;
  /** Who runs it, for a community run by a partner; null = Prayer Tower. */
  operatorName?: string | null;
  operatorContact?: string | null;
  members?: number;
}

export interface TokenProduct {
  sku: string;
  tokens: number;
  currency: 'regular' | 'priestly';
  priceLabel: string | null;
  appleProductId: string | null;
  googleProductId: string | null;
}
export interface TokenPurchaseResult {
  id: string;
  tokens: number;
  currency: 'regular' | 'priestly';
  status: 'credited' | 'refunded';
  balance: number;
}
export interface TokenPurchase {
  id: string;
  store_product_id: string;
  tokens: number;
  currency: 'regular' | 'priestly';
  status: 'credited' | 'refunded';
  purchased_at: string | null;
}

/** Giving (off until an admin turns it on and sets up Stripe or a Zeffy link). */
export interface GivingInfo {
  enabled: boolean;
  provider: 'none' | 'stripe' | 'zeffy';
  url: string | null;
  /** PayPal's Donate link, a second way to give; null when not set. */
  paypalUrl: string | null;
  minCents: number;
  maxCents: number;
  everyoneMonthly: number;
  allocationRequests: boolean;
}
export type GiftTarget = { kind: 'everyone' } | { kind: 'member'; userId: string } | { kind: 'pool'; poolId: string };
export interface MyGift {
  id: string;
  amount_cents: number;
  status: 'pending' | 'paid' | 'refunded' | 'failed';
  target_kind: GiftTarget['kind'];
  created_at: string;
}
export interface RadioAllowance {
  enabled: boolean;
  freeThisMonth: number;
  granted: number;
  canRequest: boolean;
  pendingRequest: number | null;
  maxPerRequest: number;
}
export interface AllocationRequestRow {
  id: string;
  count: number;
  note: string;
  name: string;
  sent_last_30_days: number;
  created_at: string;
}
export interface AdminDonationSettings {
  enabled: boolean;
  provider: 'none' | 'stripe' | 'zeffy';
  donate_url: string | null;
  paypal_url: string | null;
  zeffy_amount_unit: 'cents' | 'dollars';
  min_cents: number;
  max_cents: number;
  priestly_per_dollar: number;
  regular_per_dollar: number;
  everyone_monthly: number;
  allocation_requests_enabled: boolean;
  allocation_max_per_request: number;
}
export interface AdminGift extends MyGift {
  provider: 'stripe' | 'zeffy' | 'paypal' | 'manual';
  donor_name?: string | null;
}

export const api = {
  /** Public: whether sign-up needs an invite code. */
  signupConfig: () => get<{ inviteOnly: boolean }>('/signup-config'),
  announcements: () => get<{ announcements: Announcement[] }>('/announcements'),
  dismissAnnouncement: (id: string) => post<{ dismissed: true }>(`/announcements/${id}/dismiss`),
  surveys: () => get<{ surveys: Survey[] }>('/surveys'),
  podcasts: () => get<{ shows: PodcastShow[] }>('/podcasts'),
  whyGifts: (wording: 'faith' | 'neutral') => get<WhyGifts>(`/why-gifts?wording=${wording}`),
  answerSurvey: (id: string, answers: SurveyAnswer[]) => post<{ ok: true }>(`/surveys/${id}/responses`, { answers }),
  // Kept on the device so a signed-in member who opens the app with no signal still gets in.
  me: () => cachedGet<{ profile: Profile; roles: Role[]; community?: Community | null }>('me', '/me'),
  spokenPrayers: (postId: string) => get<SpokenPrayerStatus>(`/posts/${postId}/spoken-prayers`),
  inviteSpokenPrayers: (postId: string, offerTokens: number) => put<{ invited: true; offerTokens: number }>(`/posts/${postId}/spoken-prayers/invite`, { offerTokens }),
  uninviteSpokenPrayers: (postId: string) => request<{ invited: false }>('DELETE', `/posts/${postId}/spoken-prayers/invite`),
  spokenUploadUrl: (postId: string, contentType: string) =>
    post<{ path: string; token: string; signedUrl: string }>(`/posts/${postId}/spoken-prayers/upload-url`, { contentType }),
  sendSpokenPrayer: (postId: string, storagePath: string, durationSeconds: number) =>
    post<{ id: string; offerTokens: number }>(`/posts/${postId}/spoken-prayers`, { storagePath, durationSeconds }),
  spokenListened: (id: string) => post<{ listened: true; paid: boolean; notEnoughTokens: boolean }>(`/spoken-prayers/${id}/listened`),
  removeSpokenPrayer: (id: string) => request<{ removed: true }>('DELETE', `/spoken-prayers/${id}`),
  liveNow: () => get<{ enabled: boolean; canHost: boolean; canCreateRoom: boolean; rooms: LiveRoom[] }>('/live'),
  startLive: (title: string, link?: string) => post<{ id: string; roomUrl: string }>('/live', { title, ...(link ? { link } : {}) }),
  endLive: (id: string) => post<{ ended: true }>(`/live/${id}/end`),
  aiChatInfo: () => get<{ enabled: boolean; warning: string }>('/ai-chat'),
  aiChat: (message: string, history: AiTurn[]) => post<{ warning: string; reply: string; crisis: boolean }>('/ai-chat', { message, history }),
  facilitatorInfo: () => get<{ enabled: boolean; questions: Record<CircleRole, string[]> }>('/ai-facilitator'),
  facilitate: (role: CircleRole, message: string, history: AiTurn[]) =>
    post<{ reply: string; crisis: boolean; ai: boolean }>('/ai-facilitator', { role, message, history }),
  askForCircle: (role: CircleRole, summary: string) => post<{ id: string }>('/circle-requests', { role, summary }),
  circleRequests: () => get<{ requests: CircleRequest[] }>('/moderation/circle-requests'),
  closeCircleRequest: (id: string) => post<{ closed: true }>(`/moderation/circle-requests/${id}/close`),
  awardHall: () => get<AwardHall>('/awards'),
  myAwards: () => get<MyAwards>('/me/awards'),
  acceptAward: (id: string, showName: boolean, prize?: PrizeChoice) =>
    post<{ accepted: true; tokens: number; priestly: number; prizeChoice: PrizeChoice }>(`/me/awards/${id}/accept`, prize ? { showName, prize } : { showName }),
  across: () => get<{ card: Card | null }>('/across'),
  quickReact: (postId: string, kind: 'candle' | 'standing', on: boolean) =>
    request<{ candles: number; standing: number; mine: ('candle' | 'standing')[] }>(on ? 'PUT' : 'DELETE', `/posts/${postId}/quick-reactions/${kind}`),
  reactionMeanings: () => get<{ emoji: MeaningEmoji[] }>('/reaction-meanings'),
  meanings: (postId: string) => get<{ leaves: MeaningLeaf[] }>(`/posts/${postId}/meanings`),
  chooseMeaning: (postId: string, emoji: string, meaning: string) => put<{ leaves: MeaningLeaf[] }>(`/posts/${postId}/meanings`, { emoji, meaning }),
  removeMeaning: (postId: string, emoji: string) => request<{ leaves: MeaningLeaf[] }>('DELETE', `/posts/${postId}/meanings/${emoji}`),
  declineAward: (id: string) => post<{ declined: true }>(`/me/awards/${id}/decline`),
  communities: () => get<{ mine: Community | null; choices: Community[] }>('/communities'),
  chooseCommunity: (slug: string) => post<{ community: Community }>('/me/community', { slug }),
  sendFeedback: (input: { kind: 'bug' | 'idea' | 'other'; body: string; platform?: string; appVersion?: string }) =>
    post<{ id: string }>('/feedback', input),
  deleteAccount: () => request<{ deleted: true }>('DELETE', '/me', { confirm: 'DELETE' }),
  updateMe: (patch: Record<string, unknown>) => request<{ profile: Profile }>('PATCH', '/me', patch),
  exportMyData: () => request<{ exportedAt: string } & Record<string, unknown>>('GET', '/me/export'),
  /** Page 0 is saved for offline reading; when offline it comes back with `savedAt`. */
  feed: (page = 0, filter: 'all' | 'testimonies' = 'all'): Promise<FeedPage & { savedAt?: number }> =>
    filter === 'testimonies'
      ? get<FeedPage>(`/feed?page=${page}&filter=testimonies`)
      : page === 0
        ? cachedGet<FeedPage>('feed', '/feed?page=0')
        : get<FeedPage>(`/feed?page=${page}`),
  /** Offline, a request saved with the feed still opens (with `savedAt`). */
  post: async (id: string): Promise<{ post: Card; savedAt?: number }> => {
    try {
      return await get<{ post: Card }>(`/posts/${id}`);
    } catch (e) {
      if (!isOffline(e)) throw e;
      const saved = await readCached<FeedPage>('feed');
      const card = saved?.value.posts.find((p) => p.id === id);
      if (!saved || !card) throw e;
      return { post: card, savedAt: saved.savedAt };
    }
  },
  createPost: (input: NewPost) => post<{ post: Card; harm?: HarmNote | null }>('/posts', input),
  /** Text-only posts made offline wait in the queue. */
  createPostOrQueue: (input: NewPost) => postOrQueue<{ post: Card; harm?: HarmNote | null }>('/posts', input, 'Your post'),
  deletePost: (id: string) => request<{ deleted: true }>('DELETE', `/posts/${id}`),
  deleteComment: (id: string) => request<{ deleted: true }>('DELETE', `/comments/${id}`),
  hidePost: (id: string) => put<{ hidden: boolean }>(`/posts/${id}/hide`),
  unhidePost: (id: string) => request<{ hidden: boolean }>('DELETE', `/posts/${id}/hide`),
  answeredStory: (id: string, body: string) => post<{ post: Card; crisis: boolean }>(`/posts/${id}/answered-story`, { body }),
  markAnswered: (id: string, testimony?: string) => post<{ post: Card; crisis: boolean }>(`/posts/${id}/answered`, testimony ? { testimony } : {}),
  setTestimony: (id: string, body: string) => put<{ post: Card; crisis: boolean }>(`/posts/${id}/testimony`, { body }),
  removeTestimony: (id: string) => request<{ post: Card }>('DELETE', `/posts/${id}/testimony`),
  comments: (id: string) => get<{ comments: Comment[] }>(`/posts/${id}/comments`),
  addComment: (id: string, body: string, opts: { parentId?: string; isUpdate?: boolean } = {}) =>
    post<{ comment: { id: string; crisis: boolean; harm?: HarmNote | null }; coolDown?: boolean }>(`/posts/${id}/comments`, { body, ...opts }),
  prayers: (id: string) =>
    get<{ count: number; people: { id: string | null; displayName: string; lastPrayedAt: string }[] }>(`/posts/${id}/prayers`),
  prayingNow: (id: string) => postOrQueue<{ eventId: string; integrityText: string }>(`/posts/${id}/praying-now`, {}, 'Praying Now'),
  commit: (id: string, input: { frequency: Frequency; vowText: string; durationDays?: number }) =>
    post<{ commitment: Commitment }>(`/posts/${id}/commitments`, input),
  encourage: (id: string, note: string) => post(`/posts/${id}/reactions`, { kind: 'encouragement', note }),
  wellWishes: (id: string) => post(`/posts/${id}/reactions`, { kind: 'well_wishes' }),
  share: (id: string, note?: string) => post(`/posts/${id}/reactions`, { kind: 'share', note }),
  boost: (id: string, amount: number, idempotencyKey: string) => post(`/posts/${id}/boost`, { amount, idempotencyKey }),
  commitments: () => get<{ commitments: Commitment[]; note: string }>('/me/commitments'),
  review: () => get<WeeklyReview>('/me/commitments/review'),
  checkIn: (id: string) => post<{ commitment: Commitment }>(`/commitments/${id}/check-in`),
  snooze: (id: string, minutes: number) => post<{ commitment: Commitment }>(`/commitments/${id}/snooze`, { minutes }),
  notifications: () => get<{ notifications: AppNotification[] }>('/me/notifications'),
  markRead: (ids: string[]) => post('/me/notifications/read', { ids }),
  prompt: () => get<{ prompt: Prompt | null }>('/me/prompt'),
  answerPrompt: (id: string, response: 'prayed' | 'dismissed' | 'snoozed') =>
    post<{ recorded: boolean }>(`/me/prompts/${id}/response`, { response }),
  tier: () => get<TierStatus>('/me/tier'),
  tokens: () => get<TokenSummary>('/me/tokens'),
  sendRadioPrayer: (postId: string, amplify = false) =>
    post<{ radioPrayer: { id: string; status: string; repeats: number } }>(`/posts/${postId}/radio`, {
      idempotencyKey: `radio-${postId}-${Date.now()}`,
      amplify,
    }),
  myBranch: () => get<{ posts: Card[] }>('/me/branch'),
  feedThemes: () => get<FeedThemeChoices>('/me/feed-themes'),
  myThemeProposals: () => get<{ proposals: ThemeProposal[] }>('/me/theme-proposals'),
  proposeTheme: (input: { name: string; description: string; layout: MakerLayout; tokens: Record<string, string | number | boolean> }) =>
    post<{ proposal: ThemeProposal }>('/me/theme-proposals', input),
  chooseFeedTheme: (slug: string | null) => put<FeedThemeChoices>('/me/feed-theme', { slug }),
  skinGallery: () => get<{ skins: GallerySkin[] }>('/skins/gallery'),
  likeSkin: (slug: string, on: boolean) => request<{ skins: GallerySkin[] }>(on ? 'PUT' : 'DELETE', `/skins/${encodeURIComponent(slug)}/like`),
  mediaUploadUrl: (contentType: string) =>
    post<{ path: string; token: string; signedUrl: string }>('/media/upload-url', { contentType }),
  person: (id: string) => get<{ person: Person; posts: Card[] }>(`/people/${id}`),
  follow: (id: string) => put<{ ok: boolean }>(`/people/${id}/follow`),
  unfollow: (id: string) => request<{ ok: boolean }>('DELETE', `/people/${id}/follow`),
  editCommitment: (
    id: string,
    patch: Partial<{ frequency: Frequency; vowText: string; status: 'active' | 'completed' | 'cancelled'; completedCount: number }>,
  ) => request<{ commitment: Commitment }>('PATCH', `/commitments/${id}`, patch),
  connections: () => get<{ people: { id: string; display_name: string; handle: string | null }[] }>('/me/connections'),
  askToPray: (postId: string, recipientIds: string[], note?: string) =>
    post<{ sent: number }>(`/posts/${postId}/ask`, { recipientIds, note: note || undefined }),
  thankEveryone: (postId: string, message?: string) =>
    post<{ sent: number }>(`/posts/${postId}/thanks`, { message: message || undefined }),
  report: (targetType: 'post' | 'comment' | 'message' | 'event' | 'spoken_prayer', targetId: string, reason: string) =>
    post<{ reportId: string }>('/reports', { targetType, targetId, reason }),
  moderationQueue: () => get<{ items: ModerationItem[] }>('/moderation/queue'),
  escalate: (itemId: string, note: string) => post<unknown>(`/moderation/items/${itemId}/escalate`, { note }),
  decide: (itemId: string, decision: { action: 'dismiss' | 'remove'; suspendDays?: number; note?: string; rule?: ModerationRule }) =>
    post<{ ok: boolean }>(`/moderation/items/${itemId}/decision`, decision),
  /** Would this text likely break the rules? Used to warn before posting; never blocks. */
  precheck: (text: string, context?: 'lament' | 'lamentReply') => post<Precheck>('/moderation/precheck', { text, context }).catch((): Precheck => ({ warn: false })),
  setLament: (id: string, patch: { lament?: boolean; radio?: boolean }) => request<{ lament: boolean; lamentRadio: boolean }>('PUT', `/posts/${id}/lament`, patch),
  appeal: (itemId: string, message: string) => post<{ appealId: string }>(`/moderation/items/${itemId}/appeal`, { message }),
  appeals: () => get<{ appeals: Appeal[] }>('/moderation/appeals'),
  decideAppeal: (id: string, action: 'uphold' | 'overturn', note?: string) =>
    post<{ ok: boolean }>(`/moderation/appeals/${id}/decision`, { action, note: note || undefined }),
  registerPushToken: (token: string, platform: string) => post('/me/push-tokens', { token, platform }),
  admin: {
    communities: () => get<{ communities: Community[] }>('/admin/communities'),
    awardSettings: () => get<{ settings: AwardSettings }>('/admin/award-settings'),
    updateAwardSettings: (patch: Partial<{ enabled: boolean; winners: number; tokenPrize: number; priestlyPrize: number; prizeNote: string; publicHall: boolean }>) =>
      request<{ settings: AwardSettings }>('PATCH', '/admin/award-settings', patch),
    awardYear: (year: number) =>
      get<{ year: number; awards: Award[]; standings: { rank: number; userId: string; name: string; prayers: number; checkins: number; peoplePrayedFor: number }[] }>(`/admin/awards/${year}`),
    selectAwards: (year: number) => post<{ year: number; awards: Award[] }>(`/admin/awards/${year}/select`),
    liveSettings: () => get<{ settings: LiveSettings }>('/admin/live-settings'),
    updateLiveSettings: (patch: { enabled?: boolean; jitsiUrl?: string; maxMinutes?: number }) =>
      request<{ settings: LiveSettings }>('PATCH', '/admin/live-settings', patch),
    aiSettings: () => get<{ settings: AiSettings; aiConnected: boolean }>('/admin/ai-settings'),
    updateAiSettings: (patch: { chatDailyLimit?: number; facilitatorEnabled?: boolean; facilitatorDailyLimit?: number; autoPrayEnabled?: boolean; autoPrayPerDay?: number; autoPrayDailyLimit?: number; autoPrayDays?: number }) =>
      request<{ settings: AiSettings; aiConnected: boolean }>('PATCH', '/admin/ai-settings', patch),
    futureSettings: () => get<{ settings: { ai_chat_enabled: boolean; ai_chat_warning: string } }>('/admin/future-settings'),
    updateFutureSettings: (patch: { aiChatEnabled?: boolean; aiChatWarning?: string }) =>
      request<{ settings: { ai_chat_enabled: boolean; ai_chat_warning: string } }>('PATCH', '/admin/future-settings', patch),
    spokenPrayerSettings: () => get<{ settings: SpokenPrayerSettings }>('/admin/spoken-prayers'),
    updateSpokenPrayerSettings: (patch: { enabled?: boolean; maxSeconds?: number; maxOfferTokens?: number }) =>
      request<{ settings: SpokenPrayerSettings }>('PATCH', '/admin/spoken-prayers', patch),
    updateCommunity: (slug: string, patch: { name?: string; status?: 'active' | 'hidden'; enabledPostTypes?: string[]; wording?: 'faith' | 'neutral'; hiddenFeatures?: CommunityFeature[] }) =>
      request<{ community: Community }>('PATCH', `/admin/communities/${slug}`, patch),
    createCommunity: (c: { slug: string; name: string; tradition: string; wording: 'faith' | 'neutral'; operatorName?: string | null; operatorContact?: string | null }) =>
      post<{ community: Community }>('/admin/communities', c),
    deletionRequests: () =>
      get<{ requests: { id: string; email: string; note: string | null; createdAt: string; accountFound: boolean }[] }>('/admin/deletion-requests'),
    prayerWarriors: (days = 365) =>
      get<{ standings: { rank: number; userId: string; name: string; prayers: number; checkins: number; peoplePrayedFor: number }[] }>(
        `/admin/prayer-warriors?days=${days}`,
      ),
    feedback: (f: { status?: 'open' | 'closed' | 'all'; tag?: FeedbackTag } = {}) =>
      get<{ feedback: FeedbackItem[] }>(`/admin/feedback?${new URLSearchParams({ status: f.status ?? 'open', ...(f.tag ? { tag: f.tag } : {}) })}`),
    triageFeedback: (id: string, t: { tags?: FeedbackTag[]; severity?: FeedbackSeverity | null; note?: string | null }) =>
      request<{ ok: true }>('PATCH', `/admin/feedback/${id}`, t),
    feedbackCsv: (f: { status?: 'open' | 'closed' | 'all'; tag?: FeedbackTag } = {}) =>
      getText(`/admin/feedback/export?${new URLSearchParams({ status: f.status ?? 'all', ...(f.tag ? { tag: f.tag } : {}) })}`),
    closeFeedback: (id: string) => post<{ ok: true }>(`/admin/feedback/${id}/close`),
    decideDeletionRequest: (id: string, action: 'delete' | 'dismiss') => post<{ ok: true }>(`/admin/deletion-requests/${id}`, { action }),
    milestones: () => get<{ rules: MilestoneRule[] }>('/admin/milestones'),
    addMilestone: (input: Pick<MilestoneRule, 'label' | 'metric' | 'threshold' | 'amount'>) =>
      post<{ rule: MilestoneRule }>('/admin/milestones', input),
    updateMilestone: (id: string, patch: Partial<Pick<MilestoneRule, 'label' | 'threshold' | 'amount' | 'enabled'>>) =>
      request<{ rule: MilestoneRule }>('PATCH', `/admin/milestones/${id}`, patch),
    metrics: (days: number) => get<Record<string, Record<string, number | string | null>>>(`/admin/metrics?days=${days}`),
    tokenSettings: () => get<{ settings: AdminTokenSettings }>('/admin/token-settings'),
    updateTokenSettings: (
      patch: Partial<{ priestlyPrayersPerToken: number; verifiedPrayerMinGapSeconds: number; radioPrayerCost: number; radioFunding: 'tokens' | 'free'; verifiedPrayersPerDay: number; amplifyPaidCost: number | null }>,
    ) => request<{ settings: AdminTokenSettings }>('PATCH', '/admin/token-settings', patch),
    pilotReport: (weeks: number) => get<{ weeks: PilotWeek[] }>(`/admin/pilot-report?weeks=${weeks}`),
    pilotCsv: (weeks: number) => getText(`/admin/pilot-report?weeks=${weeks}&format=csv`),
    ledgerChecks: () => get<{ checks: LedgerCheck[] }>('/admin/ledger-checks'),
    runLedgerCheck: () => post<{ check: LedgerCheck }>('/admin/ledger-checks'),
    importCsv: (input: { kind: 'members' | 'requests'; csv: string; dryRun: boolean; note?: string; sendEmails?: boolean; message?: string }) =>
      post<ImportResult>('/admin/import', input),
    jobs: () => get<{ failed: FailedJob[]; retrying: RetryingTask[] }>('/admin/jobs'),
    ops: () => get<{ status: OpsStatus }>('/admin/ops'),
    retryJob: (id: string) => post<{ retried: boolean }>(`/admin/jobs/${id}/retry`),
    discardJob: (id: string) => post<{ discarded: boolean }>(`/admin/jobs/${id}/discard`),
    announcements: () => get<{ announcements: (Announcement & { active: boolean; dismissals: number })[] }>('/admin/announcements'),
    createAnnouncement: (input: { kind: 'banner' | 'notice'; title: string; body?: string; titleEs?: string; bodyEs?: string; durationHours?: number | null }) =>
      post<{ announcement: Announcement }>('/admin/announcements', input),
    endAnnouncement: (id: string) => post<{ announcement: Announcement }>(`/admin/announcements/${id}/end`),
    materialMatch: () =>
      get<{ settings: { enabled: boolean; centsPerToken: number }; owed: { count: number; cents: number; since: string | null }; fulfilled: { count: number; cents: number } }>(
        '/admin/material-match',
      ),
    updateMaterialMatch: (patch: { enabled?: boolean; centsPerToken?: number }) => request<{ settings: { enabled: boolean; centsPerToken: number } }>('PATCH', '/admin/material-match', patch),
    fulfillMaterialMatch: (input: { helpKind: string; publicNote?: string }) => post<{ fulfilled: number; cents: number }>('/admin/material-match/fulfill', input),
    podcasts: () => get<{ enabled: boolean; shows: PodcastShow[] }>('/admin/podcasts'),
    waitlist: () => get<{ enabled: boolean; entries: WaitlistEntry[] }>('/admin/waitlist'),
    inviteFromWaitlist: (id: string) => post<{ email: string; invite: { code: string } }>(`/admin/waitlist/${id}/invite`),
    removeFromWaitlist: (id: string) => request<{ ok: true }>('DELETE', `/admin/waitlist/${id}`),
    createPodcast: (input: { slug: string; title: string; description: string; author: string; imageUrl?: string | null; community?: string | null }) =>
      post<{ show: PodcastShow }>('/admin/podcasts', input),
    updatePodcast: (id: string, patch: { published?: boolean }) => request<{ show: PodcastShow }>('PATCH', `/admin/podcasts/${id}`, patch),
    addEpisode: (id: string, input: { title: string; description?: string; audioUrl: string; durationSeconds?: number | null; publish?: boolean }) =>
      post<{ show: PodcastShow }>(`/admin/podcasts/${id}/episodes`, input),
    updateEpisode: (id: string, patch: { published?: boolean }) => request<{ show: PodcastShow }>('PATCH', `/admin/podcast-episodes/${id}`, patch),
    removeEpisode: (id: string) => request<{ show: PodcastShow }>('DELETE', `/admin/podcast-episodes/${id}`),
    legalSettings: () => get<{ settings: { enabled: boolean; defaultHoldDays: number } }>('/admin/legal/settings'),
    updateLegalSettings: (patch: { enabled?: boolean; defaultHoldDays?: number }) =>
      request<{ settings: { enabled: boolean; defaultHoldDays: number } }>('PATCH', '/admin/legal/settings', patch),
    legalCases: () => get<{ cases: LegalCase[] }>('/admin/legal/cases'),
    legalCase: (id: string) => get<LegalCaseDetail>(`/admin/legal/cases/${id}`),
    createLegalCase: (input: { kind: LegalCase['kind']; agency?: string | null; reference?: string | null; subject?: string | null; summary: string }) =>
      post<LegalCaseDetail>('/admin/legal/cases', input),
    addLegalNote: (id: string, body: string) => post<LegalCaseDetail>(`/admin/legal/cases/${id}/notes`, { body }),
    closeLegalCase: (id: string) => post<LegalCaseDetail>(`/admin/legal/cases/${id}/close`),
    placeHold: (id: string, input: { member?: string; days?: number } = {}) => post<LegalCaseDetail>(`/admin/legal/cases/${id}/holds`, input),
    refreshHold: (id: string) => post<LegalCaseDetail>(`/admin/legal/holds/${id}/refresh`),
    releaseHold: (id: string) => post<LegalCaseDetail>(`/admin/legal/holds/${id}/release`),
    exportHold: (id: string) => getText(`/admin/legal/holds/${id}/export`),
    surveys: () => get<{ surveys: (Survey & { responses: number })[] }>('/admin/surveys'),
    createSurvey: (input: { title: string; intro?: string | null; anonymous?: boolean; community?: string | null; questions: NewSurveyQuestion[] }) =>
      post<{ survey: Survey }>('/admin/surveys', input),
    setSurveyStatus: (id: string, status: Survey['status']) => request<{ survey: Survey }>('PATCH', `/admin/surveys/${id}`, { status }),
    deleteSurvey: (id: string) => request<{ ok: true }>('DELETE', `/admin/surveys/${id}`),
    surveyResults: (id: string) => get<SurveyResults>(`/admin/surveys/${id}/results`),
    invites: () => get<{ inviteOnly: boolean; invites: Invite[] }>('/admin/invites'),
    createInvites: (input: { note?: string; community?: string; maxUses?: number; expiresInDays?: number | null; count?: number }) =>
      post<{ invites: Invite[] }>('/admin/invites', input),
    revokeInvite: (code: string) => post<{ invite: Invite }>(`/admin/invites/${encodeURIComponent(code)}/revoke`, {}),
    emailInvite: (code: string, input: { email: string; language?: 'en' | 'es'; message?: string }) =>
      post<{ sent: boolean; language: 'en' | 'es' }>(`/admin/invites/${encodeURIComponent(code)}/email`, input),
    setInviteOnly: (inviteOnly: boolean) => request<{ inviteOnly: boolean }>('PATCH', '/admin/invite-settings', { inviteOnly }),
    auditLog: (q: { before?: string; limit?: number } = {}) =>
      get<{ entries: AuditEntry[] }>(`/admin/audit-log?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))}`),
    pilotHtml: (weeks: number, lang: 'en' | 'es') => getText(`/admin/pilot-report?weeks=${weeks}&format=html&lang=${lang}`),
    radioSettings: () => get<{ settings: AdminRadioSettings }>('/admin/radio-settings'),
    radioBursts: () => get<{ bursts: StationBurst[] }>('/admin/radio-bursts'),
    radioAlerts: () => get<StationAlerts>('/admin/radio-alerts'),
    radioHealth: () => get<StationHealth>('/admin/radio-health'),
    radioSchedule: () => get<{ schedule: RadioSchedule; onAirNow: boolean }>('/admin/radio-schedule'),
    updateRadioSchedule: (patch: Partial<RadioSchedule>) => request<{ schedule: RadioSchedule; onAirNow: boolean }>('PATCH', '/admin/radio-schedule', patch),
    operatorLog: () => get<{ enabled: boolean }>('/admin/operator-log'),
    setOperatorLog: (enabled: boolean) => request<{ enabled: boolean }>('PATCH', '/admin/operator-log', { enabled }),
    operatorLogCsv: () => getText('/admin/operator-log?format=csv'),
    radioFollowups: () => get<{ thanksgiving: boolean; prayingToo: boolean }>('/admin/radio-followups'),
    setRadioFollowups: (patch: { thanksgiving?: boolean; prayingToo?: boolean }) => request<{ thanksgiving: boolean; prayingToo: boolean }>('PATCH', '/admin/radio-followups', patch),
    listenerMode: () => get<{ enabled: boolean; active: boolean }>('/admin/listener-mode'),
    setListenerMode: (enabled: boolean) => request<{ enabled: boolean; active: boolean }>('PATCH', '/admin/listener-mode', { enabled }),
    updateRadioHealth: (patch: { enabled?: boolean; acks?: Partial<{ enabled: boolean; timeoutMinutes: number; maxRetries: number }> }) => request<StationHealth>('PATCH', '/admin/radio-health', patch),
    radioNodes: () => get<RadioNodes>('/admin/radio-nodes'),
    radioSetup: () => get<RadioSetup>('/admin/radio-setup'),
    updateRadioSetup: (patch: { enabled?: boolean; choice?: RadioSetupChoice }) => request<RadioSetup>('PATCH', '/admin/radio-setup', patch),
    requestSetupTest: (kind: RadioSetupTest['kind'], seconds?: number) => request<{ test: RadioSetupTest }>('POST', '/admin/radio-setup/tests', { kind, ...(seconds ? { seconds } : {}) }),
    confirmSetupTest: (id: string) => request<{ test: RadioSetupTest }>('POST', `/admin/radio-setup/tests/${id}/confirm`),
    radioCoverage: () => get<RadioCoverage>('/admin/radio-coverage'),
    updateRadioCoverage: (patch: { enabled?: boolean; tileUrl?: string; station?: { lat: number; lon: number } | null }) => request<RadioCoverage>('PATCH', '/admin/radio-coverage', patch),
    placeRadioNode: (id: string, location: { lat: number; lon: number; place?: string } | null) => request<RadioCoverage>('PUT', `/admin/radio-nodes/${id}/location`, { location }),
    radioPacket: () => get<{ enabled: boolean }>('/admin/radio-packet'),
    setRadioPacket: (enabled: boolean) => request<{ enabled: boolean }>('PATCH', '/admin/radio-packet', { enabled }),
    radioDigest: () => get<RadioDigest>('/admin/radio-digest'),
    updateRadioDigest: (patch: { enabled?: boolean; email?: boolean }) => request<RadioDigest>('PATCH', '/admin/radio-digest', patch),
    setRadioNodesEnabled: (patch: { enabled?: boolean; multiStation?: boolean; signaturesRequired?: boolean }) => request<{ enabled: boolean; multiStation: boolean; signaturesRequired: boolean }>('PATCH', '/admin/radio-nodes', patch),
    addRadioNode: (name: string, role: RadioNode['role'] = 'listener') => request<{ node: RadioNode; key: string }>('POST', '/admin/radio-nodes', { name, role }),
    updateRadioNode: (id: string, patch: { enabled: boolean }) => request<{ node: RadioNode }>('PATCH', `/admin/radio-nodes/${id}`, patch),
    removeRadioNode: (id: string) => request<{ ok: true }>('DELETE', `/admin/radio-nodes/${id}`),
    updateRadioAlerts: (patch: Partial<{ enabled: boolean; overdueMinutes: number }>) => request<StationAlerts>('PATCH', '/admin/radio-alerts', patch),
    updateRadioSettings: (patch: Partial<{ transmitter: 'log' | 'station'; stationRequiresFree: boolean; maxChars: number; amplifyRepeats: number; order: 'oldest' | 'need'; batchMax: number; listenPage: boolean; receipts: boolean; onAirPage: boolean }>) =>
      request<{ settings: AdminRadioSettings }>('PATCH', '/admin/radio-settings', patch),
    donationSettings: () => get<{ settings: AdminDonationSettings; stripeKeySet: boolean; webhookSecretSet: boolean; zeffyKeySet: boolean; zeffyWebhookSet: boolean }>('/admin/donation-settings'),
    updateDonationSettings: (
      patch: Partial<{
        enabled: boolean;
        provider: 'none' | 'stripe' | 'zeffy';
        donateUrl: string | null;
        paypalUrl: string | null;
        zeffyAmountUnit: 'cents' | 'dollars';
        everyoneMonthly: number;
        allocationRequestsEnabled: boolean;
        allocationMaxPerRequest: number;
      }>,
    ) => request<{ settings: AdminDonationSettings }>('PATCH', '/admin/donation-settings', patch),
    gifts: () => get<{ donations: AdminGift[] }>('/admin/donations'),
    refundGift: (id: string) => post<{ refunded: true }>(`/admin/donations/${id}/refund`),
    recordGift: (gift: { amountCents: number; reference: string; via: 'manual' | 'zeffy' | 'paypal'; donorId?: string | null; target?: GiftTarget }) =>
      post('/admin/donations', { ...gift, reference: gift.reference || undefined }),
    syncZeffy: () => post<{ recorded: number; refunded: number; skipped: number }>('/admin/donations/zeffy-sync'),
    securitySettings: () => get<{ settings: { two_step_enabled: boolean } }>('/admin/security-settings'),
    updateSecuritySettings: (patch: { twoStepEnabled?: boolean }) => request<{ settings: { two_step_enabled: boolean } }>('PATCH', '/admin/security-settings', patch),
    safetySettings: () => get<{ settings: AdminSafetySettings }>('/admin/safety-settings'),
    updateSafetySettings: (
      patch: Partial<{
        newMemberLimitsEnabled: boolean;
        newMemberHours: number;
        newMemberMinPrayers: number;
        newMemberPostsPerDay: number;
        newMemberCommentsPerDay: number;
        newMemberLinksAllowed: boolean;
        postsPerHour: number;
        commentsPerHour: number;
        messagesPerMinute: number;
      }>,
    ) => request<{ settings: AdminSafetySettings }>('PATCH', '/admin/safety-settings', patch),
    messagingSettings: () => get<{ settings: AdminMessagingSettings }>('/admin/messaging-settings'),
    updateMessagingSettings: (
      patch: Partial<{
        prayerMessagesEnabled: boolean;
        prayerMessagesAnyPrayer: boolean;
        directMessagesEnabled: boolean;
        directRequiresMutualFollow: boolean;
        groupsEnabled: boolean;
        requestMessageLimit: number;
        newMembersCanStart: boolean;
        newMemberMessagesPerDay: number;
        groupMaxMembers: number;
      }>,
    ) => request<{ settings: AdminMessagingSettings }>('PATCH', '/admin/messaging-settings', patch),
    careSettings: () => get<{ settings: { care_enabled: boolean; confession_enabled: boolean; max_open_per_member: number; confession_retention_days: number } }>('/admin/care-settings'),
    updateCareSettings: (patch: Partial<{ careEnabled: boolean; confessionEnabled: boolean; maxOpenPerMember: number; confessionRetentionDays: number }>) =>
      request<{ settings: { care_enabled: boolean; confession_enabled: boolean; max_open_per_member: number; confession_retention_days: number } }>('PATCH', '/admin/care-settings', patch),
    notebookSettings: () => get<{ settings: NotebookSettings }>('/admin/notebook-settings'),
    growthSettings: () => get<{ settings: GrowthSettings }>('/admin/growth-settings'),
    givingSplitSettings: () => get<{ settings: { giving_split_enabled: boolean; max_percent: number } }>('/admin/giving-split-settings'),
    updateGivingSplitSettings: (patch: { enabled?: boolean; maxPercent?: number }) =>
      request<{ settings: { giving_split_enabled: boolean; max_percent: number } }>('PATCH', '/admin/giving-split-settings', patch),
    conversationSettings: () => get<{ settings: ConversationSettings }>('/admin/conversation-settings'),
    talkCounts: () => get<{ counts: TalkCountSummary }>('/admin/talk-counts'),
    meaningProposals: () => get<{ proposals: MeaningProposalQueueItem[] }>('/admin/meaning-proposals'),
    decideMeaningProposal: (id: string, d: { approve: boolean; label?: string; neutralLabel?: string; replaces?: string }) =>
      post<{ status: 'approved' | 'declined' }>(`/admin/meaning-proposals/${id}`, d),
    highlightQueue: () => get<{ items: HighlightQueueItem[] }>('/admin/kindness-highlights'),
    pickHighlight: (id: string, pick: boolean, shownText?: string) => post<{ items: HighlightQueueItem[] }>(`/admin/kindness-highlights/${id}`, { pick, ...(shownText ? { shownText } : {}) }),
    sendHighlights: () => post<{ sent: number }>('/admin/kindness-highlights/send'),
    updateConversationSettings: (patch: Partial<{ replySuggestionsEnabled: boolean; meaningPrefsEnabled: boolean; troubleNudgeEnabled: boolean; greetingPacksEnabled: boolean; ownWordsEnabled: boolean; kindClosingsEnabled: boolean; talkCountsEnabled: boolean; meaningRowEnabled: boolean; researchPageEnabled: boolean; meaningProposalsEnabled: boolean; typePromptsEnabled: boolean }>) =>
      request<{ settings: ConversationSettings }>('PATCH', '/admin/conversation-settings', patch),
    practiceSettings: () => get<{ settings: PracticeSettings }>('/admin/practice-settings'),
    updatePracticeSettings: (patch: Partial<{ followupEnabled: boolean; followupDays: number; gratitudeEnabled: boolean; gentleRhythmEnabled: boolean; encouragerEnabled: boolean; encouragerDays: number; newcomerDays: number; rememberedEnabled: boolean; welcomeCardEnabled: boolean; welcomeText: string; askKindlyEnabled: boolean; mendEnabled: boolean; liftUpEnabled: boolean; gratitudeCountEnabled: boolean; believeEnabled: boolean; partnersEnabled: boolean; partnerDays: number; highlightsEnabled: boolean; coolDownEnabled: boolean; lamentEnabled: boolean; answeredStoriesEnabled: boolean; kindnessIntroEnabled: boolean; checkBackEnabled: boolean; kindMilestonesEnabled: boolean }>) =>
      request<{ settings: PracticeSettings }>('PATCH', '/admin/practice-settings', patch),
    skinSettings: () => get<{ settings: SkinSettings }>('/admin/skin-settings'),
    updateSkinSettings: (patch: Partial<{ skinsEnabled: boolean; commentTreeEnabled: boolean; commentTreeLeaves: number; commentTreeMaxDepth: number; proposalsEnabled: boolean; videoMaxSeconds: number; seasonalEnabled: boolean; seasonalAuto: boolean; galleryEnabled: boolean }>) =>
      request<{ settings: SkinSettings }>('PATCH', '/admin/skin-settings', patch),
    themeProposals: () => get<{ proposals: ThemeProposal[] }>('/admin/theme-proposals'),
    approveThemeProposal: (id: string, note?: string) => post<{ id: string; status: 'approved'; themeSlug: string }>(`/admin/theme-proposals/${id}/approve`, note ? { note } : {}),
    declineThemeProposal: (id: string, note?: string) => post<{ id: string; status: 'declined' }>(`/admin/theme-proposals/${id}/decline`, note ? { note } : {}),
    updateGrowthSettings: (patch: Partial<{ guestPrayerEnabled: boolean; prayerChainEnabled: boolean; prayerChainMax: number; prayedForWidgetEnabled: boolean; prayerMinuteEnabled: boolean; shareConsentEnabled: boolean; prayedForLiveEnabled: boolean; prayerChainSmsEnabled: boolean }>) =>
      request<{ settings: GrowthSettings }>('PATCH', '/admin/growth-settings', patch),
    updateNotebookSettings: (patch: Partial<{ worldwideCountEnabled: boolean; thanksCardEnabled: boolean; thanksCardDays: number; sermonInputsEnabled: boolean; supportLabelEnabled: boolean; witnessStoriesEnabled: boolean; pressureRuleEnabled: boolean; promisePageEnabled: boolean; podcastsEnabled: boolean; misleadingRuleEnabled: boolean; automationRuleEnabled: boolean; urgencyGlowEnabled: boolean; reactionTrayEnabled: boolean; memberTownEnabled: boolean; prizeChoiceEnabled: boolean; waitlistEnabled: boolean; crossCommunityEnabled: boolean; postLinesEnabled: boolean; tierUpkeepEnabled: boolean; tierUpkeepDays: number; checkinAffirmationEnabled: boolean; whyGiftsEnabled: boolean; poolMatchingEnabled: boolean; kindCloudEnabled: boolean; meaningReactionsEnabled: boolean; lampsEnabled: boolean; lampsPerWeek: number; poolLedgerEnabled: boolean; circleGoalsEnabled: boolean; givingAskEnabled: boolean; givingAskAfterDays: number; supportLinksEnabled: boolean; squireBoardEnabled: boolean; squireBoardDays: number; groupGiftsEnabled: boolean; prayerListEnabled: boolean; readingPlanEnabled: boolean }>) =>
      request<{ settings: NotebookSettings }>('PATCH', '/admin/notebook-settings', patch),
    eventSettings: () => get<{ settings: { events_enabled: boolean; new_members_can_host: boolean; allowed_video_hosts: string[]; reminder_minutes: number } }>('/admin/event-settings'),
    updateEventSettings: (patch: Partial<{ eventsEnabled: boolean; newMembersCanHost: boolean; allowedVideoHosts: string[]; reminderMinutes: number }>) =>
      request<{ settings: { events_enabled: boolean; new_members_can_host: boolean; allowed_video_hosts: string[]; reminder_minutes: number } }>('PATCH', '/admin/event-settings', patch),
    promptSettings: () =>
      get<{ defaultTone: 'gentle' | 'firm'; results: { tone: 'gentle' | 'firm'; shown: number; prayed: number }[] }>('/admin/prompt-settings'),
    setDefaultTone: (defaultTone: 'gentle' | 'firm') => request<{ defaultTone: 'gentle' | 'firm' }>('PATCH', '/admin/prompt-settings', { defaultTone }),
    tiers: () => get<{ tiers: AdminTier[] }>('/admin/tiers'),
    updateTier: (tier: string, patch: { minPrayerEvents?: number | null; weeklyAllotment?: number | null }) =>
      request<{ tier: AdminTier }>('PATCH', `/admin/tiers/${tier}`, patch),
    people: (q: string) => get<{ people: AdminPerson[] }>(`/admin/people?q=${encodeURIComponent(q)}`),
    grant: (id: string, role: Role) => put<{ roles: Role[] }>(`/admin/people/${id}/roles/${role}`),
    revoke: (id: string, role: Role) => request<{ roles: Role[] }>('DELETE', `/admin/people/${id}/roles/${role}`),
  },
  powerPrayerStatus: () => get<PowerPrayerStatus>('/me/power-prayer'),
  powerPrayer: (postId: string) =>
    post<{ powerPrayer: { id: string; cost: number; reached: number }; next: PowerPrayerStatus; balance: number }>(`/posts/${postId}/power-prayer`, {
      idempotencyKey: `power-${postId}-${Date.now()}`,
    }),
  tokenPools: (postId?: string) => get<{ pools: TokenPool[] }>(postId ? `/token-pools?postId=${postId}` : '/token-pools'),
  poolLedger: () =>
    get<
      | { enabled: false }
      | { enabled: true; given: number; givers: number; matched: number; reachedRequests: number; reachedLast30Days: number; requestsHelped: number; returned: number; openPools: number }
    >('/token-pools/ledger'),
  myTokenPools: () => get<{ pools: TokenPool[] }>('/me/token-pools'),
  createTokenPool: (input: { name: string; purpose: string; realm: string | null; drawAmount: number; showDonor: boolean; amount: number; matchRatio?: number; matchCap?: number; matchMode?: 'ratio' | 'quadratic' }) =>
    post<{ id: string; balance: number }>('/token-pools', { ...input, idempotencyKey: `pool-${Date.now()}` }),
  circleGoal: (postId: string) => get<CircleGoal>(`/posts/${postId}/circle-goal`),
  setCircleGoal: (postId: string, target: number, days: number) => request<CircleGoal>('PUT', `/posts/${postId}/circle-goal`, { target, days }),
  removeCircleGoal: (postId: string) => request<CircleGoal>('DELETE', `/posts/${postId}/circle-goal`),
  squireBoard: () => get<SquireBoard>('/squire-board'),
  setSquireBoard: (on: boolean) => request<SquireBoard>('PUT', '/me/squire-board', { public: on }),
  groupGiftInfo: (target: 'group' | 'event', id: string) => get<{ enabled: false } | { enabled: true; recipients: number }>(`/${target}s/${id}/gift`),
  giveToGroup: (target: 'group' | 'event', id: string, amount: number) =>
    post<{ recipients: number; each: number; given: number; balance: number }>(`/${target}s/${id}/gift`, { amount, idempotencyKey: `${target}-gift-${id}-${Date.now()}` }),
  prayerList: () => get<PrayerList>('/me/prayer-list'),
  addToPrayerList: (input: { name: string; note?: string; remind: 'off' | 'daily' | 'weekly'; hour: number; tzOffsetMinutes: number }) => post<PrayerList>('/me/prayer-list', input),
  editPrayerListItem: (id: string, input: Partial<{ name: string; note: string; remind: 'off' | 'daily' | 'weekly'; hour: number; tzOffsetMinutes: number }>) =>
    request<PrayerList>('PATCH', `/me/prayer-list/${id}`, input),
  removePrayerListItem: (id: string) => request<PrayerList>('DELETE', `/me/prayer-list/${id}`),
  prayedForListItem: (id: string) => post<PrayerList>(`/me/prayer-list/${id}/prayed`, {}),
  readingPlan: () => get<ReadingPlanToday>('/reading-plan'),
  markReadingRead: (planId: string) => post<ReadingPlanToday>(`/reading-plan/${planId}/read`, {}),
  staffReadingPlans: () => get<{ plans: StaffReadingPlan[] }>('/staff/reading-plans'),
  createReadingPlan: (input: { title: string; startsOn: string; references: string[]; conversationId?: string | null }) => post<{ id: string }>('/staff/reading-plans', input),
  archiveReadingPlan: (planId: string) => post<{ archived: true }>(`/staff/reading-plans/${planId}/archive`, {}),
  lamps: (personId: string) => get<Lamps>(`/people/${personId}/lamps`),
  giveLamp: (personId: string, note: string) => post<{ id: string }>(`/people/${personId}/lamps`, { note }),
  aiPrayers: (postId: string) => get<AiPrayers>(`/posts/${postId}/ai-prayers`),
  setAutoPray: (postId: string, on: boolean) => request<AiPrayers>('PUT', `/posts/${postId}/auto-pray`, { on }),
  fundTokenPool: (id: string, amount: number) => post<{ matched: number; poolBalance: number; balance: number }>(`/token-pools/${id}/fund`, { amount, idempotencyKey: `fund-${id}-${Date.now()}` }),
  closeTokenPool: (id: string) => post(`/token-pools/${id}/close`, {}),
  drawFromPool: (id: string, postId: string) => post<{ amount: number; reach: number }>(`/token-pools/${id}/draw`, { postId }),
  scheduleSpend: (postId: string, input: { amount: number; runAt: string; repeatWeeks: number }) =>
    post<{ schedule: ScheduledSpend }>(`/posts/${postId}/scheduled-spends`, input),
  scheduledSpends: () => get<{ schedules: ScheduledSpend[] }>('/me/scheduled-spends'),
  cancelScheduledSpend: (id: string) => request<{ ok: true }>('DELETE', `/scheduled-spends/${id}`),
  macroNeeds: () => get<{ needs: MacroNeed[] }>('/macro-needs'),
  createMacroNeed: (input: { title: string; body: string; helpOptions: { label: string; url: string }[] }) =>
    post<{ id: string; postId: string }>('/macro-needs', input),
  endMacroNeed: (id: string) => post(`/macro-needs/${id}/end`, {}),
  helpedMacroNeed: (id: string) => post<{ helpers: number }>(`/macro-needs/${id}/helped`, {}),
  prayerCast: () => get<PrayerCast>('/prayer-cast'),
  radioListen: () => get<{ enabled: boolean; receipts: boolean; prayingToo?: boolean }>('/radio/listen'),
  listenConfig: () => get<{ enabled: boolean; receipts: boolean; prayingToo?: boolean }>('/listen/config'),
  listenPraying: (report: { callSign: string; hashes: string[] }) => post<{ matched: number }>('/listen/praying', report),
  /** "On the air" receipts: fingerprints of prayers heard on the Listen screen, never the words. */
  listenHeard: (report: { callSign: string; preset: string; snrDb: number; hashes: string[] }) => post<{ matched: number }>('/listen/heard', report),
  highlights: () => get<Highlights>('/highlights'),
  conversations: () => get<{ conversations: ConversationSummary[] }>('/me/conversations'),
  conversation: (id: string, before?: string) => get<ConversationView>(`/conversations/${id}${before ? `?before=${before}` : ''}`),
  sendMessage: (id: string, body: string) => post<{ message: Pick<ChatMessage, 'id' | 'createdAt' | 'crisis'>; coolDown?: boolean }>(`/conversations/${id}/messages`, { body }),
  meaningProposals: () => get<{ proposals: MeaningProposal[] }>('/me/meaning-proposals'),
  proposeMeaning: (emoji: string, label: string) => post<{ proposals: MeaningProposal[] }>('/me/meaning-proposals', { emoji, label }),
  kindnessResearch: () => get<{ counts: TalkCountSummary }>('/kindness-research'),
  coolDown: () => get<{ coolDown: { id: string; line: number } | null }>('/me/cool-down'),
  coolDownDone: (id: string, choice: 'breather' | 'okay') => post<{ ok: true }>(`/me/cool-down/${id}`, { choice }),
  messageRequester: (postId: string, body: string, isAnonymous = false) =>
    post<{ conversationId: string; message: { crisis: boolean } }>(`/posts/${postId}/messages`, { body, isAnonymous }),
  messagePerson: (userId: string, body: string) =>
    post<{ conversationId: string; message: { crisis: boolean } }>('/conversations/direct', { userId, body }),
  createGroup: (input: { title: string; topic?: string; isPublic: boolean; memberIds: string[] }) =>
    post<{ conversationId: string; invited: number }>('/conversations/groups', input),
  groups: () => get<{ groups: PublicGroup[] }>('/groups'),
  joinGroup: (id: string) => post(`/conversations/${id}/join`),
  inviteToGroup: (id: string, userIds: string[]) => post<{ invited: number }>(`/conversations/${id}/invite`, { userIds }),
  acceptConversation: (id: string) => post(`/conversations/${id}/accept`),
  leaveConversation: (id: string) => post(`/conversations/${id}/decline`),
  markConversationRead: (id: string) => post(`/conversations/${id}/read`),
  events: (groupId?: string) => get<{ events: PrayerEvent[] }>(groupId ? `/events?groupId=${groupId}` : '/events'),
  myEvents: () => get<{ events: PrayerEvent[] }>('/me/events'),
  event: (id: string) => get<{ event: PrayerEvent }>(`/events/${id}`),
  createEvent: (input: {
    kind: EventKind;
    title: string;
    description?: string;
    startsAt: string;
    durationMinutes?: number;
    videoUrl?: string;
    location?: string;
    groupId?: string;
  }) => post<{ event: PrayerEvent }>('/events', input),
  rsvp: (id: string, status: 'going' | 'maybe') => put<{ event: PrayerEvent }>(`/events/${id}/rsvp`, { status }),
  unrsvp: (id: string) => request<{ event: PrayerEvent }>('DELETE', `/events/${id}/rsvp`),
  cancelEvent: (id: string) => post(`/events/${id}/cancel`),
  care: () => get<{ enabled: boolean; kinds: CareKind[]; confessionRetentionDays?: number }>('/care'),
  myCareRequests: () => get<{ requests: CareRequest[] }>('/me/care-requests'),
  askForCare: (kind: CareKind, body: string) => post<{ id: string; crisis: boolean }>('/care-requests', { kind, body }),
  careQueue: () => get<{ requests: CareQueueItem[] }>('/care/queue'),
  claimCare: (id: string) => post<{ conversationId: string }>(`/care-requests/${id}/claim`),
  closeCare: (id: string) => post(`/care-requests/${id}/close`),
  witnessFlag: (postId: string, note: string) => post<{ caseId: string }>(`/posts/${postId}/witness`, { note }),
  witnessCases: (status?: WitnessStatus) => get<{ cases: WitnessCase[] }>(status ? `/witness/cases?status=${status}` : '/witness/cases'),
  witnessNotes: (id: string) => get<{ notes: { id: string; body: string; helpKind: string | null; author: string; createdAt: string }[] }>(`/witness/cases/${id}/notes`),
  witnessNote: (id: string, body: string, helpKind?: string) => post(`/witness/cases/${id}/notes`, { body, helpKind }),
  witnessUpdate: (id: string, patch: { status?: WitnessStatus; assignToMe?: boolean }) => request('PATCH', `/witness/cases/${id}`, patch),
  activityFlags: () =>
    get<{ flags: { id: string; userId: string; name: string; reason: 'too_many' | 'too_regular'; details: { taps: number; gapStddevSeconds: number | null }; createdAt: string }[] }>(
      '/moderation/activity-flags',
    ),
  decideActivityFlag: (id: string, status: 'cleared' | 'confirmed') => post(`/moderation/activity-flags/${id}`, { status }),
  moderatorCare: () => get<ModeratorCare>('/moderation/care'),
  updateModeratorCare: (patch: Partial<ModeratorCare['settings']>) => request<{ settings: ModeratorCare['settings'] }>('PATCH', '/admin/moderator-care-settings', patch),
  handoff: (itemId: string, toUserId?: string, note?: string) => post<{ ok: boolean }>(`/moderation/items/${itemId}/handoff`, { toUserId, note }),
  moderationDashboard: (days = 7) => get<{ dashboard: ModerationDashboard; reports: HarmReport[] }>(`/admin/moderation-dashboard?days=${days}`),
  oncall: () => get<{ status: OncallStatus; shifts?: OncallShift[] }>('/moderation/oncall'),
  addOncallNote: (body: string) => post<{ id: string }>('/moderation/oncall/notes', { body }),
  oncallAdmin: () => get<{ settings: OncallSettings; shifts: OncallShift[]; people: { id: string; display_name: string }[] }>('/admin/oncall'),
  updateOncall: (patch: Partial<OncallSettings>) => request<{ settings: OncallSettings }>('PATCH', '/admin/oncall', patch),
  addOncallShift: (shift: { userId: string; weekday: number; startMinute: number; endMinute: number }) => post<{ id: string }>('/admin/oncall/shifts', shift),
  removeOncallShift: (id: string) => request<{ ok: boolean }>('DELETE', `/admin/oncall/shifts/${id}`),
  harmSettings: () => get<{ settings: HarmSettings }>('/admin/harm-settings'),
  updateHarmSettings: (patch: Partial<HarmSettings>) => request<{ settings: HarmSettings }>('PATCH', '/admin/harm-settings', patch),
  harmFloods: () => get<{ floods: HarmFlood[] }>('/moderation/harm-floods'),
  decideHarmFlood: (userId: string, action: 'release' | 'remove') => post<{ items: number }>(`/moderation/harm-floods/${userId}`, { action }),
  scriptureLeaves: () => get<{ leaves: { id: string; reference: string; text: string; translation: string | null }[] }>('/scripture-leaves'),
  blocks: () => get<{ blocks: { id: string; displayName: string }[] }>('/me/blocks'),
  block: (userId: string) => put(`/people/${userId}/block`),
  unblock: (userId: string) => request('DELETE', `/people/${userId}/block`),
  tokenStore: () =>
    get<{ enabled: boolean; commonFundPercent?: number; products: TokenProduct[] }>('/token-store'),
  /** A StoreKit 2 signed transaction; the server checks it with Apple before crediting. */
  buyTokens: (signedTransaction: string) => post<{ purchase: TokenPurchaseResult }>('/token-store/purchases', { platform: 'ios', signedTransaction }),
  tokenPurchases: () => get<{ purchases: TokenPurchase[] }>('/me/token-purchases'),
  donatePriestly: (amount: number) =>
    post('/tokens/priestly/donate', { amount, idempotencyKey: `donate-${Date.now()}` }),
  givingInfo: () => get<GivingInfo>('/donations/info'),
  giveCheckout: (amountCents: number, target: GiftTarget, showDonor: boolean) =>
    post<{ donationId: string; url: string }>('/donations/checkout', { amountCents, target, showDonor, idempotencyKey: `give-${Date.now()}` }),
  myGifts: () => get<{ donations: MyGift[] }>('/me/donations'),
  radioAllowance: () => get<RadioAllowance>('/me/radio-allowance'),
  askForRadioPrayers: (count: number, note: string) => post('/me/radio-allocation-requests', { count, note }),
  radioRequests: () => get<{ requests: AllocationRequestRow[] }>('/staff/radio-allocation-requests'),
  decideRadioRequest: (id: string, grant: number) => post(`/staff/radio-allocation-requests/${id}/decide`, { grant }),
  /** Saved too, so skins and switched-on features stay as they were when offline. */
  features: () => cachedGet<{ features: Features }>('features', '/features'),
  guestLink: (postId: string) => get<{ link: GuestLink | null }>(`/posts/${postId}/guest-link`),
  createGuestLink: (postId: string) => post<{ link: GuestLink }>(`/posts/${postId}/guest-link`),
  revokeGuestLink: (postId: string) => request<{ revoked: true }>('DELETE', `/posts/${postId}/guest-link`),
  myGivingSplit: () => get<{ split: MyGivingSplit }>('/me/giving-split'),
  setGivingSplit: (percent: number) => request<{ split: MyGivingSplit }>('PUT', '/me/giving-split', { percent }),
  memberGivingSplit: (userId: string, cents?: number) =>
    get<{ split: GivingSplit | null }>(`/people/${userId}/giving-split${cents ? `?cents=${cents}` : ''}`),
  postGivingSplit: (postId: string) => get<{ split: GivingSplit | null }>(`/posts/${postId}/giving-split`),
  startLiveActivity: (body: { postId: string; pushToken: string; appId: string }) =>
    post<{ id: string; props: { heading: string; line: string; count: number } }>('/me/live-activities', body),
  endLiveActivity: (pushToken: string) => post<{ ended: true }>('/me/live-activities/end', { pushToken }),
  shareState: (postId: string) => get<{ share: ShareState | null }>(`/posts/${postId}/share`),
  setShareLevel: (postId: string, level: ShareLevel) => request<{ share: ShareState }>('PUT', `/posts/${postId}/share`, { level }),
  prayerChain: () => get<{ people: ChainPerson[] }>('/me/prayer-chain'),
  addToPrayerChain: (to: { email: string } | { phone: string }) => post<{ id: string }>('/me/prayer-chain', to),
  removeFromPrayerChain: (id: string) => request<{ removed: true }>('DELETE', `/me/prayer-chain/${id}`),
  sendToPrayerChain: (postId: string) => post<{ recipients: number; path: string }>(`/posts/${postId}/prayer-chain`),
  prayedFor: () => get<{ prayedFor: PrayedFor }>('/me/prayed-for'),
  prayerMinute: () => get<{ minute: PrayerMinute }>('/me/prayer-minute'),
  setPrayerMinute: (time: string, timeZone: string) => put<{ minute: PrayerMinute }>('/me/prayer-minute', { time, timeZone }),
  clearPrayerMinute: () => request<{ cleared: true }>('DELETE', '/me/prayer-minute'),
  prayerMinuteNow: () => get<{ now: PrayerMinuteNow }>('/prayer-minute/now'),
  joinPrayerMinute: () => post<{ joined: true }>('/prayer-minute/join'),
  worldwide: () => get<{ stats: WorldwideStats }>('/stats/worldwide'),
  thanksCard: () => get<{ card: { show: boolean; answeredYouPrayedFor: number } }>('/me/thanks-card'),
  dismissThanksCard: () => post<{ dismissed: true }>('/me/thanks-card/dismiss'),
  givingAsk: () => get<{ show: boolean }>('/me/giving-ask'),
  seenGivingAsk: () => post<{ ok: true }>('/me/giving-ask/seen'),
  eventInputs: (id: string) => get<{ canSeeAll: boolean; inputs: EventInput[] }>(`/events/${id}/inputs`),
  addEventInput: (id: string, body: string) => post<{ input: { id: string; crisis: boolean } }>(`/events/${id}/inputs`, { body }),
  removeEventInput: (id: string, inputId: string) => request<{ removed: true }>('DELETE', `/events/${id}/inputs/${inputId}`),
  helpStories: () => get<{ enabled: boolean; stories: { id: string; body: string; sharedAt: string }[] }>('/help-stories'),
  myWitnessStories: () => get<{ stories: { id: string; body: string; status: 'awaiting_consent' | 'approved' | 'declined'; createdAt: string }[] }>('/me/witness-stories'),
  decideWitnessStory: (id: string, approve: boolean) => post<{ ok: true }>(`/me/witness-stories/${id}/decision`, { approve }),
  draftWitnessStory: (caseId: string, body: string) => post<{ id: string }>(`/witness/cases/${caseId}/story`, { body }),
  kindMilestones: () => get<{ enabled: boolean; milestones: KindMilestone[] }>('/me/kind-milestones'),
  kindMilestonesSeen: () => post<{ enabled: boolean; milestones: KindMilestone[] }>('/me/kind-milestones/seen'),
  checkBack: (postId: string) => get<{ enabled: boolean; dueAt: string | null }>(`/posts/${postId}/check-back`),
  setCheckBack: (postId: string, days: 3 | 7 | 14 | null) => put<{ enabled: boolean; dueAt: string | null }>(`/posts/${postId}/check-back`, { days }),
  followup: (postId: string) => get<{ enabled: boolean; pending: boolean }>(`/posts/${postId}/followup`),
  answerFollowup: (postId: string, answer: FollowupAnswer, body?: string) =>
    post<{ answer: FollowupAnswer; crisis: boolean }>(`/posts/${postId}/followup`, body ? { answer, body } : { answer }),
  gratitude: (tz: string) => get<Gratitude>(`/me/gratitude?tz=${encodeURIComponent(tz)}`),
  setGratitudeDay: (weekday: number | null, timeZone: string) => put<Gratitude>('/me/gratitude/day', { weekday, timeZone }),
  saveGratitude: (items: string[], timeZone: string) => put<Gratitude>('/me/gratitude', { items, timeZone }),
  liftUp: (tz: string) => get<LiftUp>(`/me/lift-up?tz=${encodeURIComponent(tz)}`),
  saveLiftUp: (body: string, timeZone: string) => put<LiftUp>('/me/lift-up', { body, timeZone }),
  kindnessHighlights: () => get<KindnessHighlights>('/kindness-highlights'),
  liftedMeUp: (commentId: string) => post<{ asked: boolean }>(`/comments/${commentId}/lifted-me-up`),
  highlightAsks: () => get<HighlightAsks>('/me/highlight-asks'),
  answerHighlightAsk: (id: string, yes: boolean) => post<HighlightAsks>(`/me/highlight-asks/${id}`, { yes }),
  withdrawHighlight: (id: string) => post<HighlightAsks>(`/me/highlight-asks/${id}/withdraw`),
  partner: () => get<PartnerState>('/me/partner'),
  joinPartners: () => post<PartnerState>('/me/partner/join', { agree: true }),
  leavePartners: () => post<PartnerState>('/me/partner/leave'),
  partnerCheckIn: (mood: 'good' | 'okay' | 'hard', note?: string) => post<PartnerState>('/me/partner/check-in', { mood, ...(note ? { note } : {}) }),
  encourager: () => get<EncouragerState>('/me/encourager'),
  setVolunteer: (on: boolean, agree?: boolean) => put<EncouragerState>('/me/encourager/volunteer', { on, ...(agree ? { agree } : {}) }),
  askForEncourager: () => post<EncouragerState>('/me/encourager/ask'),
  endEncouragerMatch: (id: string) => request<EncouragerState>('DELETE', `/me/encourager/matches/${id}`),
  remembered: () => get<{ enabled: boolean; items: RememberedItem[] }>('/me/remembered'),
  hideRemembered: (postId: string) => post<{ enabled: boolean; items: RememberedItem[] }>(`/me/remembered/${postId}/hide`),
  conversationPrefs: () => get<{ prefs: ConversationPrefs }>('/me/conversation-prefs'),
  talkCount: (c: TalkCount) => request<{ counted: boolean }>('POST', '/talk-counts', c),
  updateConversationPrefs: (patch: Partial<ConversationPrefs>) => request<{ prefs: ConversationPrefs }>('PATCH', '/me/conversation-prefs', patch),
  meaningWords: () => get<{ emoji: MeaningEmoji[]; prefs: MeaningPref[] }>('/me/meaning-words'),
  setMeaningWords: (pref: MeaningPref) => put<{ prefs: MeaningPref[] }>('/me/meaning-words', pref),
  welcomeCard: () => get<{ show: boolean; text: string | null }>('/me/welcome-card'),
  dismissWelcome: () => post<{ show: boolean; text: string | null }>('/me/welcome-card/dismiss'),
  askKindly: (commentId: string, reason: KindAskReason) => post<{ sent: boolean }>(`/comments/${commentId}/ask-kindly`, { reason }),
  inviteMend: (commentId: string) => post<{ mend: Mend }>(`/comments/${commentId}/mend`),
  mend: (id: string) => get<{ mend: Mend }>(`/mends/${id}`),
  writeSorry: (id: string, sorry: Sorry) => put<{ mend: Mend }>(`/mends/${id}/sorry`, sorry),
  acceptMend: (id: string) => post<{ mend: Mend }>(`/mends/${id}/accept`),
  closeMend: (id: string) => post<{ mend: Mend }>(`/mends/${id}/close`),
  mendQueue: () => get<{ mends: Mend[] }>('/moderation/mends'),
  reviewMend: (id: string, approve: boolean, note?: string) => post<{ status: MendStatus }>(`/moderation/mends/${id}`, note ? { approve, note } : { approve }),
  prayerStats: (tz: string) => get<{ stats: PrayerStats }>(`/me/prayer-stats?tz=${encodeURIComponent(tz)}`),
  myChurch: () => get<{ church: Church | null }>('/me/church'),
  applyChurch: (input: ChurchApplicationInput) => post<{ church: Church }>('/me/church', input),
  editChurch: (input: ChurchApplicationInput) => put<{ church: Church }>('/me/church', input),
  withdrawChurch: () => request('DELETE', '/me/church'),
  churchesForReview: (status: ChurchStatus = 'pending') => get<{ churches: ChurchForReview[] }>(`/admin/churches?status=${status}`),
  decideChurch: (id: string, decision: 'verify' | 'decline' | 'revoke', note?: string) =>
    post<{ church: Church }>(`/admin/churches/${id}/decision`, { decision, note }),
};

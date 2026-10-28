// API shapes and product constants shared by apps/server and apps/mobile.

export const POST_TYPES = ['prayer_request', 'praise', 'open_prayer', 'testimony', 'confessional'] as const;
export type PostType = (typeof POST_TYPES)[number];

export const POST_TYPE_LABELS: Record<PostType, string> = {
  prayer_request: 'Prayer Request',
  praise: 'Praise & Thanks',
  open_prayer: 'Open Prayer',
  testimony: 'Testimony',
  confessional: 'Confession',
};

// Kinds and realms of prayer, from Steve's notebook (Page 10). Optional on every post.
export const PRAYER_KINDS = ['supplication', 'intercessory', 'praise_thanks'] as const;
export type PrayerKind = (typeof PRAYER_KINDS)[number];
export const PRAYER_KIND_LABELS: Record<PrayerKind, string> = {
  supplication: 'Supplication',
  intercessory: 'Intercession',
  praise_thanks: 'Praise & thanks',
};

export const PRAYER_REALMS = ['personal', 'family', 'church_community', 'general_welfare', 'national', 'world'] as const;
export type PrayerRealm = (typeof PRAYER_REALMS)[number];
export const PRAYER_REALM_LABELS: Record<PrayerRealm, string> = {
  personal: 'Personal & relationships',
  family: 'Family',
  church_community: 'Church & community',
  general_welfare: 'Welfare of all',
  national: 'Nation',
  world: 'World',
};

/** "Pick Your Prayer Mix": see more or less of a post type or realm. Only reorders; never hides. */
export type FeedMixLevel = 'less' | 'more';
export type FeedMixKey = `type:${PostType}` | `realm:${PrayerRealm}`;
export type FeedMix = Partial<Record<FeedMixKey, FeedMixLevel>>;
export const FEED_MIX_MULTIPLIER: Record<FeedMixLevel | 'normal', number> = { less: 0.5, normal: 1, more: 2 };
export const FEED_MIX_KEYS: FeedMixKey[] = [
  ...POST_TYPES.map((t) => `type:${t}` as const),
  ...PRAYER_REALMS.map((r) => `realm:${r}` as const),
];

/** Backgrounds for text-only posts. */
export const POST_BACKGROUNDS = ['dawn', 'sky', 'meadow', 'lavender', 'gold', 'night'] as const;
export type PostBackground = (typeof POST_BACKGROUNDS)[number];
export const POST_BACKGROUND_STYLES: Record<PostBackground, { label: string; color: string; text: string }> = {
  dawn: { label: 'Dawn', color: '#F6D5C3', text: '#4A2C2A' },
  sky: { label: 'Sky', color: '#CFE3F5', text: '#1F3A56' },
  meadow: { label: 'Meadow', color: '#D4EAD0', text: '#24452A' },
  lavender: { label: 'Lavender', color: '#E3D9F4', text: '#3B2A63' },
  gold: { label: 'Gold', color: '#F7E7B4', text: '#4D3B06' },
  night: { label: 'Night', color: '#2E2A4F', text: '#F4EFFF' },
};

/** The community rules a moderator can cite when removing content (see the Community rules screen). */
export const MODERATION_RULES = {
  harm: 'Pray for good, never for harm',
  flooding: 'No flooding for a side',
  ads: 'No ads',
  abuse: 'No harassment or abuse',
  safe_messaging: 'No details of suicide or self-harm methods',
  other: 'Community rules',
} as const;
export type ModerationRule = keyof typeof MODERATION_RULES;

/** Shown when a post or comment mentions suicide or self-harm (Samaritans guidance; 988 is the US line). */
export const CRISIS_SUPPORT = {
  title: 'You are not alone',
  body: 'If you or someone you love is thinking about suicide or self-harm, talk to someone now. The 988 Suicide & Crisis Lifeline is free, confidential and open 24/7.',
  call: 'tel:988',
  text: 'sms:988',
  chat: 'https://988lifeline.org/chat/',
} as const;

export type PostState = 'open' | 'actively_prayed' | 'amplified' | 'answered';
export type CardType = PostType | 'scripture_leaf' | 'feed_end';

/** The labeled action row, in the same order on every card in every layout. */
export const ACTION_ORDER = ['praying_now', 'commit', 'encouragement', 'well_wishes', 'share', 'gift_tokens'] as const;
export type CardAction = (typeof ACTION_ORDER)[number];

export const ACTION_LABELS: Record<CardAction, string> = {
  praying_now: 'Praying Now',
  commit: 'Commit to Pray',
  encouragement: 'Encourage',
  well_wishes: 'Well Wishes',
  share: 'Share',
  gift_tokens: 'Gift Tokens',
};

export const WHY_HERE = ['pray_for_others', 'prayer_for_myself', 'pray_without_ceasing', 'extend_reach'] as const;
export const WHY_HERE_LABELS: Record<(typeof WHY_HERE)[number], string> = {
  pray_for_others: 'To pray for others',
  prayer_for_myself: 'To ask for prayer for myself',
  pray_without_ceasing: 'To pray without ceasing',
  extend_reach: 'To extend the reach of prayer',
};

export const PRAY_FOR_SCOPE = ['family', 'friends', 'church', 'community', 'nation', 'world'] as const;

export const FREQUENCIES = ['weekly', 'daily', 'three_daily'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Every week',
  daily: 'Every day',
  three_daily: 'Three times a day',
};

export const MAX_POST_WORDS = 1000;
export const ENCOURAGEMENT_MAX_CHARS = 77;

export interface Identity {
  id: string | null;
  displayName: string;
  handle: string | null;
  anonymous: boolean;
}

export interface Comment {
  id: string;
  parentId: string | null;
  body: string;
  isUpdate: boolean;
  createdAt: string;
  author: Identity;
  depth?: number;
}

export interface Card {
  id: string;
  cardType: CardType;
  author: Identity & { tier: string | null };
  branchKey: string | null;
  isMine: boolean;
  myCommitment: { id: string; frequency: Frequency } | null;
  actions: CardAction[];
  postType: PostType;
  kind: string | null;
  realm: string | null;
  urgency: number;
  state: PostState;
  answeredAt: string | null;
  preview: string;
  truncated: boolean;
  body: string;
  background: string | null;
  isSensitive: boolean;
  /** Mentions suicide or self-harm: readers see crisis support. */
  crisis: boolean;
  /** `url` is a signed, short-lived read URL. */
  media: { kind: 'image' | 'video'; storagePath: string; url?: string | null }[];
  counts: {
    prayingNow: number;
    prayers: number;
    commitments: number;
    encouragements: number;
    wellWishes: number;
    shares: number;
    comments: number;
  };
  reach: number;
  topComment: Comment | null;
  createdAt: string;
}

/** Priestly tokens: earned per N verified prayers for others; fund the intercessory infrastructure. */
export interface PriestlyStatus {
  balance: number;
  verifiedPrayers: number;
  towardNext: number;
  prayersPerToken: number;
  /** Priestly tokens it costs to send a request out as a radio prayer. */
  radioPrayerCost: number;
  /** How many times Amplify sends a radio prayer; null while radio prayers cost tokens (Amplify is free-only). */
  amplifyRepeats: number | null;
}

export interface TokenSummary {
  balance: number;
  priestly: PriestlyStatus;
}

export type FeedLayoutKind = 'column' | 'vine' | 'carousel' | 'flip';

export interface FeedTheme {
  slug: string;
  name: string;
  layout: FeedLayoutKind;
  cardTemplates: Record<string, unknown>;
  animations: Record<string, unknown>;
  tokens: Record<string, unknown>;
}

export interface Person {
  id: string;
  displayName: string;
  handle: string | null;
  bio: string | null;
  whyHere: string[];
  following: boolean;
  followers: number;
}

export type Role = 'admin' | 'moderator' | 'pastor_counselor' | 'prayer_partner';

export interface ModerationItem {
  id: string;
  target_type: 'post' | 'comment' | 'reaction' | 'message' | 'event';
  target_id: string;
  source: 'report' | 'ai' | 'crisis';
  reason: string | null;
  status: string;
  content: string | null;
  created_at: string;
}

export interface Appeal {
  id: string;
  moderation_item_id: string;
  target_type: 'post' | 'comment' | 'reaction';
  rule: ModerationRule | null;
  message: string;
  content: string | null;
  suspended_until: string | null;
  created_at: string;
}

export interface FeedThemeChoices {
  themes: { slug: string; name: string; layout: FeedLayoutKind; status: 'active' | 'beta'; is_default: boolean }[];
  current: string | null;
}

export interface FeedPage {
  theme?: FeedTheme | null;
  posts: Card[];
  pinnedId: string | null;
  nextPage: number | null;
}

export interface Profile {
  id: string;
  display_name: string;
  handle: string | null;
  bio: string;
  why_here: string[];
  support_wanted: string[];
  support_offered: string[];
  pray_for_scope: string[];
  trauma_content_opt_out: boolean;
  anonymous_by_default: boolean;
  updates_in_first_comment: boolean;
  prompts_enabled: boolean;
  prompt_min_hours: number | null;
  feed_mix: FeedMix;
  onboarded_at: string | null;
  suspended_until: string | null;
}

export interface Commitment {
  id: string;
  post_id: string;
  frequency: Frequency;
  vow_text: string;
  status: 'active' | 'completed' | 'cancelled';
  next_reminder_at: string | null;
  committed_count: number;
  completed_count: number;
  ends_at: string | null;
  post_excerpt?: string;
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface Prompt {
  id: string;
  postId: string;
  commitmentId: string | null;
  question: string;
}

export interface TierStatus {
  tier: { tier: string; label: string; weeklyAllotment: number | null } | null;
  prayers: number;
  next: { tier: string; label: string; prayersNeeded: number } | null;
}

export interface WeeklyReview {
  prayers: number;
  checkins: number;
  people: number;
  active: number;
  kept: number;
  message: string;
}

// Long-post preview: the few words that carry a long request, shown under the
// preview as a sparkling reveal. A simple keyword heuristic (frequency, length,
// names), placeholder until a better extractor is chosen.
const STOP_WORDS = new Set(
  ('about above after again against all also and any are because been before being below between both but can could did does doing down during each ' +
    'even ever every few for from further had has have having her here hers herself him himself his how into its itself just know like made make many ' +
    'more most much must myself need never now off once only other our ours ourselves out over own please pray prayer prayers praying really same she ' +
    'should some still such than that the their theirs them themselves then there these they thing things this those through too under until upon very ' +
    'want was were what when where which while who whom why will with would you your yours yourself yourselves lord god jesus amen thank thanks today ' +
    'going been another little that’s it’s i’m don’t can’t')
    .split(/\s+/),
);

/** Up to `n` important words from a post, most important first. */
export function importantWords(body: string, n = 4): string[] {
  const scores = new Map<string, { word: string; score: number }>();
  const sentenceStart = new Set<number>();
  const tokens = [...body.matchAll(/[A-Za-z][A-Za-z’'-]{3,}/g)];
  for (const m of body.matchAll(/(^|[.!?]\s+)([A-Za-z])/g)) sentenceStart.add((m.index ?? 0) + m[1]!.length);
  for (const t of tokens) {
    const word = t[0].replace(/[’'-]+$/, '');
    const key = word.toLowerCase();
    if (word.length < 4 || STOP_WORDS.has(key)) continue;
    const isName = /^[A-Z]/.test(word) && !sentenceStart.has(t.index ?? -1);
    const prev = scores.get(key);
    const score = (prev?.score ?? 0) + 2 + word.length / 4 + (isName ? 2 : 0);
    scores.set(key, { word: prev?.word ?? word, score });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).slice(0, n).map((s) => s.word);
}

// Messages (Features Set 2: pray-er-to-prayee, direct, group chats) ------------

export type ConversationKind = 'prayer' | 'direct' | 'group';

/** A row in the Messages tab. */
export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  postId: string | null;
  title: string;
  topic: string | null;
  isPublic: boolean;
  /** A message request or group invite waiting on me. */
  isRequest: boolean;
  isOwner: boolean;
  memberCount: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}

export interface ChatMessage {
  id: string;
  mine: boolean;
  author: string;
  body: string;
  crisis: boolean;
  createdAt: string;
}

export interface ConversationView {
  conversation: {
    id: string;
    kind: ConversationKind;
    title: string;
    topic: string | null;
    isPublic: boolean;
    isRequest: boolean;
    isOwner: boolean;
    /** I started it and the other person hasn't replied yet. */
    awaitingReply: boolean;
    post: { id: string; excerpt: string } | null;
    /** Everyone but me; id is null for anonymous members. */
    members: { id: string | null; name: string; invited: boolean; isOwner: boolean }[];
  };
  messages: ChatMessage[];
}

export interface PublicGroup {
  id: string;
  title: string;
  topic: string | null;
  memberCount: number;
  joined: boolean;
  lastMessageAt: string | null;
}

export const MESSAGE_MAX_CHARS = 2000;

// Events: prayer meetings, meet-ups, seminars, outreach, restorative circles -----

export const EVENT_KINDS = ['prayer_meeting', 'meetup', 'seminar', 'outreach', 'circle'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  prayer_meeting: 'Prayer meeting',
  meetup: 'Local meet-up',
  seminar: 'Seminar',
  outreach: 'Outreach',
  circle: 'Restorative circle',
};

export interface PrayerEvent {
  id: string;
  kind: EventKind;
  title: string;
  description: string;
  startsAt: string;
  durationMinutes: number;
  /** Shown only once you RSVP (or host). */
  videoUrl: string | null;
  hasVideo: boolean;
  location: string | null;
  groupId: string | null;
  groupTitle: string | null;
  host: { id: string; name: string };
  isHost: boolean;
  going: number;
  myRsvp: 'going' | 'maybe' | null;
  cancelled: boolean;
  /** From 10 minutes before the start until the end. */
  live: boolean;
}

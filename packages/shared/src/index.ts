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
  target_type: 'post' | 'comment' | 'reaction';
  target_id: string;
  source: 'report' | 'ai';
  reason: string | null;
  status: string;
  content: string | null;
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

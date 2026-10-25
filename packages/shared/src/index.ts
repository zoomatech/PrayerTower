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
  media: { kind: 'image' | 'video'; storagePath: string }[];
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

export type FeedLayoutKind = 'column' | 'vine' | 'carousel' | 'flip';

export interface FeedTheme {
  slug: string;
  name: string;
  layout: FeedLayoutKind;
  cardTemplates: Record<string, unknown>;
  animations: Record<string, unknown>;
  tokens: Record<string, unknown>;
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

// API shapes and product constants shared by apps/server and apps/mobile.

export const POST_TYPES = ['prayer_request', 'praise', 'open_prayer', 'testimony', 'confessional', 'discussion', 'news', 'blog'] as const;
export type PostType = (typeof POST_TYPES)[number];
/**
 * Posts that aren't prayer (Mockup 8): no Praying Now, promises, radio or Power Prayer;
 * people comment, encourage and share. Off until an admin turns them on for a community.
 */
export const DISCUSSION_TYPES: readonly PostType[] = ['discussion', 'news', 'blog'];
export const isPrayable = (t: PostType) => !DISCUSSION_TYPES.includes(t);

/**
 * Features an admin can hide for one community (Admin → Communities), e.g. radio
 * for Open Circle. Hidden features disappear from the app for that community's
 * members, and the server refuses them.
 */
export const COMMUNITY_FEATURES = ['radio', 'spoken', 'care', 'events', 'groups', 'awards', 'live', 'circles', 'pools', 'highlights', 'surveys', 'podcasts'] as const;
export type CommunityFeature = (typeof COMMUNITY_FEATURES)[number];

export const POST_TYPE_LABELS: Record<PostType, string> = {
  prayer_request: 'Prayer Request',
  praise: 'Praise & Thanks',
  open_prayer: 'Open Prayer',
  testimony: 'Testimony',
  confessional: 'Confession',
  discussion: 'Discussion',
  news: 'News',
  blog: 'Blog Post',
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
  /** Only while Admin → Notebook ideas has the rule on. */
  pressure: "Share your beliefs freely. Don't pressure people.",
  /** Only while Admin → Notebook ideas has the rule on. */
  misleading: 'No misleading claims',
  /** Only while Admin → Notebook ideas has the rule on. */
  automation: 'No automated accounts',
  other: 'Community rules',
} as const;
export type ModerationRule = keyof typeof MODERATION_RULES;

/**
 * Crisis lines shown when a post or comment mentions suicide or self-harm
 * (Samaritans safe-messaging guidance). Pick the pilot's country with
 * EXPO_PUBLIC_CRISIS_COUNTRY in the app and CRISIS_COUNTRY on the server.
 * Sources, checked 2026-10-28: samhsa.gov/mental-health/988 (US),
 * 988.ca (Canada), samaritans.org (UK and Ireland). Check again before adding a
 * country or launching in one.
 */
export const CRISIS_LINES = {
  US: {
    name: 'the 988 Suicide & Crisis Lifeline',
    body: 'If you or someone you love is thinking about suicide or self-harm, talk to someone now. The 988 Suicide & Crisis Lifeline is free, confidential and open 24/7.',
    reach: 'call or text 988 any time',
    actions: [
      { label: 'Call 988', url: 'tel:988' },
      { label: 'Text 988', url: 'sms:988' },
      { label: 'Chat online', url: 'https://988lifeline.org/chat/' },
    ],
  },
  CA: {
    name: '9-8-8: Suicide Crisis Helpline',
    body: 'If you or someone you love is thinking about suicide or self-harm, talk to someone now. 9-8-8 is open 24 hours a day, every day of the year.',
    reach: 'call or text 9-8-8 any time',
    actions: [
      { label: 'Call 9-8-8', url: 'tel:988' },
      { label: 'Text 9-8-8', url: 'sms:988' },
      { label: '988.ca', url: 'https://988.ca' },
    ],
  },
  GB: {
    name: 'Samaritans',
    body: 'If you or someone you love is thinking about suicide or self-harm, talk to someone now. Samaritans are free to call from any phone in the UK and Ireland, 24 hours a day.',
    reach: 'call Samaritans free on 116 123 any time',
    actions: [
      { label: 'Call 116 123', url: 'tel:116123' },
      { label: 'samaritans.org', url: 'https://www.samaritans.org' },
    ],
  },
} as const;
export type CrisisCountry = keyof typeof CRISIS_LINES;

/** The crisis line for a country code; Ireland shares Samaritans with the UK, and anything unknown falls back to the US. */
export function crisisLine(country?: string | null) {
  const code = (country ?? '').trim().toUpperCase();
  const key = (code === 'IE' || code === 'UK' ? 'GB' : code) as CrisisCountry;
  return { title: 'You are not alone', ...(CRISIS_LINES[key] ?? CRISIS_LINES.US) };
}

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

/** "Will you pray for" (Idea Snippets mockup): Family, Friends, Loved Ones, Neighbors of all kinds, Enemies, Towns, Cities, Countries, The World. */
export const PRAY_FOR_SCOPE = ['family', 'friends', 'loved_ones', 'neighbors', 'church', 'community', 'enemies', 'towns', 'cities', 'nation', 'countries', 'world'] as const;

export const FREQUENCIES = ['weekly', 'daily', 'three_daily'] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Every week',
  daily: 'Every day',
  three_daily: 'Three times a day',
};

/** App languages; English is the default and the fallback. */
export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

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
  isMine?: boolean;
  author: Identity;
  depth?: number;
}

/** Long-press reactions: "Light a candle" and "Standing with you". */
export type QuickReactionKind = 'candle' | 'standing';

export interface Card {
  id: string;
  cardType: CardType;
  /** pastor: a verified church pastor's badge; null on anonymous posts. */
  /** town: "Carol in Albuquerque", only within the post's community while switched on. */
  author: Identity & { tier: string | null; pastor: PastorBadge | null; town?: string | null };
  branchKey: string | null;
  isMine: boolean;
  myCommitment: { id: string; frequency: Frequency } | null;
  /** The viewer's quick reactions on this post (long-press tray). */
  myQuickReactions?: QuickReactionKind[];
  actions: CardAction[];
  postType: PostType;
  kind: string | null;
  realm: string | null;
  urgency: number;
  state: PostState;
  answeredAt: string | null;
  /** The poster's testimony of how the prayer was answered. */
  testimony: string | null;
  testimonyAt: string | null;
  preview: string;
  truncated: boolean;
  body: string;
  background: string | null;
  isSensitive: boolean;
  /** The poster welcomes prayer and positive thoughts from people of any faith or none. */
  allSupportWelcome: boolean;
  /** A lament: grief or anguish to be heard, with gentle replies and no advice. */
  lament?: boolean;
  /** The author said this lament may go out by radio. */
  lamentRadio?: boolean;
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
    candles?: number;
    standing?: number;
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
  /** How many times Amplify sends a radio prayer; null when Amplify isn't available. */
  amplifyRepeats: number | null;
  /** Priestly tokens one Amplify costs (0 while radio prayers are free); null when paid Amplify is off. */
  amplifyCost: number | null;
}

export interface TokenSummary {
  balance: number;
  priestly: PriestlyStatus;
}

export type FeedLayoutKind = 'column' | 'vine' | 'carousel' | 'flip' | 'wall' | 'tower' | 'circuit';

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
  pastor: PastorBadge | null;
  /** An outside support page (Ko-fi, Patreon…), only while switched on. */
  supportUrl?: string | null;
  /** On the public Prayer Squire track (opt-in board). */
  squire?: boolean;
}

/** A verified church pastor's badge: "Pastor · Grace Chapel". */
export interface PastorBadge {
  title: string;
  church: string;
}

export type ChurchStatus = 'pending' | 'verified' | 'declined';
export interface ChurchApplicationInput {
  name: string;
  denomination?: string;
  pastorTitle?: string;
  city: string;
  region?: string;
  country: string;
  website?: string;
  phone?: string;
  about?: string;
}
export interface Church {
  id: string;
  name: string;
  denomination: string | null;
  pastorTitle: string;
  city: string;
  region: string | null;
  country: string;
  website: string | null;
  phone: string | null;
  about: string | null;
  status: ChurchStatus;
  /** The admin's note when declined or revoked. */
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
/** Admin review list: the application plus who applied. */
export interface ChurchForReview extends Church {
  applicant: { id: string; displayName: string; handle: string | null; email: string | null };
}

export type Role = 'admin' | 'moderator' | 'pastor' | 'pastor_counselor' | 'prayer_partner' | 'witness';

export interface ModerationItem {
  id: string;
  target_type: 'post' | 'comment' | 'reaction' | 'message' | 'event';
  target_id: string;
  source: 'report' | 'ai' | 'crisis' | 'harm';
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
  /** The viewer's current theme with its tokens (comment trees use its colors). */
  theme?: FeedTheme | null;
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
  /** null = the app default. */
  prompt_tone: 'gentle' | 'firm' | null;
  prompt_min_hours: number | null;
  feed_mix: FeedMix;
  /** App language; notifications are sent in it. */
  locale?: Locale;
  /** Weekly email digest; off by default. */
  digest_enabled?: boolean;
  /** Gentle prayer stats on Me (on by default). */
  show_prayer_stats?: boolean;
  town?: string | null;
  support_url?: string | null;
  open_to_other_communities?: boolean;
  /** Missing on profiles fetched before the setting existed. */
  notification_prefs?: NotificationPrefs;
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
  tone: 'gentle' | 'firm';
}

export interface TierStatus {
  tier: { tier: string; label: string; weeklyAllotment: number | null } | null;
  prayers: number;
  next: { tier: string; label: string; prayersNeeded: number } | null;
  /** While tier upkeep is on: days allowed between giving or spending a token, and the earned tier held back until one. */
  upkeep?: { days: number; held: { tier: string; label: string } | null } | null;
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

export type ConversationKind = 'prayer' | 'direct' | 'group' | 'care';

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

// Talk to a prayer partner or pastor (notebook Page 4) ---------------------------

export type CareKind = 'pray_with_me' | 'pastor' | 'confession';

export const CARE_KIND_LABELS: Record<CareKind, string> = {
  pray_with_me: 'Pray with me now',
  pastor: 'Talk with a pastor',
  confession: 'Confession',
};

export interface CareRequest {
  id: string;
  kind: CareKind;
  body: string;
  status: 'open' | 'claimed' | 'closed';
  conversationId: string | null;
  createdAt: string;
}

export interface CareQueueItem {
  id: string;
  kind: CareKind;
  body: string;
  crisis: boolean;
  name: string;
  createdAt: string;
}

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
  host: { id: string; name: string; pastor: PastorBadge | null };
  isHost: boolean;
  going: number;
  myRsvp: 'going' | 'maybe' | null;
  cancelled: boolean;
  /** From 10 minutes before the start until the end. */
  live: boolean;
}

/**
 * Notification settings: members turn push off per group of kinds and can set
 * quiet hours. Safety notices (moderation, appeals) are always sent.
 */
export const NOTIFICATION_CATEGORIES = ['prayers', 'promises', 'encouragement', 'messages', 'community', 'tokens'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export const NOTIFICATION_KINDS: Record<NotificationCategory, readonly string[]> = {
  prayers: ['praying_now', 'prayer', 'pray_request', 'pray_with_me', 'power_prayer', 'intercessory', 'radio_prayer', 'radio_on_air', 'radio_heard', 'spoken_prayer', 'live_amplifier_read', 'guest_prayer', 'prayer_minute'],
  promises: ['commitment_made', 'commitment_reminder', 'prayer_list_reminder'],
  encouragement: ['encouragement', 'thanks', 'lamp', 'weekly_review', 'testimony', 'answered', 'award', 'followup', 'followup_update', 'gratitude', 'encourager', 'kind_ask', 'mend_invite', 'mend_delivered', 'mend_returned', 'mend_accepted', 'mend_closed', 'partner', 'highlight_ask', 'highlights'],
  messages: ['message', 'meetup', 'care_request'],
  community: ['event_new', 'event_reminder', 'event_cancelled', 'group_invite', 'witness_story'],
  tokens: ['mint', 'milestone', 'scheduled_spend', 'radio_not_sent', 'token_purchase_refunded'],
};
export function notificationCategory(kind: string): NotificationCategory | null {
  for (const c of NOTIFICATION_CATEGORIES) if (NOTIFICATION_KINDS[c].includes(kind)) return c;
  return null;
}
export interface NotificationPrefs {
  /** Categories whose pushes are off. They still appear under Notices. */
  off: NotificationCategory[];
  /** Pushes due inside this window wait until it ends. Times are HH:MM in timeZone (IANA). */
  quietHours: { start: string; end: string; timeZone: string } | null;
}

/** Gentle prayer stats, shown only to the member on Me. No leaderboard. */
export interface PrayerStats {
  enabled: boolean;
  daysPrayed: number;
  peoplePrayedFor: number;
  requestsPrayedFor: number;
  /** Days in a row, counting today or, if not yet today, yesterday. */
  currentStreak: number;
  longestStreak: number;
  /** The last seven days, oldest first. */
  week: { date: string; prayed: boolean }[];
  /** Gentle rhythm (Admin → Growth practices): days prayed this calendar month, which only adds. */
  monthDays: number;
  /** Back after a week or more away: the app says welcome back, never what was missed. */
  welcomeBack: boolean;
  /** A Monday or the 1st of the month invites a fresh start. */
  freshStart: 'week' | 'month' | null;
}

/**
 * Feedback triage: the types staff tag tester feedback with (Admin → Feedback).
 * A new item gets suggested tags from what the member picked and a few words in
 * the text; an admin confirms or changes them.
 */
export const FEEDBACK_TAGS = ['bug', 'crash', 'idea', 'confusing', 'content', 'notifications', 'account', 'accessibility', 'spanish', 'performance', 'praise', 'other'] as const;
export type FeedbackTag = (typeof FEEDBACK_TAGS)[number];
export const FEEDBACK_SEVERITIES = ['low', 'medium', 'high', 'blocker'] as const;
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];

/** WCAG 2.x contrast ratio of two #RRGGBB colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Comment text color in the app; a member skin's comment background must keep 4.5:1 against it (WCAG AA). */
export const COMMENT_TEXT = '#2B2433';

/**
 * Seasonal feed skins (docs/FEED_SKINS.md, Seasonal skins). Church seasons follow the
 * Western calendar: Advent from the fourth Sunday before Christmas to Christmas Eve,
 * Christmas through 5 January, Lent from Ash Wednesday (46 days before Easter) to
 * Holy Saturday, Easter until the day before Pentecost (Easter + 49 days), and
 * Pentecost for that week. Open Circle uses the northern-hemisphere weather seasons.
 */
export const CHURCH_SEASONS = ['advent', 'christmas', 'lent', 'easter', 'pentecost'] as const;
export const WEATHER_SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const;
export type SkinSeason = (typeof CHURCH_SEASONS)[number] | (typeof WEATHER_SEASONS)[number];

/** Easter Sunday (Gregorian), by the anonymous Gregorian algorithm. Returns a UTC date. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** The seasons a date falls in: at most one church season, and always one weather season. */
export function seasonsOn(date: Date): SkinSeason[] {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const y = date.getUTCFullYear();
  const DAY = 86_400_000;
  const easter = easterSunday(y).getTime();
  const christmas = Date.UTC(y, 11, 25);
  // The fourth Sunday before Christmas: the Sunday on or before 3 December.
  const dec3 = new Date(Date.UTC(y, 11, 3));
  const adventStart = dec3.getTime() - dec3.getUTCDay() * DAY;
  let church: SkinSeason | null = null;
  if (day >= adventStart && day < christmas) church = 'advent';
  else if (day >= christmas || day <= Date.UTC(y, 0, 5)) church = 'christmas';
  else if (day >= easter - 46 * DAY && day < easter) church = 'lent';
  else if (day >= easter && day < easter + 49 * DAY) church = 'easter';
  else if (day >= easter + 49 * DAY && day < easter + 56 * DAY) church = 'pentecost';
  const m = date.getUTCMonth();
  const weather: SkinSeason = m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
  return church ? [church, weather] : [weather];
}

// Typed client for the Prayer Tower API. Every call sends the Supabase access token.
import type {
  Appeal,
  AppNotification,
  Card,
  ChatMessage,
  Comment,
  Commitment,
  FeedPage,
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
  PublicGroup,
  TierStatus,
  TokenSummary,
  WeeklyReview,
} from '@prayer-tower/shared';

import { env } from './env';
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${env.apiUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issue = json.issues?.[0]?.message;
    throw new ApiError(res.status, json.error ?? 'error', issue ?? json.message ?? 'Something went wrong');
  }
  return json as T;
}

const get = <T>(path: string) => request<T>('GET', path);

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
}
export interface AdminRadioSettings {
  radio_transmitter: 'log' | 'station';
  radio_station_requires_free: boolean;
  radio_max_chars: number;
  radio_amplify_repeats: number;
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
  media?: { kind: 'image' | 'video'; storagePath: string }[];
}

export const api = {
  me: () => get<{ profile: Profile; roles: Role[] }>('/me'),
  updateMe: (patch: Record<string, unknown>) => request<{ profile: Profile }>('PATCH', '/me', patch),
  feed: (page = 0) => get<FeedPage>(`/feed?page=${page}`),
  post: (id: string) => get<{ post: Card }>(`/posts/${id}`),
  createPost: (input: NewPost) => post<{ post: Card }>('/posts', input),
  hidePost: (id: string) => put<{ hidden: boolean }>(`/posts/${id}/hide`),
  unhidePost: (id: string) => request<{ hidden: boolean }>('DELETE', `/posts/${id}/hide`),
  markAnswered: (id: string) => post<{ post: Card }>(`/posts/${id}/answered`),
  comments: (id: string) => get<{ comments: Comment[] }>(`/posts/${id}/comments`),
  addComment: (id: string, body: string, opts: { parentId?: string; isUpdate?: boolean } = {}) =>
    post<{ comment: { id: string; crisis: boolean } }>(`/posts/${id}/comments`, { body, ...opts }),
  prayers: (id: string) =>
    get<{ count: number; people: { id: string | null; displayName: string; lastPrayedAt: string }[] }>(`/posts/${id}/prayers`),
  prayingNow: (id: string) => post<{ eventId: string; integrityText: string }>(`/posts/${id}/praying-now`),
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
  feedThemes: () => get<FeedThemeChoices>('/me/feed-themes'),
  chooseFeedTheme: (slug: string | null) => put<FeedThemeChoices>('/me/feed-theme', { slug }),
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
  report: (targetType: 'post' | 'comment' | 'message', targetId: string, reason: string) =>
    post<{ reportId: string }>('/reports', { targetType, targetId, reason }),
  moderationQueue: () => get<{ items: ModerationItem[] }>('/moderation/queue'),
  decide: (itemId: string, decision: { action: 'dismiss' | 'remove'; suspendDays?: number; note?: string; rule?: ModerationRule }) =>
    post<{ ok: boolean }>(`/moderation/items/${itemId}/decision`, decision),
  /** Would this text likely break the rules? Used to warn before posting; never blocks. */
  precheck: (text: string) => post<{ warn: boolean }>('/moderation/precheck', { text }).catch(() => ({ warn: false })),
  appeal: (itemId: string, message: string) => post<{ appealId: string }>(`/moderation/items/${itemId}/appeal`, { message }),
  appeals: () => get<{ appeals: Appeal[] }>('/moderation/appeals'),
  decideAppeal: (id: string, action: 'uphold' | 'overturn', note?: string) =>
    post<{ ok: boolean }>(`/moderation/appeals/${id}/decision`, { action, note: note || undefined }),
  registerPushToken: (token: string, platform: string) => post('/me/push-tokens', { token, platform }),
  admin: {
    milestones: () => get<{ rules: MilestoneRule[] }>('/admin/milestones'),
    addMilestone: (input: Pick<MilestoneRule, 'label' | 'metric' | 'threshold' | 'amount'>) =>
      post<{ rule: MilestoneRule }>('/admin/milestones', input),
    updateMilestone: (id: string, patch: Partial<Pick<MilestoneRule, 'label' | 'threshold' | 'amount' | 'enabled'>>) =>
      request<{ rule: MilestoneRule }>('PATCH', `/admin/milestones/${id}`, patch),
    metrics: (days: number) => get<Record<string, Record<string, number | string | null>>>(`/admin/metrics?days=${days}`),
    tokenSettings: () => get<{ settings: AdminTokenSettings }>('/admin/token-settings'),
    updateTokenSettings: (
      patch: Partial<{ priestlyPrayersPerToken: number; verifiedPrayerMinGapSeconds: number; radioPrayerCost: number; radioFunding: 'tokens' | 'free' }>,
    ) => request<{ settings: AdminTokenSettings }>('PATCH', '/admin/token-settings', patch),
    pilotReport: (weeks: number) => get<{ weeks: PilotWeek[] }>(`/admin/pilot-report?weeks=${weeks}`),
    pilotCsv: (weeks: number) => getText(`/admin/pilot-report?weeks=${weeks}&format=csv`),
    radioSettings: () => get<{ settings: AdminRadioSettings }>('/admin/radio-settings'),
    updateRadioSettings: (patch: Partial<{ transmitter: 'log' | 'station'; stationRequiresFree: boolean; maxChars: number; amplifyRepeats: number }>) =>
      request<{ settings: AdminRadioSettings }>('PATCH', '/admin/radio-settings', patch),
    safetySettings: () => get<{ settings: AdminSafetySettings }>('/admin/safety-settings'),
    updateSafetySettings: (
      patch: Partial<{
        newMemberLimitsEnabled: boolean;
        newMemberHours: number;
        newMemberMinPrayers: number;
        newMemberPostsPerDay: number;
        newMemberCommentsPerDay: number;
        newMemberLinksAllowed: boolean;
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
  myTokenPools: () => get<{ pools: TokenPool[] }>('/me/token-pools'),
  createTokenPool: (input: { name: string; purpose: string; realm: string | null; drawAmount: number; showDonor: boolean; amount: number }) =>
    post<{ id: string; balance: number }>('/token-pools', { ...input, idempotencyKey: `pool-${Date.now()}` }),
  fundTokenPool: (id: string, amount: number) => post(`/token-pools/${id}/fund`, { amount, idempotencyKey: `fund-${id}-${Date.now()}` }),
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
  highlights: () => get<Highlights>('/highlights'),
  conversations: () => get<{ conversations: ConversationSummary[] }>('/me/conversations'),
  conversation: (id: string, before?: string) => get<ConversationView>(`/conversations/${id}${before ? `?before=${before}` : ''}`),
  sendMessage: (id: string, body: string) => post<{ message: Pick<ChatMessage, 'id' | 'createdAt' | 'crisis'> }>(`/conversations/${id}/messages`, { body }),
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
  blocks: () => get<{ blocks: { id: string; displayName: string }[] }>('/me/blocks'),
  block: (userId: string) => put(`/people/${userId}/block`),
  unblock: (userId: string) => request('DELETE', `/people/${userId}/block`),
  donatePriestly: (amount: number) =>
    post('/tokens/priestly/donate', { amount, idempotencyKey: `donate-${Date.now()}` }),
};

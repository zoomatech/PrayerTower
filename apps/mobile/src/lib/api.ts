// Typed client for the Prayer Tower API. Every call sends the Supabase access token.
import type {
  AppNotification,
  Card,
  Comment,
  Commitment,
  FeedPage,
  Frequency,
  PostType,
  Profile,
  Prompt,
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
const post = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);

export interface NewPost {
  postType: PostType;
  body: string;
  urgency?: number;
  isAnonymous?: boolean;
  isSensitive?: boolean;
}

export const api = {
  me: () => get<{ profile: Profile }>('/me'),
  updateMe: (patch: Record<string, unknown>) => request<{ profile: Profile }>('PATCH', '/me', patch),
  feed: (page = 0) => get<FeedPage>(`/feed?page=${page}`),
  post: (id: string) => get<{ post: Card }>(`/posts/${id}`),
  createPost: (input: NewPost) => post<{ post: Card }>('/posts', input),
  markAnswered: (id: string) => post<{ post: Card }>(`/posts/${id}/answered`),
  comments: (id: string) => get<{ comments: Comment[] }>(`/posts/${id}/comments`),
  addComment: (id: string, body: string, opts: { parentId?: string; isUpdate?: boolean } = {}) =>
    post<{ comment: { id: string } }>(`/posts/${id}/comments`, { body, ...opts }),
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
  sendRadioPrayer: (postId: string) =>
    post<{ radioPrayer: { id: string; status: string } }>(`/posts/${postId}/radio`, { idempotencyKey: `radio-${postId}-${Date.now()}` }),
  donatePriestly: (amount: number) =>
    post('/tokens/priestly/donate', { amount, idempotencyKey: `donate-${Date.now()}` }),
};

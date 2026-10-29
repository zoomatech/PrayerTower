// Poor-network support: the last feed is kept on the device and shown when the
// server can't be reached, and "Praying Now" taps and text-only posts made
// while offline wait in a queue that is sent, in order, once a request
// succeeds again. Nothing here is sent anywhere but our own API.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const QUEUE_KEY = 'offline:queue:v1';
const CACHE_PREFIX = 'offline:cache:v1:';
/** Queued actions older than this are dropped: a days-old "praying now" isn't now. */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export interface QueuedAction {
  id: string;
  label: string;
  method: 'POST';
  path: string;
  body: unknown;
  /** Sent as Idempotency-Key, the same as the first try's, so a replay is never done twice. */
  key?: string;
  queuedAt: number;
}

interface State {
  online: boolean;
  queued: QueuedAction[];
  /** What happened to queued actions the server refused (e.g. a removed request). */
  dropped: { label: string; message: string }[];
}

let state: State = { online: true, queued: [], dropped: [] };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export function useOffline() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Thrown when the server can't be reached (no signal, airplane mode, timeout). */
export class OfflineError extends Error {
  readonly offline = true;
  constructor() {
    super("You're offline. Check your connection and try again.");
  }
}
export const isOffline = (e: unknown): e is OfflineError => e instanceof OfflineError;

export function markOnline(online: boolean) {
  if (state.online !== online) set({ online });
}

// ----- Saved responses -----

export async function saveCached(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Storage full or unavailable: the app still works online.
  }
}

export async function readCached<T>(key: string): Promise<{ savedAt: number; value: T } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as { savedAt: number; value: T }) : null;
  } catch {
    return null;
  }
}

/** Remove everything saved for offline use (on sign-out or account deletion). */
export async function clearOffline() {
  set({ queued: [], dropped: [] });
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('offline:'));
    await AsyncStorage.multiRemove(keys);
  } catch {
    // Nothing saved.
  }
}

// ----- Queue -----

let loaded = false;
async function loadQueue() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const items = raw ? (JSON.parse(raw) as QueuedAction[]) : [];
    set({ queued: items.filter((i) => Date.now() - i.queuedAt < MAX_AGE_MS) });
  } catch {
    // Start with an empty queue.
  }
}

async function persist() {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(state.queued));
  } catch {
    // Kept in memory for this session.
  }
}

export async function enqueue(action: Omit<QueuedAction, 'id' | 'queuedAt'>) {
  await loadQueue();
  set({ queued: [...state.queued, { ...action, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, queuedAt: Date.now() }] });
  await persist();
}

let flushing = false;
/**
 * Send queued actions in order. Stops at the first one that can't reach the
 * server; drops one the server refuses (and remembers why).
 */
export async function flushQueue(send: (a: QueuedAction) => Promise<unknown>) {
  await loadQueue();
  if (flushing || !state.queued.length) return;
  flushing = true;
  try {
    while (state.queued.length) {
      const next = state.queued[0]!;
      try {
        await send(next);
      } catch (e) {
        // No signal, a server error or "too many requests": keep it and try again later.
        // Anything else is a refusal (e.g. the request was removed): drop it and say so.
        const status = (e as { status?: number }).status ?? 0;
        if (isOffline(e) || status >= 500 || status === 429) break;
        set({ dropped: [...state.dropped, { label: next.label, message: (e as Error).message }] });
      }
      set({ queued: state.queued.slice(1) });
      await persist();
    }
  } finally {
    flushing = false;
  }
}

export const dismissDropped = () => set({ dropped: [] });

/** How many actions are waiting to send. */
export const pendingCount = () => state.queued.length;

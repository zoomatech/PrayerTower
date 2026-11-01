import type { FeedTheme } from '@prayer-tower/shared';
import { useSyncExternalStore } from 'react';

/**
 * The header over the feed, in the style of the member's skin (Steve, 2026-11-01): the skin's
 * backdrop up behind the clock, edged along its foot with a line in the skin's own color, and the
 * logo top right on a light plate where the backdrop is dark. The feed screen sets it while it is
 * in view; every other screen keeps the plain header (null).
 */
export type SkinHeaderLook = { backdrop: string; accent: string };

let current: SkinHeaderLook | null = null;
const listeners = new Set<() => void>();

export function setSkinHeader(look: SkinHeaderLook | null) {
  if (current?.backdrop === look?.backdrop && current?.accent === look?.accent) return;
  current = look;
  listeners.forEach((l) => l());
}

export function useSkinHeader(): SkinHeaderLook | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

const hex = (v: unknown): string | null => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);

/** The header look for a skin; the plain column (or no skin) keeps the plain header. */
export function skinHeaderLook(theme: FeedTheme | null | undefined): SkinHeaderLook | null {
  if (!theme || theme.layout === 'column') return null;
  const t = theme.tokens;
  const backdrop = hex(t.backdrop) ?? hex(t.leafSoft) ?? '#FFFFFF';
  const accent = hex(t.stem) ?? hex(t.mortar) ?? hex(t.wire) ?? hex(t.rope) ?? '#7A5BC2';
  return { backdrop, accent };
}

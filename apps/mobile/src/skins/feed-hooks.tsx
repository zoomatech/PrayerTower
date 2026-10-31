// The hooks between a feed skin and the data (docs/SKIN_HOOKS.md). A skin decides only
// how things look; everything a button, a tap or a scroll DOES comes from here, so any
// skin's buttons work the same way and a new skin can't get them wrong.
//
// The feed screen fills FeedHooks once and every part of a skin reads it with
// useFeedHooks(), however deep it sits (a post, a comment leaf, a neon card).
import type { Card, CardAction } from '@prayer-tower/shared';
import { router } from 'expo-router';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

export interface FeedHooks {
  /** Every card action: Praying Now, like, Commit to Pray, encourage, well wishes, share, gift. */
  act: (card: Card, action: CardAction) => void;
  /** "Not for me": the post leaves this feed. */
  hide?: (card: Card) => void;
  /** Opens a post on its own page, at one of its comments when given. */
  openPost: (postId: string, commentId?: string) => void;
  /** Infinite scroll: the next page, and whether there is one. */
  loadMore: () => void;
  atEnd: boolean;
  /** Pull to refresh. */
  refresh: () => void;
  refreshing: boolean;
}

export function openPost(postId: string, commentId?: string) {
  router.push({ pathname: '/post/[id]', params: commentId ? { id: postId, comment: commentId } : { id: postId } });
}

/** Outside a feed (a post's own page, the skin gallery) the actions do nothing and posts still open. */
const NONE: FeedHooks = {
  act: () => undefined,
  openPost,
  loadMore: () => undefined,
  atEnd: true,
  refresh: () => undefined,
  refreshing: false,
};

const Hooks = createContext<FeedHooks>(NONE);

export function FeedHooksProvider({ value, children }: { value: FeedHooks; children: ReactNode }) {
  return <Hooks.Provider value={value}>{children}</Hooks.Provider>;
}

export function useFeedHooks(): FeedHooks {
  return useContext(Hooks);
}

/**
 * Infinite scroll for skins that page through posts themselves (a deck, a climb) instead
 * of a scrolling list: asks for the next page once `index` is within `ahead` of the end.
 */
export function useNearEnd(index: number, length: number, atEnd: boolean, loadMore: () => void, ahead: number) {
  useEffect(() => {
    if (!atEnd && index >= length - ahead) loadMore();
  }, [index, length, atEnd, loadMore, ahead]);
}

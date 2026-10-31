// A post's comments for a skin: loading them, the tree of replies, what each comment's
// buttons do, and opening and closing a cluster. A skin only draws the comments (leaves
// on a vine, red neon cards, stone tablets); the data and the buttons come from here.
import type { Card, Comment } from '@prayer-tower/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Share } from 'react-native';

import { api } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { shareLink } from '@/lib/links';

import { useFeedHooks } from './feed-hooks';

/** Top-level comments newest first, and each comment's replies in order. */
export function commentTree(all: Comment[]) {
  const top = all.filter((c) => !c.parentId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const kids = new Map<string, Comment[]>();
  for (const c of all) if (c.parentId) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c]);
  return { top, kids };
}

/**
 * A post's comments as a tree. Until they load (or while `when` is false, e.g. before the
 * post has scrolled into view) it uses the newest few the feed already sent. `total` is
 * how many top-level comments there are, counting ones not loaded yet.
 */
export function usePostComments(card: Card, when = true) {
  // Loaded once per comment count: a new comment (after a refresh) loads them again.
  const [loaded, setLoaded] = useState<{ count: number; list: Comment[] } | null>(null);
  const count = card.counts.comments ?? 0;
  const fresh = loaded?.count === count;
  useEffect(() => {
    if (!when || fresh || count <= 0) return;
    let live = true;
    api
      .comments(card.id)
      .then((r) => live && setLoaded({ count, list: r.comments }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [when, fresh, card.id, count]);
  const all = loaded?.list ?? null;
  const fallback = useMemo(() => (card.leafComments ?? []).map((c) => ({ ...c, parentId: c.parentId ?? null })), [card.leafComments]);
  const { top, kids } = useMemo(() => commentTree(all ?? fallback), [all, fallback]);
  const total = all ? top.length : Math.max(top.length, count);
  return { top, kids, total, loaded: !!all };
}

/**
 * One comment's buttons: reply, "this helped" and share. A button the member may not use
 * here (their own comment, or a switch that is off) comes back as null, so a skin leaves it out.
 */
export function useCommentActions(postId: string, comment: Comment) {
  const { t } = useLocale();
  const { openPost } = useFeedHooks();
  const { thisHelped, shareConsent } = useFeatures();
  const [helped, setHelped] = useState(!!comment.helped);
  return {
    reply: { name: t('post.reply'), press: () => openPost(postId, comment.id) },
    helped:
      thisHelped && !comment.isMine
        ? {
            name: t('kindNorms.helped'),
            on: helped,
            press: () => {
              const next = !helped;
              setHelped(next);
              api.setHelped(comment.id, next).catch(() => setHelped(!next));
            },
          }
        : null,
    share:
      !shareConsent || comment.isMine
        ? {
            name: t('post.share'),
            press: () =>
              Share.share({ message: t('post.shareComment', { body: comment.body, name: comment.author.displayName, url: shareLink(`/post/${postId}`, { comment: comment.id }) }) }).catch(() => undefined),
          }
        : null,
  };
}

/**
 * Opening and closing a cluster of comments. Closed, it shows only its top comment; a tap
 * spreads it open. Open clusters page through their comments; within a page one comment's
 * replies are open at a time (`open`), and one reply's replies under it (`open2`).
 * `cycle` counts page turns, for a skin that animates each new page in.
 */
export interface ClusterState {
  spread: boolean;
  page: number;
  open: number | null;
  open2: number | null;
}

export function useCommentCluster() {
  const [state, setState] = useState<ClusterState>({ spread: false, page: 0, open: null, open2: null });
  const [cycle, setCycle] = useState(0);
  /** Opens or closes the whole cluster. */
  const toggle = useCallback(() => setState((s) => ({ spread: !s.spread, page: 0, open: null, open2: null })), []);
  /** Spreads the cluster open at page `p`, with every reply closed. */
  const showPage = useCallback((p: number) => {
    setState({ spread: true, page: p, open: null, open2: null });
    setCycle((n) => n + 1);
  }, []);
  /** Opens or closes a comment's replies (level 1) or a reply's replies (level 2), by index. */
  const toggleReplies = useCallback(
    (level: 1 | 2, index: number) => setState((s) => (level === 1 ? { ...s, open: s.open === index ? null : index, open2: null } : { ...s, open2: s.open2 === index ? null : index })),
    [],
  );
  return { state, cycle, toggle, showPage, toggleReplies };
}

/** How many comments a closed or open cluster shows, how many lines recede behind a closed one, and how many are left over. */
export function clusterSlice<T>(list: T[], spread: boolean, opened: number, recession: number) {
  const shown = spread ? list.slice(0, opened) : list.slice(0, 1);
  return { shown, behind: spread ? 0 : Math.min(list.length - 1, recession), more: spread ? list.length - shown.length : 0 };
}

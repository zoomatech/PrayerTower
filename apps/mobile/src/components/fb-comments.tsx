// Comments laid out the way Facebook lays them out (Steve, 2026-11-02), for the skins that used to
// show folded lines or stacked cards for the comments waiting under a post:
//   * Closed: the top comment, its first line fading out, then "(+ x more)", x being how many
//     comments are hidden. A tap opens them.
//   * Open: each comment with its picture on the left, name and words beside it and its buttons
//     under them. Replies sit indented under the comment's words with a smaller picture, joined to
//     it by a thread line curving in from under its picture. The first reply shows; "View all N
//     replies" brings out the rest. Replies stop at the 3rd level (deeper ones line up at the
//     3rd), and only top-level comments get a Reply button. A tap on a comment folds them closed.
// Each skin passes its own colors (`FbInk`); the comments and buttons come from skins/comments.ts.
import type { Card, Comment } from '@prayer-tower/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText, TSpan } from 'react-native-svg';

import { useLocale } from '@/lib/i18n';
import { useCommentActions, usePostComments, repliesAt } from '@/skins/comments';
import { useFeedHooks } from '@/skins/feed-hooks';
import { CachedPhoto } from '@/components/cached-photo';

export interface FbInk {
  /** Names and words. */
  text: string;
  /** Buttons and "View all N replies". */
  muted: string;
  /** "(+ x more)". */
  link: string;
  /** The thread lines joining replies to their comment. */
  thread: string;
  /** A picture's circle when the member has no photo, and its initials. */
  avatar: string;
  avatarText: string;
  /** Names in the skin's own face, if it has one. */
  nameFont?: string;
}

/** Replies stop at the 3rd level (Steve). */
export const FB_LEVELS = 3;
/** Top-level comments shown at a time once open; "View more comments" shows the next ones. */
export const FB_PAGE = 10;
/** Picture sizes for a comment, a reply and a reply to a reply. */
const AVATAR = [32, 24, 20];
const GAP = 8;
const LINE = 1.5;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

function Avatar({ who, size, ink }: { who: Comment['author']; size: number; ink: FbInk }) {
  return (
    <View aria-hidden style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: ink.avatar }]}>
      {who.photoUrl ? (
        <CachedPhoto url={who.photoUrl} style={{ width: size, height: size }} />
      ) : (
        <Text style={[styles.avatarText, { color: ink.avatarText, fontSize: Math.round(size * 0.4) }]}>{initials(who.displayName)}</Text>
      )}
    </View>
  );
}

/** How many comments a post has in all, replies counted, whichever is more: the feed's count or what has loaded. */
export function commentCount(card: Card, top: Comment[], kids: Map<string, Comment[]>) {
  let loaded = top.length;
  for (const list of kids.values()) loaded += list.length;
  return Math.max(card.counts.comments ?? 0, loaded);
}

/** One line of words fading out toward its end, drawn so it fades over any backdrop. */
export function FadingLine({ name, body, ink, size = 14 }: { name: string; body: string; ink: FbInk; size?: number }) {
  const [w, setW] = useState(0);
  const h = Math.round(size * 1.45);
  const id = `fade-${name.length}-${body.length}-${Math.round(w)}`;
  return (
    <View style={{ flex: 1, height: h }} onLayout={(e) => setW(e.nativeEvent.layout.width)} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {w ? (
        <Svg width={w} height={h}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={ink.text} stopOpacity={1} />
              <Stop offset="0.45" stopColor={ink.text} stopOpacity={0.85} />
              <Stop offset="1" stopColor={ink.text} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <SvgText x={0} y={size} fontSize={size} fill={`url(#${id})`}>
            <TSpan fontWeight="700" fontFamily={ink.nameFont}>{`${name}  `}</TSpan>
            <TSpan>{body.replace(/\s+/g, ' ')}</TSpan>
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

/** A post's comments closed: the top comment's first line fading out, then "(+ x more)". */
export function ClosedComments({ first, hidden, ink, onOpen, testID }: { first: Comment; hidden: number; ink: FbInk; onOpen: () => void; testID?: string }) {
  const { t } = useLocale();
  const more = t('fb.more', { n: hidden });
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      aria-expanded={false}
      accessibilityLabel={`${first.author.displayName}: ${first.body}. ${more}`}
      accessibilityHint={t('fb.open')}
      style={styles.closed}
      testID={testID}>
      <Avatar who={first.author} size={AVATAR[1]!} ink={ink} />
      <FadingLine name={first.author.displayName} body={first.body} ink={ink} />
      <Text style={[styles.more, { color: ink.link }]} testID={testID ? `${testID}-more` : undefined}>
        {more}
      </Text>
    </Pressable>
  );
}

function Buttons({ postId, comment, canReply, ink }: { postId: string; comment: Comment; canReply: boolean; ink: FbInk }) {
  const { reply, helped, share } = useCommentActions(postId, comment);
  const link = (key: string, b: { name: string; press: () => void; on?: boolean }) => (
    <Pressable key={key} onPress={b.press} accessibilityRole="button" aria-pressed={key === 'helped' ? !!b.on : undefined} hitSlop={8}>
      <Text style={[styles.action, { color: b.on ? ink.link : ink.muted }]}>{b.name}</Text>
    </Pressable>
  );
  return (
    <View style={styles.actions}>
      {/* Steve: sub-comments get no Reply button (overnesting is hard to follow). */}
      {canReply ? link('reply', reply) : null}
      {helped ? link('helped', helped) : null}
      {share ? link('share', share) : null}
    </View>
  );
}

/**
 * One comment at `level` (1 to 3), with its replies under its words: the first showing,
 * "View all N replies" for the rest. A vertical thread line runs down from under its picture
 * to the last reply, and each reply's elbow curves in from it.
 */
function Row({ postId, comment, level, kids, ink, onFold }: { postId: string; comment: Comment; level: number; kids: Map<string, Comment[]>; ink: FbInk; onFold: () => void }) {
  const { t } = useLocale();
  const [all, setAll] = useState(false);
  const [lastH, setLastH] = useState(0);
  const replies = level < FB_LEVELS ? repliesAt(kids, comment.id, level, FB_LEVELS - 1) : [];
  const shown = all ? replies : replies.slice(0, 1);
  const rest = replies.length - shown.length;
  const size = AVATAR[level - 1]!;
  const childSize = AVATAR[Math.min(level, AVATAR.length - 1)]!;
  // Each item under the words: a reply, or the "View all" link; the last one ends the thread line.
  const items: { key: string; node: React.ReactNode; elbow: number }[] = shown.map((r) => ({
    key: r.id,
    elbow: 6 + childSize / 2,
    node: <Row postId={postId} comment={r} level={level + 1} kids={kids} ink={ink} onFold={onFold} />,
  }));
  if (rest > 0)
    items.push({
      key: 'all',
      elbow: 20,
      node: (
        <Pressable onPress={() => setAll(true)} accessibilityRole="button" aria-expanded={false} style={styles.viewAll} testID={`fb-view-all-${comment.id}`}>
          <Text style={[styles.viewAllText, { color: ink.muted }]}>{t('fb.viewAll', { count: replies.length })}</Text>
        </Pressable>
      ),
    });
  const reach = size / 2 + GAP;
  return (
    <View style={styles.row} testID={`fb-comment-${comment.id}`}>
      <View style={{ width: size, alignItems: 'center' }}>
        <Avatar who={comment.author} size={size} ink={ink} />
        {items.length ? <View aria-hidden style={{ flex: 1, width: LINE, marginTop: 2, marginBottom: lastH, backgroundColor: ink.thread }} /> : null}
      </View>
      <View style={styles.main}>
        <Pressable onPress={onFold} accessibilityRole="button" aria-expanded accessibilityHint={t('fb.fold')}>
          <Text style={[styles.name, { color: ink.text, fontFamily: ink.nameFont }]}>{comment.author.displayName}</Text>
          <Text style={[styles.body, { color: ink.text }]}>{comment.body}</Text>
        </Pressable>
        <Buttons postId={postId} comment={comment} canReply={level === 1} ink={ink} />
        {items.map((it, i) => (
          <View
            key={it.key}
            style={styles.child}
            onLayout={i === items.length - 1 ? (e) => setLastH(e.nativeEvent.layout.height) : undefined}>
            {/* The elbow: down from the thread line, curving in to this reply's picture. */}
            <View aria-hidden style={[styles.elbow, { left: -reach - LINE / 2, width: reach - 2, height: it.elbow, borderColor: ink.thread }]} />
            {it.node}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * A post's comments, Facebook style. Nothing when it has none. With only one, it shows whole;
 * with more, closed until tapped.
 */
export function FbComments({ card, ink, testID }: { card: Card; ink: FbInk; testID?: string }) {
  const { t } = useLocale();
  const { openPost } = useFeedHooks();
  const { top, kids, loaded } = usePostComments(card);
  const [shownTo, setShownTo] = useState(0);
  const first = top[0];
  if (!first) return null;
  const count = commentCount(card, top, kids);
  const fold = () => setShownTo(0);
  if (shownTo === 0 && count > 1)
    return <ClosedComments first={first} hidden={count - 1} ink={ink} onOpen={() => setShownTo(Math.min(FB_PAGE, top.length))} testID={testID} />;
  const shown = top.slice(0, Math.max(1, shownTo));
  const moreLoaded = shown.length < top.length;
  // The feed sends only the newest few; the rest open on the post's own page until they load.
  const moreElsewhere = !moreLoaded && !loaded && count > shown.length;
  return (
    <View style={styles.list} testID={testID}>
      {shown.map((c) => (
        <Row key={c.id} postId={card.id} comment={c} level={1} kids={kids} ink={ink} onFold={fold} />
      ))}
      {moreLoaded || moreElsewhere ? (
        <Pressable onPress={moreLoaded ? () => setShownTo(Math.min(shown.length + FB_PAGE, top.length)) : () => openPost(card.id)} accessibilityRole="button" style={styles.viewAll} testID={testID ? `${testID}-view-more` : undefined}>
          <Text style={[styles.viewAllText, { color: ink.muted }]}>{t('fb.viewMore')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  closed: { flexDirection: 'row', alignItems: 'center', gap: GAP, paddingVertical: 6 },
  more: { fontSize: 14, fontWeight: '700' },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontWeight: '700' },
  list: { gap: 10, paddingVertical: 6 },
  row: { flexDirection: 'row', gap: GAP },
  main: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 16, marginTop: 4, alignItems: 'center' },
  action: { fontSize: 13, fontWeight: '700' },
  child: { position: 'relative', paddingTop: 6 },
  elbow: { position: 'absolute', top: 0, borderLeftWidth: LINE, borderBottomWidth: LINE, borderBottomLeftRadius: 10 },
  viewAll: { paddingVertical: 6, minHeight: 28, justifyContent: 'center' },
  viewAllText: { fontSize: 13, fontWeight: '700' },
});

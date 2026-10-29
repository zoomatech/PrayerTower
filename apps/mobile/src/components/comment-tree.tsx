// Comment tree (behind Admin → Feed skins → "Comments as branches and leaves").
// Each comment is a leaf on a branch of the request. A branch shows a few
// leaves (comment_tree_leaves, 5 by default); the rest wait behind it as a
// faded blur ("12 more") until tapped, so a long thread reads as a full,
// quiet tree. Replies spread off a leaf as a side branch, but only to the
// third level (comment_tree_max_depth): after that, parallel leaves only, so a
// back-and-forth chain can't grow. For prayer and encouragement, not debate.
// Colors come from the member's vine skin. The tree reads top to bottom,
// present to past: the newest comment is the top leaf, and each comment sits
// inside a pointed leaf on a curving drawn vine (components/vine-flow.tsx);
// replies hang below their comment on the same side, on smaller leaves. On the
// Prayer Tower the leaves are stone tablets, and replies are smaller
// sub-tablets (leafShape 'tablet'). Reduced motion turns the growing off.
import type { Comment } from '@prayer-tower/shared';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

import { LeafFrame, VineRow, type VineSide } from '@/components/vine-flow';
import { LeafMark } from '@/layouts/motifs';
import type { vineTokens } from '@/layouts/vine';
import { useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

type Tokens = ReturnType<typeof vineTokens>;

export interface CommentTreeProps {
  comments: Comment[];
  tokens: Tokens;
  /** Leaves shown on each branch before the rest fade into a blur. */
  leavesShown: number;
  /** Deepest level that can still be replied to: 2 means three levels in all. */
  maxDepth: number;
  /** A shared link's comment: its branches open so it is in view. */
  highlightId: string | null;
  renderBody: (c: Comment, canReply: boolean) => ReactNode;
}


/** Group comments by parent, keeping thread order. Orphans hang from the request itself. */
export function branchesOf(comments: Comment[]) {
  const ids = new Set(comments.map((c) => c.id));
  const children = new Map<string | null, Comment[]>();
  for (const c of comments) {
    const key = c.parentId && ids.has(c.parentId) ? c.parentId : null;
    const list = children.get(key);
    if (list) list.push(c);
    else children.set(key, [c]);
  }
  return children;
}

/** Newest first: present to past. Ties keep the later comment on top. */
export function newestFirst(list: Comment[]) {
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.createdAt.localeCompare(a.c.createdAt) || b.i - a.i)
    .map((x) => x.c);
}

/** The comment and every comment above it, so their branches start open. */
function ancestorsOf(comments: Comment[], id: string | null) {
  const out = new Set<string | null>();
  if (!id) return out;
  const byId = new Map(comments.map((c) => [c.id, c]));
  let cur = byId.get(id);
  while (cur) {
    out.add(cur.parentId ?? null);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

function Leaf({ comment, depth, props, tree }: { comment: Comment; depth: number; props: CommentTreeProps; tree: Map<string | null, Comment[]> }) {
  const reduced = useReducedMotion();
  const grow = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return grow.setValue(1);
    Animated.spring(grow, {
      toValue: 1,
      friction: 8,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, [grow, reduced]);
  const { tokens } = props;
  const pointed = tokens.leafShape === 'pointed';
  const tablet = tokens.leafShape === 'tablet';
  const highlighted = comment.id === props.highlightId;
  return (
    <Animated.View
      style={{
        opacity: grow,
        transform: [
          {
            translateX: grow.interpolate({
              inputRange: [0, 1],
              outputRange: [-12, 0],
            }),
          },
        ],
      }}
      testID={`leaf-${comment.id}`}
    >
      <View style={styles.leafRow}>
        {/* The twig from the branch to this leaf, and the leaf itself. */}
        <View style={[styles.twig, { backgroundColor: depth === 0 ? tokens.stem : tokens.branch }]} />
        {tokens.leafShape === 'flower' || tokens.leafShape === 'star' ? (
          <View style={styles.markBox}>
            <LeafMark shape={tokens.leafShape} leaf={tokens.leaf} accent={tokens.tendril} size={depth > 0 ? 14 : 18} />
          </View>
        ) : (
          <View style={[styles.leafShape, tablet ? styles.tabletMark : pointed ? styles.pointed : styles.round, { backgroundColor: tokens.leaf }]} />
        )}
        <View
          style={[
            styles.body,
            {
              backgroundColor: highlighted ? colors.primarySoft : tokens.leafSoft,
              borderColor: tokens.leaf,
            },
            tablet && [styles.tablet, { borderColor: tokens.branch }, depth > 0 && styles.subTablet],
          ]}
        >
          {props.renderBody(comment, depth < props.maxDepth)}
        </View>
      </View>
      <Branch parentId={comment.id} depth={depth + 1} props={props} tree={tree} />
    </Animated.View>
  );
}

function Branch({ parentId, depth, props, tree }: { parentId: string | null; depth: number; props: CommentTreeProps; tree: Map<string | null, Comment[]> }) {
  const { t } = useLocale();
  const moreKey = props.tokens.leafShape === 'tablet' ? 'tree.moreTablets' : 'tree.more';
  const leaves = tree.get(parentId) ?? [];
  const opened = useMemo(() => ancestorsOf(props.comments, props.highlightId), [props.comments, props.highlightId]);
  const [open, setOpen] = useState(() => opened.has(parentId));
  if (!leaves.length) return null;
  const shown = open ? leaves : leaves.slice(0, props.leavesShown);
  const hidden = leaves.length - shown.length;
  return (
    <View
      style={[
        styles.branch,
        depth > 0 && {
          marginLeft: space.lg,
          borderLeftColor: props.tokens.branch,
        },
        depth === 0 && { borderLeftColor: props.tokens.stem },
      ]}
    >
      {shown.map((c) => (
        <Leaf key={c.id} comment={c} depth={depth} props={props} tree={tree} />
      ))}
      {hidden > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(moreKey, { count: hidden })}
          onPress={() => {
            // The hidden leaves shuffle forward out of the blur.
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setOpen(true);
          }}
          style={styles.blur}
          testID={`blur-${parentId ?? 'root'}`}
        >
          {/* Leaves fading back into the distance: a lot more than a handful. */}
          {[0.35, 0.22, 0.12].map((o, i) => (
            <View
              key={i}
              style={[
                styles.ghost,
                props.tokens.leafShape === 'tablet' && styles.ghostTablet,
                {
                  opacity: o,
                  backgroundColor: props.tokens.leaf,
                  left: i * 10,
                  top: i * 6,
                  transform: [{ rotate: `${(i - 1) * 6}deg` }],
                },
              ]}
            />
          ))}
          <Text style={styles.blurText}>{t(moreKey, { count: hidden })}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}


type Row =
  | { kind: 'leaf'; comment: Comment; depth: number; side: VineSide }
  | { kind: 'more'; parentId: string | null; count: number; depth: number; side: VineSide };

/** The tree as one top-to-bottom run of leaves: each comment, then its replies under it. */
export function vineRows(tree: Map<string | null, Comment[]>, open: Set<string | null>, leavesShown: number): Row[] {
  const rows: Row[] = [];
  const walk = (parentId: string | null, depth: number, parentSide: VineSide | null) => {
    const leaves = newestFirst(tree.get(parentId) ?? []);
    const shown = open.has(parentId) ? leaves : leaves.slice(0, leavesShown);
    shown.forEach((c, i) => {
      // Comments alternate sides down the vine; replies hang on their comment's side.
      const side: VineSide = parentSide ?? (i % 2 === 0 ? 'left' : 'right');
      rows.push({ kind: 'leaf', comment: c, depth: Math.min(depth, 2), side });
      walk(c.id, depth + 1, side);
    });
    if (leaves.length > shown.length) {
      const side: VineSide = parentSide ?? (shown.length % 2 === 0 ? 'left' : 'right');
      rows.push({ kind: 'more', parentId, count: leaves.length - shown.length, depth: Math.min(depth, 2), side });
    }
  };
  walk(null, 0, null);
  return rows;
}

function Grow({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const grow = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return grow.setValue(1);
    Animated.spring(grow, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }).start();
  }, [grow, reduced]);
  return <Animated.View style={{ opacity: grow, transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }}>{children}</Animated.View>;
}

function VineTree(props: CommentTreeProps) {
  const { t } = useLocale();
  const { tokens } = props;
  const tree = useMemo(() => branchesOf(props.comments), [props.comments]);
  const [open, setOpen] = useState(() => ancestorsOf(props.comments, props.highlightId));
  const rows = useMemo(() => vineRows(tree, open, props.leavesShown), [tree, open, props.leavesShown]);
  const mark = (depth: number) =>
    tokens.leafShape === 'flower' || tokens.leafShape === 'star' ? <LeafMark shape={tokens.leafShape} leaf={tokens.leaf} accent={tokens.tendril} size={depth > 0 ? 16 : 22} /> : undefined;
  return (
    <View testID="comment-tree">
      {rows.map((row, i) => {
        const from = i === 0 ? null : rows[i - 1]!.side;
        const gap = row.depth > 0 ? 28 : undefined;
        if (row.kind === 'more') {
          const key = `blur-${row.parentId ?? 'root'}`;
          return (
            <VineRow key={key} from={from} side={row.side} look={tokens} gap={gap} depth={row.depth} seed={i}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('tree.more', { count: row.count })}
                onPress={() => {
                  // The older leaves come forward out of the blur.
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setOpen((prev) => new Set(prev).add(row.parentId));
                }}
                style={[styles.vineBlur, row.side === 'left' ? styles.blurLeft : styles.blurRight]}
                testID={key}>
                {[0.35, 0.22, 0.12].map((o, k) => (
                  <View key={k} style={[styles.vineGhost, { opacity: o, backgroundColor: tokens.leaf, left: k * 14, top: k * 8, transform: [{ rotate: `${(k - 1) * 8}deg` }] }]} />
                ))}
                <Text style={styles.blurText}>{t('tree.more', { count: row.count })}</Text>
              </Pressable>
            </VineRow>
          );
        }
        const c = row.comment;
        return (
          <VineRow key={c.id} from={from} side={row.side} look={tokens} gap={gap} depth={row.depth} seed={i} testID={`leaf-${c.id}`}>
            <Grow>
              <LeafFrame side={row.side} look={tokens} depth={row.depth} highlighted={c.id === props.highlightId} mark={mark(row.depth)}>
                {props.renderBody(c, row.depth < props.maxDepth)}
              </LeafFrame>
            </Grow>
          </VineRow>
        );
      })}
    </View>
  );
}

export function CommentTree(props: CommentTreeProps) {
  const tree = useMemo(() => branchesOf(props.comments), [props.comments]);
  // Stone tablets on the Prayer Tower keep their stacked branches.
  if (props.tokens.leafShape !== 'tablet') return <VineTree {...props} />;
  return (
    <View testID="comment-tree">
      <Branch parentId={null} depth={0} props={props} tree={tree} />
    </View>
  );
}

const styles = StyleSheet.create({
  branch: { borderLeftWidth: 3, paddingLeft: space.sm, gap: space.sm },
  leafRow: { flexDirection: 'row', alignItems: 'flex-start' },
  twig: {
    width: 10,
    height: 3,
    marginTop: 18,
    marginLeft: -space.sm,
    borderRadius: 2,
  },
  leafShape: { width: 16, height: 10, marginTop: 14, marginRight: space.xs },
  round: { borderTopLeftRadius: 10, borderBottomRightRadius: 10 },
  pointed: {
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 10,
    borderTopLeftRadius: 1,
    borderBottomRightRadius: 1,
  },
  body: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.sm,
    gap: 2,
  },
  markBox: { marginTop: 10, marginRight: space.xs, width: 18, alignItems: 'center' },
  // A stone tablet: square corners at the foot, a rounded top, a heavier edge.
  tabletMark: { width: 12, height: 16, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderRadius: 1 },
  tablet: { borderWidth: 2, borderRadius: 4, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  // Replies are smaller sub-tablets.
  subTablet: { borderWidth: 1.5, paddingVertical: space.xs, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  blur: {
    height: 48,
    justifyContent: 'center',
    paddingLeft: 56,
    position: 'relative',
  },
  ghost: {
    position: 'absolute',
    width: 36,
    height: 22,
    borderTopLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  ghostTablet: { width: 26, height: 30, borderRadius: 3, borderTopLeftRadius: 13, borderTopRightRadius: 13 },
  blurText: { ...type.small, color: colors.text, fontWeight: '700' },
  vineBlur: { height: 56, justifyContent: 'center', paddingLeft: 64, width: '70%' },
  blurLeft: { alignSelf: 'flex-start' },
  blurRight: { alignSelf: 'flex-end' },
  vineGhost: { position: 'absolute', width: 44, height: 30, borderTopLeftRadius: 22, borderBottomRightRadius: 22, borderTopRightRadius: 3, borderBottomLeftRadius: 3 },
});

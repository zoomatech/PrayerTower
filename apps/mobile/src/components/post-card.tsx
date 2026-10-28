// The post card: identity line, script post-type label, urgency light, body
// with "more", tier icon, first/top comment, and the labeled action row.
// Layouts decide where a card goes; the card's content and action order never change.
import { ACTION_LABELS, POST_TYPE_LABELS, type Card, type CardAction } from '@prayer-tower/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '@/lib/theme';
import { CardMedia } from './media';

const TIER_ICONS: Record<string, string> = { prayer_scout: '🕊', prayerful_helper: '🙏', prayer_warrior: '🛡' };
const ACTION_ICONS: Record<CardAction, string> = {
  praying_now: '💜',
  commit: '🙏',
  encouragement: '✉️',
  well_wishes: '🤍',
  share: '↗',
  gift_tokens: '🎁',
};

export interface CardHandlers {
  onAction: (card: Card, action: CardAction) => void;
}

export function PostCard({ card, onAction, expanded: startExpanded = false }: { card: Card; expanded?: boolean } & CardHandlers) {
  const [expanded, setExpanded] = useState(startExpanded);
  const answered = card.state === 'answered';
  const open = () => router.push(`/post/${card.id}`);

  return (
    <View style={[styles.card, answered && styles.answered]}>
      {answered ? <Text style={styles.answeredBanner}>✨ Prayer answered</Text> : null}
      <View style={styles.header}>
        <View style={[styles.urgency, { backgroundColor: colors.urgency[card.urgency] ?? colors.urgency[0] }]} />
        <Text style={styles.author} numberOfLines={1}>
          {card.author.displayName}
          {card.author.tier ? ` ${TIER_ICONS[card.author.tier] ?? ''}` : ''}
        </Text>
        <Text style={type.script}>{POST_TYPE_LABELS[card.postType]}</Text>
      </View>

      <Pressable onPress={open} accessibilityRole="link">
        <Text style={type.body}>
          {expanded || !card.truncated ? card.body : `${card.preview}… `}
          {card.truncated && !expanded ? (
            <Text style={styles.more} onPress={() => setExpanded(true)}>
              more
            </Text>
          ) : null}
        </Text>
      </Pressable>

      <CardMedia media={card.media} expanded={expanded} />

      <Text style={styles.counts}>
        {card.counts.prayers > 0 ? `${card.counts.prayers} praying` : 'Be the first to pray'}
        {card.counts.commitments > 0 ? ` · ${card.counts.commitments} committed` : ''}
        {card.counts.encouragements > 0 ? ` · ${card.counts.encouragements} encouragements` : ''}
      </Text>

      <View style={styles.actions}>
        {card.actions.map((action) => {
          const active = action === 'commit' && !!card.myCommitment;
          return (
            <Pressable
              key={action}
              accessibilityRole="button"
              accessibilityLabel={ACTION_LABELS[action]}
              onPress={() => onAction(card, action)}
              style={({ pressed }) => [styles.action, active && styles.actionActive, pressed && { opacity: 0.6 }]}>
              <Text style={styles.actionIcon}>{ACTION_ICONS[action]}</Text>
              <Text style={[styles.actionLabel, active && { color: colors.primary }]} numberOfLines={1}>
                {active ? 'Committed' : ACTION_LABELS[action]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {card.topComment ? (
        <Pressable onPress={open} style={styles.comment}>
          <Text style={styles.commentAuthor}>
            {card.topComment.isUpdate ? 'Update · ' : ''}
            {card.topComment.author.displayName}
          </Text>
          <Text style={type.body} numberOfLines={3}>
            {card.topComment.body}
          </Text>
          {card.counts.comments > 1 ? <Text style={styles.more}>View all {card.counts.comments} comments</Text> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  answered: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  answeredBanner: { color: colors.gold, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  urgency: { width: 10, height: 10, borderRadius: 5 },
  author: { flex: 1, fontWeight: '700', fontSize: 16, color: colors.text },
  more: { color: colors.primary, fontWeight: '600' },
  counts: type.small,
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  action: {
    flexGrow: 1,
    flexBasis: '30%',
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  actionActive: { backgroundColor: colors.primarySoft },
  actionIcon: { fontSize: 18 },
  actionLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  comment: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md, gap: 2 },
  commentAuthor: { fontWeight: '700', color: colors.text, fontSize: 14 },
});

// The post card: identity line, script post-type label, urgency light, body
// with "more", tier icon, first/top comment, and the labeled action row.
// Layouts decide where a card goes; the card's content and action order never change.
import {
  ACTION_LABELS,
  isPrayable,
  POST_BACKGROUND_STYLES,
  POST_TYPE_LABELS,
  PRAYER_KIND_LABELS,
  PRAYER_REALM_LABELS,
  type Card,
  type CardAction,
} from '@prayer-tower/shared';
import { router } from 'expo-router';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';
import { CardMedia } from './media';
import { SparkleWords } from './sparkle-words';

const TIER_ICONS: Record<string, string> = { prayer_scout: '🕊', prayerful_helper: '🙏', prayer_warrior: '🛡' };
// Open Circle (neutral wording) uses icons without a religious meaning.
const NEUTRAL_ICONS: Record<string, string> = { prayerful_helper: '🤝', commit: '🤝' };
// What a screen reader says instead of the tier emoji.
const TIER_NAMES: Record<string, string> = { prayer_scout: 'Prayer Scout', prayerful_helper: 'Prayerful Helper', prayer_warrior: 'Prayer Warrior' };
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
  /** "Not for me": hide this post from my feed. */
  onHide?: (card: Card) => void;
}

// Memoized: a feed re-render (a prompt or highlights arriving) skips cards whose data didn't change.
export const PostCard = memo(function PostCard({ card, onAction, onHide, expanded: startExpanded = false }: { card: Card; expanded?: boolean } & CardHandlers) {
  const [expanded, setExpanded] = useState(startExpanded);
  const { t, label, n, wording } = useLocale();
  const icon = (key: string, icons: Record<string, string>) => (wording === 'neutral' ? NEUTRAL_ICONS[key] : undefined) ?? icons[key] ?? '';
  const features = useFeatures();
  const answered = card.state === 'answered';
  const open = () => router.push(`/post/${card.id}`);
  // A background shows only on short, text-only posts.
  const bg = card.media.length === 0 && card.background && card.body.length <= 280 ? POST_BACKGROUND_STYLES[card.background as keyof typeof POST_BACKGROUND_STYLES] : undefined;
  const tags = [
    label('prayerRealm', card.realm, PRAYER_REALM_LABELS[card.realm as keyof typeof PRAYER_REALM_LABELS]),
    label('prayerKind', card.kind, PRAYER_KIND_LABELS[card.kind as keyof typeof PRAYER_KIND_LABELS]),
  ].filter(Boolean);

  return (
    <View style={[styles.card, answered && styles.answered]}>
      {answered ? <Text style={styles.answeredBanner}>{t('card.answered')}</Text> : null}
      <View style={styles.header}>
        <View style={[styles.urgency, { backgroundColor: colors.urgency[card.urgency] ?? colors.urgency[0] }]} />
        <Text
          style={styles.author}
          numberOfLines={2}
          accessibilityLabel={card.author.tier && TIER_NAMES[card.author.tier] ? `${card.author.displayName}, ${n(TIER_NAMES[card.author.tier]!)}` : card.author.displayName}
          onPress={!card.author.anonymous && card.author.id && !card.isMine ? () => router.push(`/people/${card.author.id}`) : undefined}>
          {card.author.displayName}
          {card.author.tier ? ` ${icon(card.author.tier, TIER_ICONS)}` : ''}
        </Text>
        <Text style={type.script}>{label('postType', card.postType, POST_TYPE_LABELS[card.postType])}</Text>
        {onHide && !card.isMine ? (
          <Text style={styles.hide} onPress={() => onHide(card)} accessibilityRole="button" accessibilityLabel={t('card.hide')}>
            ✕
          </Text>
        ) : null}
      </View>

      {card.author.pastor ? (
        <Text style={styles.pastor} accessibilityLabel={t('card.pastorBadge', { title: card.author.pastor.title, church: card.author.pastor.church })}>
          ✝ {card.author.pastor.title} · {card.author.pastor.church}
        </Text>
      ) : null}
      {tags.length ? <Text style={styles.tags}>{tags.join(' · ')}</Text> : null}
      {card.allSupportWelcome && features.supportLabel ? <Text style={styles.tags}>🕊️ {t('notebook.supportLabel')}</Text> : null}

      <Pressable onPress={open} accessibilityRole="link" style={bg && [styles.backdrop, { backgroundColor: bg.color }]}>
        <Text style={bg ? [styles.backdropText, { color: bg.text }] : type.body}>
          {expanded || !card.truncated ? card.body : `${card.preview}… `}
          {card.truncated && !expanded ? (
            <Text style={styles.more} onPress={() => setExpanded(true)}>
              {t('card.more')}
            </Text>
          ) : null}
        </Text>
        {card.truncated && !expanded ? <SparkleWords body={card.body} /> : null}
      </Pressable>

      <CardMedia media={card.media} expanded={expanded} />

      {card.testimony ? (
        <View style={styles.testimony}>
          <Text style={styles.testimonyLabel}>{t('card.testimony')}</Text>
          <Text style={type.body} numberOfLines={expanded ? undefined : 4} onPress={open}>
            {card.testimony}
          </Text>
        </View>
      ) : null}

      <Text style={styles.counts}>
        {!isPrayable(card.postType)
          ? ''
          : card.counts.prayers > 0
            ? t('card.praying', { count: card.counts.prayers })
            : card.isMine
              ? t('post.prayed', { count: 0 })
              : card.postType === 'praise'
                ? ''
                : t('card.firstToPray')}
        {card.counts.commitments > 0 ? ` · ${t('card.committed', { count: card.counts.commitments })}` : ''}
        {card.counts.encouragements > 0 ? ` · ${t('card.encouragements', { count: card.counts.encouragements })}` : ''}
      </Text>

      <View style={styles.actions}>
        {card.actions.map((action) => {
          const active = action === 'commit' && !!card.myCommitment;
          return (
            <Pressable
              key={action}
              accessibilityRole="button"
              accessibilityLabel={label('action', action, ACTION_LABELS[action])}
              onPress={() => onAction(card, action)}
              style={({ pressed }) => [styles.action, active && styles.actionActive, pressed && { opacity: 0.6 }]}>
              <Text style={styles.actionIcon}>{icon(action, ACTION_ICONS)}</Text>
              {/* Two lines, so labels aren't cut off at large text sizes. */}
              <Text style={[styles.actionLabel, active && { color: colors.primary }]} numberOfLines={2}>
                {active ? t('card.committedLabel') : label('action', action, ACTION_LABELS[action])}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {card.topComment ? (
        <Pressable onPress={open} style={styles.comment} accessibilityRole="link" accessibilityHint={t('card.openHint')}>
          <Text style={styles.commentAuthor}>
            {card.topComment.isUpdate ? t('card.update') : ''}
            {card.topComment.author.displayName}
          </Text>
          <Text style={type.body} numberOfLines={3}>
            {card.topComment.body}
          </Text>
          {card.counts.comments > 1 ? <Text style={styles.more}>{t('card.viewAll', { count: card.counts.comments })}</Text> : null}
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  hide: { fontSize: 15, color: colors.textMuted, paddingHorizontal: space.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  answered: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  answeredBanner: { color: colors.goldText, fontWeight: '700' },
  testimony: { borderLeftWidth: 3, borderLeftColor: colors.gold, paddingLeft: space.md, gap: 2 },
  testimonyLabel: { color: colors.goldText, fontWeight: '700', fontSize: 13 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  urgency: { width: 10, height: 10, borderRadius: 5 },
  tags: { ...type.small, marginTop: -space.sm },
  pastor: { color: colors.primary, fontWeight: '600', fontSize: 13, marginTop: -space.sm },
  backdrop: { borderRadius: radius.md, minHeight: 160, padding: space.xl, justifyContent: 'center' },
  backdropText: { fontSize: 22, lineHeight: 30, fontWeight: '600', textAlign: 'center' },
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
  actionLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  comment: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md, gap: 2 },
  commentAuthor: { fontWeight: '700', color: colors.text, fontSize: 14 },
});

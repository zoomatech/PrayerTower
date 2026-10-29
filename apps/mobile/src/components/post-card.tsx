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
import { createContext, memo, useContext, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';
import { CardMedia } from './media';
import { SparkleWords } from './sparkle-words';
import { QuickReactionTray } from './quick-reactions';
import { UrgencyLight } from './urgency-light';
import { MeaningIcons } from './meaning-icon-row';

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
/** A feed skin can restyle the card's box (the drawn vine puts a smaller, greener box inside a leaf). */
export const CardSurface = createContext<ViewStyle | null>(null);

export const PostCard = memo(function PostCard({ card, onAction, onHide, expanded: startExpanded = false }: { card: Card; expanded?: boolean } & CardHandlers) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [tray, setTray] = useState(false);
  const [quick, setQuick] = useState({ candles: card.counts.candles ?? 0, standing: card.counts.standing ?? 0 });
  const { t, label, n, wording } = useLocale();
  const icon = (key: string, icons: Record<string, string>) => (wording === 'neutral' ? NEUTRAL_ICONS[key] : undefined) ?? icons[key] ?? '';
  const features = useFeatures();
  const surface = useContext(CardSurface);
  const lines = features.postLines;
  const answered = card.state === 'answered';
  const open = () => router.push(`/post/${card.id}`);
  // A background shows only on short, text-only posts.
  const bg = card.media.length === 0 && card.background && card.body.length <= 280 ? POST_BACKGROUND_STYLES[card.background as keyof typeof POST_BACKGROUND_STYLES] : undefined;
  const tags = [
    label('prayerRealm', card.realm, PRAYER_REALM_LABELS[card.realm as keyof typeof PRAYER_REALM_LABELS]),
    label('prayerKind', card.kind, PRAYER_KIND_LABELS[card.kind as keyof typeof PRAYER_KIND_LABELS]),
  ].filter(Boolean);

  const typeLabel = <Text style={type.script}>{label('postType', card.postType, POST_TYPE_LABELS[card.postType])}</Text>;

  return (
    <View style={[styles.card, answered && styles.answered, surface]}>
      {answered ? <Text style={styles.answeredBanner}>{t('card.answered')}</Text> : null}
      <View style={styles.header}>
        <UrgencyLight urgency={card.urgency} />
        <Text
          style={lines ? [styles.author, styles.authorShort] : styles.author}
          numberOfLines={2}
          accessibilityLabel={card.author.tier && TIER_NAMES[card.author.tier] ? `${card.author.displayName}, ${n(TIER_NAMES[card.author.tier]!)}` : card.author.displayName}
          onPress={!card.author.anonymous && card.author.id && !card.isMine ? () => router.push(`/people/${card.author.id}`) : undefined}>
          {card.author.town ? t('town.in', { name: card.author.displayName, town: card.author.town }) : card.author.displayName}
          {card.author.tier ? ` ${icon(card.author.tier, TIER_ICONS)}` : ''}
        </Text>
        {lines ? (
          // Mockups 1 and 2: the post type in script above a line extending from the name.
          <View style={styles.extender}>
            {typeLabel}
            <View style={styles.rule} />
          </View>
        ) : (
          typeLabel
        )}
        {onHide && !card.isMine ? (
          <Text style={styles.hide} onPress={() => onHide(card)} accessibilityRole="button" accessibilityLabel={t('card.hide')}>
            ✕
          </Text>
        ) : null}
      </View>

      {/* With the lines on, a line runs down the left of everything that belongs to this post. */}
      <View style={lines ? [styles.body, styles.bodyLine] : styles.body} testID={lines ? 'post-lines' : undefined}>
        {card.author.pastor ? (
          <Text style={styles.pastor} accessibilityLabel={t('card.pastorBadge', { title: card.author.pastor.title, church: card.author.pastor.church })}>
            ✝ {card.author.pastor.title} · {card.author.pastor.church}
          </Text>
        ) : null}
        {tags.length ? <Text style={styles.tags}>{tags.join(' · ')}</Text> : null}
        {card.lament && features.lament ? <Text style={styles.tags}>🕯️ {t('lament.tag')}</Text> : null}
        {card.allSupportWelcome && features.supportLabel ? <Text style={styles.tags}>🕊️ {t('notebook.supportLabel')}</Text> : null}

        <Pressable
          onPress={open}
          onLongPress={features.reactionTray ? () => setTray(true) : undefined}
          accessibilityRole="link"
          accessibilityActions={features.reactionTray ? [{ name: 'longpress', label: t('quick.tray') }] : undefined}
          onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && setTray(true)}
          style={bg && [styles.backdrop, { backgroundColor: bg.color }]}>
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

        {tray && features.reactionTray ? <QuickReactionTray card={card} onChange={setQuick} onClose={() => setTray(false)} /> : null}

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
          {features.reactionTray && quick.candles ? ` · 🕯️ ${quick.candles}` : ''}
          {features.reactionTray && quick.standing ? ` · ❤️ ${quick.standing}` : ''}
        </Text>

        {/* One row of icons in every design (Steve, 2026-10-29); the name shows on hover or a long press. */}
        <View style={styles.actions}>
          {card.actions.map((action) => {
            const active = action === 'commit' && !!card.myCommitment;
            return (
              <ActionIcon
                key={action}
                icon={icon(action, ACTION_ICONS)}
                label={active ? t('card.committedLabel') : label('action', action, ACTION_LABELS[action])}
                name={label('action', action, ACTION_LABELS[action])}
                active={active}
                onPress={() => onAction(card, action)}
              />
            );
          })}
          {/* Emoji meanings join the same row in every skin (off unless switched on). On the
              request's own page the full meaning tree with its leaves sits below instead. */}
          {startExpanded ? null : <MeaningIcons postId={card.id} postBody={card.body} />}
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
    </View>
  );
});

/** One action as an icon. Its name is its accessibility label and shows in a tip on hover (web, iPad pointer, Mac) or a long press. */
function ActionIcon({ icon: glyph, label: tip, name, active, onPress }: { icon: string; label: string; name: string; active: boolean; onPress: () => void }) {
  const [shown, setShown] = useState(false);
  return (
    <View style={styles.actionCell}>
      {shown ? (
        <View style={styles.tip} pointerEvents="none">
          <Text style={styles.tipText} numberOfLines={2}>
            {tip}
          </Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        onHoverIn={() => setShown(true)}
        onHoverOut={() => setShown(false)}
        onLongPress={() => {
          setShown(true);
          setTimeout(() => setShown(false), 1800);
        }}
        delayLongPress={350}
        hitSlop={4}
        style={({ pressed }) => [styles.action, active && styles.actionActive, pressed && { opacity: 0.6 }]}>
        {/* The icon is decoration; the button's name is the action's name. */}
        <Text style={styles.actionIcon} aria-hidden>
          {glyph}
        </Text>
      </Pressable>
    </View>
  );
}

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
  tags: { ...type.small, marginTop: -space.sm },
  pastor: { color: colors.primary, fontWeight: '600', fontSize: 13, marginTop: -space.sm },
  backdrop: { borderRadius: radius.md, minHeight: 160, padding: space.xl, justifyContent: 'center' },
  backdropText: { fontSize: 22, lineHeight: 30, fontWeight: '600', textAlign: 'center' },
  author: { flex: 1, fontWeight: '700', fontSize: 16, color: colors.text },
  authorShort: { flex: 0, flexShrink: 1 },
  extender: { flex: 1, minWidth: 64, alignItems: 'flex-end', alignSelf: 'flex-end', paddingBottom: 6 },
  rule: { alignSelf: 'stretch', height: 1, backgroundColor: colors.border },
  body: { gap: space.md },
  bodyLine: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: space.md, marginLeft: 4 },
  more: { color: colors.primary, fontWeight: '600' },
  counts: type.small,
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xs },
  actionCell: { flex: 1, alignItems: 'center', position: 'relative' },
  // 44 pt touch targets (Apple HIG).
  action: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.background },
  actionActive: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.primary },
  actionIcon: { fontSize: 20 },
  tip: { position: 'absolute', bottom: 50, zIndex: 10, minWidth: 90, maxWidth: 140, paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.text },
  tipText: { fontSize: 12, color: colors.surface, textAlign: 'center', fontWeight: '600' },
  comment: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md, gap: 2 },
  commentAuthor: { fontWeight: '700', color: colors.text, fontSize: 14 },
});

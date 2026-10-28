// Praying across lines (off unless an admin turns it on, and only for members who
// opt in on Me): one request a day from someone in another faith community.
import type { Card } from '@prayer-tower/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PostCard, type CardHandlers } from '@/components/post-card';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

export function AcrossCard({ onAction }: Pick<CardHandlers, 'onAction'>) {
  const { t } = useLocale();
  const { crossCommunity } = useFeatures();
  const { profile } = useAuth();
  const on = crossCommunity && !!profile?.open_to_other_communities;
  const [card, setCard] = useState<Card | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (on) api.across().then((r) => setCard(r.card), () => undefined);
    }, [on]),
  );
  if (!on || !card) return null;
  return (
    <View style={styles.box} accessibilityLabel={t('across.title')}>
      <Text style={type.heading}>🌉 {t('across.title')}</Text>
      <Text style={type.small}>{t('across.intro')}</Text>
      <PostCard card={card} onAction={onAction} />
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.sm } });

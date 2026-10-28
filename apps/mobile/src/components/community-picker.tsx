// Community choice on Me (Open Circle, 2026-10-28). Shown only when more than one
// community is open; switching changes the member's feed and, for Open Circle, the wording.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { api, type Community } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';
import { useT } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

export function CommunityPicker() {
  const t = useT();
  const { refreshProfile } = useAuth();
  const [mine, setMine] = useState<Community | null>(null);
  const [choices, setChoices] = useState<Community[]>([]);
  const [note, setNote] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      api
        .communities()
        .then((r) => {
          setMine(r.mine ?? null);
          setChoices(r.choices ?? []);
        })
        .catch(() => undefined);
    }, []),
  );
  // The Open Circle app has only its own community.
  if (env.edition === 'open-circle' || choices.length < 2) return null;
  const choose = (c: Community) =>
    api
      .chooseCommunity(c.slug)
      .then(async (r) => {
        setMine(r.community);
        setNote(t('profile.communitySaved', { name: r.community.name }));
        await refreshProfile();
      })
      .catch((e) => setNote((e as Error).message));
  return (
    <View style={styles.wrap} role="group" aria-label={t('profile.community')}>
      <Text style={type.heading}>{t('profile.community')}</Text>
      <Text style={type.small}>{t('profile.communityHint')}</Text>
      <View style={styles.chips}>
        {choices.map((c) => (
          <Chip key={c.slug} label={c.name} selected={mine?.slug === c.slug} onPress={() => choose(c)} />
        ))}
      </View>
      {note ? (
        <Text style={type.small} accessibilityLiveRegion="polite">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
});

// Admin: church partner applications. Check each church (website, phone,
// denomination directory) before verifying; verifying gives the applicant the
// pastor role and badge. Declining or revoking needs a note, which the pastor sees.
import type { ChurchForReview, ChurchStatus } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { staffOnly } from '@/components/staff-only';
import { Button, Chip, Empty, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const STATUSES: ChurchStatus[] = ['pending', 'verified', 'declined'];

function ChurchReview() {
  const { t } = useLocale();
  const [status, setStatus] = useState<ChurchStatus>('pending');
  const [churches, setChurches] = useState<ChurchForReview[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setChurches((await api.churchesForReview(status)).churches);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [status]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const decide = async (id: string, decision: 'verify' | 'decline' | 'revoke') => {
    setError(null);
    try {
      await api.decideChurch(id, decision, notes[id]?.trim() || undefined);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))} />
        <Text style={type.title}>{t('churchReview.title')}</Text>
        <Text style={type.body}>{t('churchReview.intro')}</Text>
        <View style={styles.row}>
          {STATUSES.map((s) => (
            <Chip key={s} label={t(`church.status.${s}`)} selected={status === s} onPress={() => setStatus(s)} />
          ))}
        </View>
        <ErrorText error={error} />
        {churches.length === 0 ? <Empty text={t('churchReview.empty')} /> : null}
        {churches.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={type.heading}>{c.name}</Text>
            <Text style={type.body}>
              {[c.denomination, [c.city, c.region, c.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
            </Text>
            <Text style={type.small}>
              {t('churchReview.applicant', { name: c.applicant.displayName, title: c.pastorTitle })}
              {c.applicant.email ? ` · ${c.applicant.email}` : ''}
            </Text>
            {c.website ? <Text style={styles.link}>{c.website}</Text> : null}
            {c.phone ? <Text style={type.small}>{c.phone}</Text> : null}
            {c.about ? <Text style={type.body}>{c.about}</Text> : null}
            {c.reviewNote ? <Text style={type.small}>{t('church.note', { note: c.reviewNote })}</Text> : null}
            {c.status !== 'declined' ? (
              <Field
                placeholder={c.status === 'pending' ? t('churchReview.notePlaceholder') : t('churchReview.revokePlaceholder')}
                value={notes[c.id] ?? ''}
                onChangeText={(v) => setNotes((n) => ({ ...n, [c.id]: v }))}
                maxLength={500}
              />
            ) : null}
            <View style={styles.row}>
              {c.status === 'pending' ? (
                <>
                  <Button small label={t('churchReview.verify')} onPress={() => decide(c.id, 'verify')} />
                  <Button small variant="secondary" label={t('churchReview.decline')} disabled={!notes[c.id]?.trim()} onPress={() => decide(c.id, 'decline')} />
                </>
              ) : null}
              {c.status === 'verified' ? (
                <Button small variant="secondary" label={t('churchReview.revoke')} disabled={!notes[c.id]?.trim()} onPress={() => decide(c.id, 'revoke')} />
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  link: { color: colors.primary },
});

export default staffOnly(ChurchReview, ['admin']);

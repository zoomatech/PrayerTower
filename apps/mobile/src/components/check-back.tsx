// Gentle "check back" on the asker's own open request: pick when to be reminded to share
// how it's going. Posting an update gives everyone who prayed a quiet heads-up.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { announce } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

const DAYS = [3, 7, 14] as const;

export function CheckBack({ postId }: { postId: string }) {
  const { checkBack } = useFeatures();
  const { t, language } = useLocale();
  const [dueAt, setDueAt] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!checkBack) return;
    let live = true;
    api.checkBack(postId).then(
      (r) => live && setDueAt(r.enabled ? r.dueAt : undefined),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [checkBack, postId]);

  if (!checkBack || dueAt === undefined) return null;
  const choose = (days: 3 | 7 | 14 | null) =>
    api.setCheckBack(postId, days).then(
      (r) => {
        setError(false);
        setDueAt(r.dueAt);
        announce(days ? t('checkBack.set') : t('checkBack.cleared'));
      },
      () => setError(true),
    );

  return (
    <View style={styles.card} testID="check-back">
      <Text style={type.heading} accessibilityRole="header">
        {t('checkBack.title')}
      </Text>
      {dueAt ? (
        <>
          <Text style={type.body}>{t('checkBack.due', { date: new Date(dueAt).toLocaleDateString(language, { weekday: 'long', month: 'long', day: 'numeric' }) })}</Text>
          <Button small variant="ghost" label={t('checkBack.cancel')} onPress={() => choose(null)} />
        </>
      ) : (
        <>
          <Text style={type.small}>{t('checkBack.hint')}</Text>
          <View style={styles.row} role="group" aria-label={t('checkBack.title')}>
            {DAYS.map((d) => (
              <Button key={d} small variant="secondary" label={t(`checkBack.days${d}`)} onPress={() => choose(d)} />
            ))}
          </View>
        </>
      )}
      {error ? <Text style={[type.small, { color: colors.danger }]}>{t('checkBack.error')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

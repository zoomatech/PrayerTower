// Your safety (docs/SAFETY_CENTER.md), off unless an admin turns it on: how to report,
// block, mute and hide, the people and posts you have blocked, muted or hidden (each
// with an undo), the reports you made, and where to get help. Same words in both
// editions.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CrisisSupport } from '@/components/crisis';
import { Button, ErrorText, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

type Safety = Awaited<ReturnType<typeof api.safetyCenter>>['safety'];

export default function SafetyScreen() {
  const { t } = useLocale();
  const [s, setS] = useState<Safety | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    Promise.resolve()
      .then(() => api.safetyCenter())
      .then((r) => setS(r.safety), (e) => setError((e as Error).message));
  }, []);
  useFocusEffect(load);
  const undo = (p: Promise<unknown>) => p.then(load, (e) => setError((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('safetyCenter.title')}</Text>
        <Text style={type.body}>{t('safetyCenter.intro')}</Text>
        <ErrorText error={error} onRetry={load} />

        <View style={styles.section}>
          <Text style={type.heading}>{t('safetyCenter.toolsTitle')}</Text>
          {(['report', 'block', 'mute', 'hide'] as const).map((k) => (
            <View key={k} style={styles.tool}>
              <Text style={type.body}>{t(`safetyCenter.tools.${k}.name`)}</Text>
              <Text style={type.small}>{t(`safetyCenter.tools.${k}.how`)}</Text>
            </View>
          ))}
        </View>

        {!s && !error ? <Loading /> : null}
        {s ? (
          <>
            <List title={t('safetyCenter.blocked')} empty={t('safetyCenter.noneBlocked')}>
              {s.blocks.map((b) => (
                <Row key={b.id} label={b.displayName} action={t('safetyCenter.unblock')} onPress={() => undo(api.unblock(b.id))} />
              ))}
            </List>
            <List title={t('safetyCenter.muted')} empty={t('safetyCenter.noneMuted')}>
              {s.mutes.map((m) => (
                <Row key={m.id} label={m.displayName} action={t('safetyCenter.unmute')} onPress={() => undo(api.unmute(m.id))} />
              ))}
            </List>
            <List title={t('safetyCenter.hidden')} empty={t('safetyCenter.noneHidden')}>
              {s.hidden.map((h) => (
                <Row key={h.id} label={h.excerpt} action={t('safetyCenter.unhide')} onPress={() => undo(api.unhidePost(h.id))} />
              ))}
            </List>
            <List title={t('safetyCenter.reports')} empty={t('safetyCenter.noneReports')}>
              {s.reports.map((r) => (
                <Text key={r.id} style={type.small}>
                  {t('safetyCenter.reportRow', {
                    what: t(`safetyCenter.kinds.${r.targetType}`, { defaultValue: r.targetType }),
                    when: new Date(r.createdAt).toLocaleDateString(),
                    status: r.reviewed ? t('safetyCenter.reviewed') : t('safetyCenter.waiting'),
                  })}
                </Text>
              ))}
            </List>
          </>
        ) : null}

        <View style={styles.section}>
          <Text style={type.heading}>{t('safetyCenter.helpTitle')}</Text>
          <Text style={type.body}>{t('safetyCenter.danger')}</Text>
          <CrisisSupport />
        </View>
      </ScrollView>
    </Screen>
  );
}

function List({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{title}</Text>
      {children.length ? children : <Text style={type.small}>{empty}</Text>}
    </View>
  );
}

function Row({ label, action, onPress }: { label: string; action: string; onPress: () => void }) {
  return (
    <View style={styles.row}>
      <Text style={[type.body, { flex: 1 }]} numberOfLines={2}>
        {label}
      </Text>
      <Button small variant="secondary" label={action} onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  tool: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});

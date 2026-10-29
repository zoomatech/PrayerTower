// Auto-Pray (off unless an admin turns it on): the person who asked can have an AI
// write a short prayer for their request on a schedule. AI prayers are labeled and
// counted apart from prayers by people, and never earn tokens.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Toggle } from '@/components/ui';
import { api, type AiPrayers as Status } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

export function AiPrayers({ postId }: { postId: string }) {
  const { t } = useLocale();
  const [status, setStatus] = useState<Status | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => {
    api.aiPrayers(postId).then(setStatus).catch(() => setStatus(null));
  }, [postId]);
  useEffect(load, [load]);

  if (!status?.enabled || (!status.isMine && status.count === 0)) return null;
  const set = (on: boolean) =>
    api.setAutoPray(postId, on).then(setStatus, (e) => setNote((e as Error).message));
  return (
    <View style={styles.section} role="group" aria-label={t('aiPrayers.heading')}>
      <Text style={type.heading}>{t('aiPrayers.heading', { count: status.count })}</Text>
      <Text style={type.small}>{t('aiPrayers.label')}</Text>
      {status.isMine ? <Toggle label={t('aiPrayers.toggle')} hint={t('aiPrayers.hint')} value={status.optedIn} onChange={set} /> : null}
      {status.prayers.map((p) => (
        <Text key={p.id} style={type.body}>
          {p.body}
        </Text>
      ))}
      {note ? <Text style={type.small} accessibilityLiveRegion="polite">{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
});

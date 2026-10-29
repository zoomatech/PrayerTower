// Lamp awards (off unless an admin turns them on): thank someone with a short note,
// like Wikipedia's barnstar. Recognition only: a lamp carries no tokens.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { api, type Lamps as Status } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

export function Lamps({ personId, name }: { personId: string; name: string }) {
  const { t } = useLocale();
  const [status, setStatus] = useState<Status | null>(null);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(() => {
    api.lamps(personId).then(setStatus).catch(() => setStatus(null));
  }, [personId]);
  useEffect(load, [load]);

  if (!status?.enabled) return null;
  const give = () =>
    api.giveLamp(personId, note.trim()).then(
      () => {
        setNote('');
        setOpen(false);
        setMessage(t('lamps.given', { name }));
        load();
      },
      (e) => setMessage((e as Error).message),
    );
  return (
    <View style={styles.section} role="group" aria-label={t('lamps.heading', { count: status.count })}>
      <Text style={type.heading}>{t('lamps.heading', { count: status.count })}</Text>
      {status.lamps.map((l) => (
        <Text key={l.id} style={type.body}>
          “{l.note}” · {l.giverName}
        </Text>
      ))}
      {status.canGive && status.leftThisWeek > 0 ? (
        open ? (
          <>
            <Field label={t('lamps.note')} value={note} onChangeText={setNote} maxLength={280} multiline />
            <Button small label={t('lamps.give')} disabled={!note.trim()} onPress={give} />
          </>
        ) : (
          <Button small variant="secondary" label={t('lamps.giveTo', { name })} onPress={() => setOpen(true)} />
        )
      ) : null}
      {status.canGive ? <Text style={type.small}>{t('lamps.left', { count: status.leftThisWeek })}</Text> : null}
      {message ? <Text style={type.small} accessibilityLiveRegion="polite">{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
});

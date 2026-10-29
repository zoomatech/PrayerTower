// Gifts to a prayer group or a meet-up (Business Plan 6.2), off unless an admin turns it
// on. Tokens are split evenly among the others there; any remainder stays with the giver.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';
import { errorText } from '@/lib/error-report';

export function GroupGift({ target, id }: { target: 'group' | 'event'; id: string }) {
  const { t } = useLocale();
  const [recipients, setRecipients] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve()
      .then(() => api.groupGiftInfo(target, id))
      .then((r) => setRecipients(r?.enabled ? r.recipients : null), () => setRecipients(null));
  }, [target, id]);

  if (recipients === null || recipients === 0) return null;
  const n = Number.parseInt(amount, 10);
  const each = Number.isFinite(n) ? Math.floor(n / recipients) : 0;
  const give = () =>
    api.giveToGroup(target, id, n).then(
      (r) => {
        setOpen(false);
        setAmount('');
        setNote(t('groupGift.done', { each: r.each, count: r.recipients }));
      },
      (e) => setNote(errorText(e)),
    );

  return (
    <View style={styles.box}>
      {open ? (
        <>
          <Field label={t('groupGift.amount')} value={amount} onChangeText={setAmount} keyboardType="number-pad" maxLength={6} />
          <Text style={type.small}>{each >= 1 ? t('groupGift.split', { each, count: recipients }) : t('groupGift.atLeast', { count: recipients })}</Text>
          <Button small label={t('groupGift.give')} disabled={each < 1} onPress={give} />
        </>
      ) : (
        <Button small variant="secondary" label={target === 'group' ? t('groupGift.openGroup') : t('groupGift.openEvent')} onPress={() => setOpen(true)} />
      )}
      {note ? <Text style={type.small} accessibilityLiveRegion="polite">{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.xs } });

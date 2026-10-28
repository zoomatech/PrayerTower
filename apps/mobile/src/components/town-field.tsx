// Optional town on Me ("Carol in Albuquerque"), while an admin has the "Town on profiles"
// switch on. Only members of the same community see it; empty clears it.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

export function TownField({ town, onSave }: { town: string | null | undefined; onSave: (town: string | null) => Promise<void> }) {
  const { t } = useLocale();
  const [value, setValue] = useState(town ?? '');
  const [saved, setSaved] = useState(false);
  const changed = value.trim() !== (town ?? '');
  const save = () => onSave(value.trim() || null).then(() => setSaved(true));
  return (
    <View style={styles.box}>
      <Field label={t('town.label')} value={value} maxLength={60} textContentType="addressCity" onChangeText={(v) => { setValue(v); setSaved(false); }} onSubmitEditing={save} />
      <Text style={type.small}>{t('town.hint')}</Text>
      {changed ? <Button small variant="secondary" label={t('town.save')} onPress={save} /> : null}
      {saved && !changed ? <Text style={type.small} accessibilityLiveRegion="polite">{t('town.saved')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.xs } });

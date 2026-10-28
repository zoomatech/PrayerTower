// Language choice: follow the phone, or pick English or Español. Saved on this device.
import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { env } from '@/lib/env';
import { LANGUAGES, useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

/** Hidden while the app is English only (env.spanish off). */
export function LanguagePicker({ heading = true }: { heading?: boolean }) {
  const { choice, setChoice, t } = useLocale();
  if (!env.spanish) return null;
  return (
    <View style={styles.wrap} role="group" aria-label={t('language.heading')}>
      {heading ? <Text style={type.heading}>{t('language.heading')}</Text> : null}
      <View style={styles.chips}>
        <Chip label={t('language.system')} selected={choice === 'system'} onPress={() => setChoice('system')} />
        {LANGUAGES.map((l) => (
          <Chip key={l.code} label={l.name} selected={choice === l.code} onPress={() => setChoice(l.code)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
});

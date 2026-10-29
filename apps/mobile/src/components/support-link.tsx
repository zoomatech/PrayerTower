// Optional outside support link (off unless an admin turns it on): a member links their
// own Ko-fi, Patreon or similar page, so money stays outside the community.
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';
import { errorText } from '@/lib/error-report';

/** On Me: set or clear the link. */
export function SupportLinkField({ url, onSave }: { url: string | null | undefined; onSave: (url: string | null) => Promise<void> }) {
  const { t } = useLocale();
  const [value, setValue] = useState(url ?? '');
  const [note, setNote] = useState<string | null>(null);
  const changed = value.trim() !== (url ?? '');
  const save = () =>
    onSave(value.trim() || null).then(
      () => setNote(t('supportLink.saved')),
      (e) => setNote(errorText(e)),
    );
  return (
    <View style={styles.box}>
      <Field
        label={t('supportLink.label')}
        value={value}
        maxLength={200}
        autoCapitalize="none"
        keyboardType="url"
        placeholder="https://ko-fi.com/yourname"
        onChangeText={(v) => {
          setValue(v);
          setNote(null);
        }}
      />
      <Text style={type.small}>{t('supportLink.hint')}</Text>
      {changed ? <Button small variant="secondary" label={t('supportLink.save')} onPress={save} /> : null}
      {note ? <Text style={type.small} accessibilityLiveRegion="polite">{note}</Text> : null}
    </View>
  );
}

/** On someone's profile: open their page outside the app. */
export function SupportLinkButton({ url, name }: { url: string; name: string }) {
  const { t } = useLocale();
  return (
    <Button
      variant="ghost"
      label={t('supportLink.open', { name, host: new URL(url).hostname.replace(/^www\./, '') })}
      onPress={() => void WebBrowser.openBrowserAsync(url)}
    />
  );
}

const styles = StyleSheet.create({ box: { gap: space.xs } });

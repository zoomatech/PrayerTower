// Staff: feature a Macro Need (a disaster or other large need) above the feed,
// with prayer and material-help options. Partner links are chosen by staff.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { staffOnly } from '@/components/staff-only';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { api, type MacroNeed } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const BLANK = { label: '', url: '' };

function MacroNeedsScreen() {
  const [needs, setNeeds] = useState<MacroNeed[]>([]);
  const [title, setTitle] = useState('');
  const { t } = useLocale();
  const [body, setBody] = useState('');
  const [options, setOptions] = useState([BLANK, BLANK, BLANK]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.macroNeeds().then((r) => setNeeds(r.needs), (e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const helpOptions = options.filter((o) => o.label.trim() && o.url.trim()).map((o) => ({ label: o.label.trim(), url: o.url.trim() }));
      await api.createMacroNeed({ title: title.trim(), body: body.trim(), helpOptions });
      setTitle('');
      setBody('');
      setOptions([BLANK, BLANK, BLANK]);
      setSaved(t('macroAdmin.saved'));
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('profile.macroNeeds')}</Text>
        <Text style={type.body}>{t('macroAdmin.intro')}</Text>
        <ErrorText error={error} />
        {saved ? <Text style={type.small}>{saved}</Text> : null}

        <View style={styles.card}>
          <Field label={t('macroAdmin.title')} value={title} onChangeText={setTitle} maxLength={100} placeholder={t('macroAdmin.titlePlaceholder')} />
          <Field label={t('macroAdmin.body')} value={body} onChangeText={setBody} maxLength={2000} multiline />
          <Text style={type.small}>{t('macroAdmin.partners')}</Text>
          {options.map((o, i) => (
            <View key={i} style={styles.row}>
              <Field
                placeholder={t('macroAdmin.partnerName')}
                value={o.label}
                onChangeText={(label) => setOptions((all) => all.map((x, j) => (j === i ? { ...x, label } : x)))}
                maxLength={60}
              />
              <Field
                placeholder="https://..."
                value={o.url}
                autoCapitalize="none"
                onChangeText={(url) => setOptions((all) => all.map((x, j) => (j === i ? { ...x, url } : x)))}
              />
            </View>
          ))}
          <Button label={t('macroAdmin.feature')} busy={busy} disabled={!title.trim() || !body.trim()} onPress={create} />
        </View>

        <Text style={type.heading}>{t('macroAdmin.featured')}</Text>
        {needs.length === 0 ? <Text style={type.small}>{t('macroAdmin.none')}</Text> : null}
        {needs.map((n) => (
          <View key={n.id} style={styles.card}>
            <Text style={styles.name}>{n.title}</Text>
            <Text style={type.small}>
              {t('macroAdmin.stats', { prayers: n.prayers, tokens: n.tokens, helpers: n.helpers })}
            </Text>
            <Button small variant="ghost" label={t('macroAdmin.stop')} onPress={() => api.endMacroNeed(n.id).then(load, (e) => setError((e as Error).message))} />
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  row: { gap: space.xs },
  name: { fontWeight: '700', color: colors.text, fontSize: 16 },
});

export default staffOnly(MacroNeedsScreen, ['moderator', 'admin']);

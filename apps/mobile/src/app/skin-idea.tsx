// Me → Suggest a feed skin (behind Admin → Feed skins → "Members can suggest
// skins"). A member names a look for the feed, picks vine or wall and three
// colors; admins approve it into a beta skin anyone in the community can choose.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Empty, ErrorText, Field, Screen } from '@/components/ui';
import { api, type ThemeProposal } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const HEX = /^#[0-9A-Fa-f]{6}$/;

export default function SkinIdea() {
  const { t } = useLocale();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [layout, setLayout] = useState<'vine' | 'wall'>('vine');
  const [stem, setStem] = useState('#6E8B4E');
  const [leaf, setLeaf] = useState('#A9C08A');
  const [backdrop, setBackdrop] = useState('#F6FBF1');
  const [mine, setMine] = useState<ThemeProposal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(() => {
    api
      .myThemeProposals()
      .then((r) => setMine(r.proposals))
      .catch(() => undefined);
  }, []);
  useFocusEffect(load);

  const colorsOk = [stem, leaf, backdrop].every((c) => HEX.test(c));
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.proposeTheme({
        name: name.trim(),
        description: description.trim(),
        layout,
        colors: { stem, leaf, backdrop },
      });
      setSent(true);
      setName('');
      setDescription('');
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
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
        <Text style={type.title}>{t('skinIdea.title')}</Text>
        <Text style={type.body}>{t('skinIdea.intro')}</Text>
        <ErrorText error={error} />
        {sent ? <Text style={styles.sent}>{t('skinIdea.sent')}</Text> : null}
        <Field label={t('skinIdea.name')} value={name} onChangeText={setName} maxLength={40} />
        <Field label={t('skinIdea.description')} value={description} onChangeText={setDescription} multiline maxLength={500} />
        <View style={styles.row}>
          <Chip radio label={t('skinIdea.vine')} selected={layout === 'vine'} onPress={() => setLayout('vine')} />
          <Chip radio label={t('skinIdea.wall')} selected={layout === 'wall'} onPress={() => setLayout('wall')} />
        </View>
        {layout === 'vine' ? (
          <>
            <Field label={t('skinIdea.stem')} value={stem} onChangeText={setStem} autoCapitalize="none" maxLength={7} />
            <Field label={t('skinIdea.leaf')} value={leaf} onChangeText={setLeaf} autoCapitalize="none" maxLength={7} />
          </>
        ) : null}
        <Field label={t('skinIdea.backdrop')} value={backdrop} onChangeText={setBackdrop} autoCapitalize="none" maxLength={7} />
        {/* A small preview of the colors as they would sit on the feed. */}
        {colorsOk ? (
          <View style={[styles.preview, { backgroundColor: backdrop }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {layout === 'vine' ? <View style={[styles.previewStem, { backgroundColor: stem }]} /> : null}
            {layout === 'vine' ? <View style={[styles.previewLeaf, { backgroundColor: leaf }]} /> : null}
            <View style={styles.previewCard} />
          </View>
        ) : (
          <Text style={type.small}>{t('skinIdea.colorHint')}</Text>
        )}
        <Button label={t('skinIdea.send')} onPress={submit} busy={busy} disabled={name.trim().length < 2 || !description.trim() || !colorsOk} />

        <Text style={type.heading}>{t('skinIdea.yours')}</Text>
        {mine.length === 0 ? <Empty text={t('skinIdea.none')} /> : null}
        {mine.map((p) => (
          <View key={p.id} style={styles.card}>
            <Text style={styles.cardTitle}>{p.name}</Text>
            <Text style={type.small}>{t(`skinIdea.status.${p.status}`)}</Text>
            {p.reviewNote ? <Text style={type.small}>{p.reviewNote}</Text> : null}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 80 },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  sent: { ...type.body, color: colors.primary, fontWeight: '700' },
  preview: {
    height: 120,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  previewStem: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 6,
    marginLeft: -3,
  },
  previewLeaf: {
    position: 'absolute',
    left: '50%',
    top: 30,
    width: 34,
    height: 18,
    borderTopLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  previewCard: {
    alignSelf: 'flex-end',
    width: '45%',
    height: 60,
    marginRight: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.md,
    gap: 2,
  },
  cardTitle: { ...type.body, fontWeight: '700' },
});

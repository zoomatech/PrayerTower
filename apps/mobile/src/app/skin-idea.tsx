// Me → Make your own feed skin: the theme maker (behind Admin → Feed skins →
// "Members can make their own skins"). A member picks a layout (growing vine,
// full-screen wall, tower or neon circuit), colors, a leaf or comment shape,
// the stem and a backdrop, and sees a live preview. The skin is theirs to use
// in Feed style at once; everyone else can choose it once an admin approves it.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Empty, ErrorText, Field, Screen, Toggle } from '@/components/ui';
import { glow, LeafMark } from '@/layouts/motifs';
import { api, type MakerLayout, type ThemeProposal } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const LAYOUTS: MakerLayout[] = ['vine', 'wall', 'tower', 'circuit'];
const SHAPES = ['round', 'pointed', 'flower', 'star', 'tablet'] as const;
const WIDTHS = [3, 5, 9] as const;

/** Which colors each layout uses, with a starting value. */
const COLOR_FIELDS: Record<MakerLayout, { key: string; start: string }[]> = {
  vine: [
    { key: 'stem', start: '#6E8B4E' },
    { key: 'leaf', start: '#A9C08A' },
    { key: 'leafSoft', start: '#EEF3E6' },
    { key: 'backdrop', start: '#F6FBF1' },
  ],
  wall: [{ key: 'backdrop', start: '#101418' }],
  tower: [
    { key: 'stone', start: '#B9AE9C' },
    { key: 'mortar', start: '#8F8574' },
    { key: 'backdrop', start: '#EAF2F8' },
  ],
  circuit: [
    { key: 'wire', start: '#00E5FF' },
    { key: 'screen', start: '#FF2BD6' },
    { key: 'backdrop', start: '#05070D' },
  ],
};

function Preview({ layout, c, shape, width, double, glowing }: { layout: MakerLayout; c: Record<string, string>; shape: string; width: number; double: boolean; glowing: boolean }) {
  const ok = (k: string) => (HEX.test(c[k] ?? '') ? c[k]! : colors.border);
  const card = <View style={styles.previewCard} />;
  return (
    <View style={[styles.preview, { backgroundColor: ok('backdrop') }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="maker-preview">
      {layout === 'vine' ? (
        <>
          {double ? (
            <View style={[styles.previewStem, { width: width * 3, marginLeft: -(width * 3) / 2, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: ok('stem') }]} />
          ) : (
            <View style={[styles.previewStem, { width, marginLeft: -width / 2, backgroundColor: ok('stem') }, glowing && glow(ok('stem'), 10)]} />
          )}
          <View style={styles.previewLeaf}>
            {shape === 'flower' || shape === 'star' ? (
              <LeafMark shape={shape} leaf={ok('leaf')} accent={ok('stem')} size={26} />
            ) : (
              <View style={[styles.leafPlain, shape === 'pointed' && styles.leafPointed, shape === 'tablet' && styles.leafTablet, { backgroundColor: ok('leaf') }]} />
            )}
          </View>
          <View style={[styles.previewCardBox, { alignSelf: 'flex-end' }]}>{card}</View>
          <View style={[styles.previewComment, { backgroundColor: ok('leafSoft'), borderColor: ok('leaf') }]} />
        </>
      ) : layout === 'tower' ? (
        <>
          <View style={[styles.pillar, { left: 0, backgroundColor: ok('stone'), borderColor: ok('mortar') }]} />
          <View style={[styles.pillar, { right: 0, backgroundColor: ok('stone'), borderColor: ok('mortar') }]} />
          <Text style={styles.climber}>🧗</Text>
          <View style={[styles.previewCardBox, { alignSelf: 'center' }]}>{card}</View>
        </>
      ) : layout === 'circuit' ? (
        <>
          <View style={[styles.wire, { backgroundColor: ok('wire') }, glow(ok('wire'), 6)]} />
          <View style={[styles.screen, { borderColor: ok('screen') }, glow(ok('screen'), 10), { transform: [{ perspective: 600 }, { rotateY: '10deg' }] }]}>{card}</View>
        </>
      ) : (
        <View style={[styles.previewCardBox, { alignSelf: 'center', width: '80%' }]}>{card}</View>
      )}
    </View>
  );
}

export default function ThemeMaker() {
  const { t } = useLocale();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [layout, setLayout] = useState<MakerLayout>('vine');
  // Each layout keeps its own colors, so switching layouts doesn't carry one's backdrop into another.
  const [all, setAll] = useState<Record<MakerLayout, Record<string, string>>>(
    () => Object.fromEntries(LAYOUTS.map((l) => [l, Object.fromEntries(COLOR_FIELDS[l].map((f) => [f.key, f.start]))])) as Record<MakerLayout, Record<string, string>>,
  );
  const [shape, setShape] = useState<(typeof SHAPES)[number]>('round');
  const [width, setWidth] = useState<number>(5);
  const [double, setDouble] = useState(false);
  const [glowing, setGlowing] = useState(false);
  const [fairytale, setFairytale] = useState(false);
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

  const fields = COLOR_FIELDS[layout];
  const c = all[layout];
  const colorsOk = fields.every((f) => HEX.test(c[f.key] ?? ''));
  const tokens = useMemo(() => {
    const out: Record<string, string | number | boolean> = Object.fromEntries(fields.map((f) => [f.key, c[f.key]!]));
    if (layout === 'vine') Object.assign(out, { branch: c.stem!, tendril: c.stem!, leafShape: shape, stemWidth: width, stemDouble: double, stemGlow: glowing, scenery: fairytale ? 'fairytale' : '' });
    if (layout === 'circuit') out.tilt = 10;
    return out;
  }, [fields, c, layout, shape, width, double, glowing, fairytale]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.proposeTheme({ name: name.trim(), description: description.trim(), layout, tokens });
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

        <Text style={type.heading}>{t('skinIdea.layoutHeading')}</Text>
        <View style={styles.row}>
          {LAYOUTS.map((l) => (
            <Chip key={l} radio label={t(`skinIdea.layout.${l}`)} selected={layout === l} onPress={() => setLayout(l)} />
          ))}
        </View>

        <Preview layout={layout} c={c} shape={shape} width={width} double={double} glowing={glowing} />

        <Text style={type.heading}>{t('skinIdea.colorsHeading')}</Text>
        {fields.map((f) => (
          <View key={f.key} style={styles.colorRow}>
            <View style={[styles.swatch, { backgroundColor: HEX.test(c[f.key] ?? '') ? c[f.key] : 'transparent' }]} />
            <View style={{ flex: 1 }}>
              <Field label={t(`skinIdea.color.${f.key}`)} value={c[f.key] ?? ''} onChangeText={(v) => setAll((prev) => ({ ...prev, [layout]: { ...prev[layout], [f.key]: v } }))} autoCapitalize="none" maxLength={7} />
            </View>
          </View>
        ))}
        {!colorsOk ? <Text style={type.small}>{t('skinIdea.colorHint')}</Text> : null}

        {layout === 'vine' ? (
          <>
            <Text style={type.heading}>{t('skinIdea.shapeHeading')}</Text>
            <View style={styles.row}>
              {SHAPES.map((sh) => (
                <Chip key={sh} radio label={t(`skinIdea.shape.${sh}`)} selected={shape === sh} onPress={() => setShape(sh)} />
              ))}
            </View>
            <Text style={type.heading}>{t('skinIdea.stemHeading')}</Text>
            <View style={styles.row}>
              {WIDTHS.map((w, i) => (
                <Chip key={w} radio label={t(`skinIdea.width.${i}`)} selected={width === w} onPress={() => setWidth(w)} />
              ))}
            </View>
            <Toggle label={t('skinIdea.double')} value={double} onChange={setDouble} />
            <Toggle label={t('skinIdea.glow')} value={glowing} onChange={setGlowing} />
            <Toggle label={t('skinIdea.fairytale')} hint={t('skinIdea.fairytaleHint')} value={fairytale} onChange={setFairytale} />
          </>
        ) : null}

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
  preview: { height: 170, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', justifyContent: 'center', padding: space.md },
  previewStem: { position: 'absolute', left: '50%', top: 0, bottom: 0 },
  previewLeaf: { position: 'absolute', left: '50%', top: 26, marginLeft: 6 },
  leafPlain: { width: 34, height: 18, borderTopLeftRadius: 18, borderBottomRightRadius: 18 },
  leafPointed: { borderTopLeftRadius: 2, borderBottomRightRadius: 2, borderTopRightRadius: 18, borderBottomLeftRadius: 18 },
  leafTablet: { width: 16, height: 22, borderRadius: 2, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  previewCardBox: { width: '42%' },
  previewCard: { height: 64, borderRadius: radius.md, backgroundColor: colors.surface },
  previewComment: { position: 'absolute', left: space.md, bottom: space.md, width: '38%', height: 26, borderRadius: radius.md, borderWidth: 1 },
  pillar: { position: 'absolute', top: 0, bottom: 0, width: 16, borderWidth: 1 },
  climber: { position: 'absolute', right: 0, top: '40%', fontSize: 24 },
  wire: { position: 'absolute', left: 14, top: 0, bottom: 0, width: 2 },
  screen: { marginLeft: 40, width: '60%', borderWidth: 2, borderRadius: radius.md, padding: 4, backgroundColor: '#0E1220' },
  colorRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space.md, gap: 2 },
  cardTitle: { ...type.body, fontWeight: '700' },
});

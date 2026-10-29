// Me → Make your own feed skin: the theme maker (behind Admin → Feed skins →
// "Members can make their own skins"). A member picks a layout (growing vine,
// full-screen wall, tower or neon circuit), colors, a leaf or comment shape,
// the stem and a backdrop, and sees a live preview. The skin is theirs to use
// in Feed style at once; everyone else can choose it once an admin approves it.
import { COMMENT_TEXT, contrastRatio } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { SkinPreview } from '@/components/skin-preview';
import { Button, Chip, Empty, ErrorText, Field, Screen, Toggle } from '@/components/ui';
import { api, type MakerLayout, type ThemeProposal } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { breakpoints, colors, radius, space, type } from '@/lib/theme';

const HEX = /^#[0-9A-Fa-f]{6}$/;
const LAYOUTS: MakerLayout[] = ['vine', 'wall', 'tower', 'circuit'];
const SHAPES = ['round', 'pointed', 'flower', 'star', 'tablet'] as const;
const WIDTHS = [3, 5, 9] as const;
/** How the vine is drawn (components/vine-flow.tsx); '' is the plain swaying stalk. */
const STYLES = ['', 'beanstalk', 'ink', 'floral', 'gate', 'neon'] as const;

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

export default function ThemeMaker() {
  const { t } = useLocale();
  // iPad and Mac: the form on the left and a large live preview that stays in view on the right.
  const wide = useWindowDimensions().width >= breakpoints.split;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [layout, setLayout] = useState<MakerLayout>('vine');
  // Each layout keeps its own colors, so switching layouts doesn't carry one's backdrop into another.
  const [all, setAll] = useState<Record<MakerLayout, Record<string, string>>>(
    () => Object.fromEntries(LAYOUTS.map((l) => [l, Object.fromEntries(COLOR_FIELDS[l].map((f) => [f.key, f.start]))])) as Record<MakerLayout, Record<string, string>>,
  );
  const [shape, setShape] = useState<(typeof SHAPES)[number]>('round');
  const [drawing, setDrawing] = useState<(typeof STYLES)[number]>('');
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
  // Comments are dark text on the comment background; keep it readable (WCAG AA 4.5:1). The server checks too.
  const commentsReadable = !colorsOk || !c.leafSoft || layout !== 'vine' || contrastRatio(c.leafSoft, COMMENT_TEXT) >= 4.5;
  const tokens = useMemo(() => {
    const out: Record<string, string | number | boolean> = Object.fromEntries(fields.map((f) => [f.key, c[f.key]!]));
    if (layout === 'vine') Object.assign(out, { branch: c.stem!, tendril: c.stem!, leafShape: shape, stemWidth: width, stemDouble: double, stemGlow: glowing, scenery: fairytale ? 'fairytale' : '', vineStyle: drawing });
    if (layout === 'circuit') out.tilt = 10;
    return out;
  }, [fields, c, layout, shape, width, double, glowing, fairytale, drawing]);

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
    <Screen style={wide ? styles.wideScreen : undefined}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

        {wide ? null : <SkinPreview layout={layout} tokens={tokens} testID="maker-preview" />}

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
        {!commentsReadable ? <Text style={[type.small, { color: colors.danger }]}>{t('skinIdea.tooDark')}</Text> : null}

        {layout === 'vine' ? (
          <>
            <Text style={type.heading}>{t('skinIdea.styleHeading')}</Text>
            <View style={styles.row}>
              {STYLES.map((st) => (
                <Chip key={st || 'plain'} radio label={t(`skinIdea.style.${st || 'plain'}`)} selected={drawing === st} onPress={() => setDrawing(st)} />
              ))}
            </View>
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

        <Button label={t('skinIdea.send')} onPress={submit} busy={busy} disabled={name.trim().length < 2 || !description.trim() || !colorsOk || !commentsReadable} />

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
      {wide ? (
        <View style={styles.side}>
          <Text style={type.heading}>{t('skinIdea.previewHeading')}</Text>
          <SkinPreview layout={layout} tokens={tokens} height={380} testID="maker-preview" />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wideScreen: { maxWidth: 1080, flexDirection: 'row', gap: space.lg },
  side: { width: 400, paddingTop: 120, paddingRight: space.lg, gap: space.sm },
  content: { padding: space.lg, gap: space.md, paddingBottom: 80 },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  sent: { ...type.body, color: colors.primary, fontWeight: '700' },
  colorRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space.md, gap: 2 },
  cardTitle: { ...type.body, fontWeight: '700' },
});

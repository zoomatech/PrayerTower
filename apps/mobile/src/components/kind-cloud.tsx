// The kind cloud ("What would Ted Lasso do?"): a small cloud in the corner of a
// composer with a short prayer and "Are you sure you want to put that out
// there?". It never stops a post; a person reviews anything before it is
// blocked. Off until Admin turns on the kind cloud switch.
// Research and sources: docs/KIND_CLOUD.md.
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { api, type HarmNote, type KindVerdict } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const WAIT_MS = 700;

/** The verdict for a draft, checked a moment after typing stops. Null while off, empty, or ok. */
export function useKindCloud(text: string): { on: boolean; verdict: KindVerdict | null; harm: HarmNote | null } {
  const { kindCloud } = useFeatures();
  // The last answer stays up while the member edits, so the cloud doesn't flicker on every key.
  const [checked, setChecked] = useState<{ draft: string; verdict: KindVerdict | null; harm: HarmNote | null } | null>(null);
  const draft = text.trim();
  useEffect(() => {
    if (!kindCloud || !draft) return;
    let live = true;
    const timer = setTimeout(() => {
      api.precheck(draft).then((r) => live && setChecked({ draft, verdict: r.cloud && r.cloud.level !== 'ok' ? r.cloud : null, harm: r.harm ?? null }));
    }, WAIT_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kindCloud, draft]);
  const shown = kindCloud && draft && checked ? checked : null;
  return { on: kindCloud, verdict: shown?.verdict ?? null, harm: shown?.harm ?? null };
}

/** Sits in the corner of a composer card; nothing at all while the draft is fine. */
export function KindCloud({ text }: { text: string }) {
  const t = useT();
  const { verdict, harm } = useKindCloud(text);
  if (!verdict && !harm) return null;
  const strong = verdict?.level === 'strong';
  return (
    <View style={styles.corner} accessibilityLiveRegion="polite" accessibilityLabel={t('kindCloud.label')} testID="kind-cloud">
      <View style={[styles.puff, styles.puffSmall]} />
      <View style={[styles.puff, styles.puffLarge]} />
      <View style={styles.cloud}>
        <Text style={styles.prayer}>{t('kindCloud.prayer')}</Text>
        {/* A request that wishes harm gets the harm filter's gentle redirect, and any helplines. */}
        {harm ? <Text style={styles.prayer}>{harm.message}</Text> : null}
        {harm?.resources?.map((r, i) => (
          <Text
            key={i}
            style={styles.link}
            accessibilityRole={r.url || r.phone ? 'link' : undefined}
            onPress={r.url || r.phone ? () => Linking.openURL(r.url ?? `tel:${r.phone}`).catch(() => undefined) : undefined}>
            {[r.name ?? r.label, r.phone].filter(Boolean).join(' · ')}
          </Text>
        ))}
        <Text style={styles.ask}>{strong ? t('kindCloud.strong') : t('kindCloud.ask')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { alignSelf: 'flex-end', maxWidth: 260, marginTop: space.sm },
  cloud: { backgroundColor: colors.primarySoft, borderRadius: radius.lg, paddingVertical: space.sm, paddingHorizontal: space.md, gap: space.xs },
  // Two puffs on top give it a cloud's outline.
  puff: { position: 'absolute', backgroundColor: colors.primarySoft, borderRadius: radius.pill },
  puffSmall: { width: 26, height: 26, top: -9, right: 52 },
  puffLarge: { width: 36, height: 36, top: -14, right: 16 },
  prayer: { ...type.small, fontStyle: 'italic', color: colors.text },
  ask: { ...type.small, fontWeight: '600', color: colors.primary },
  link: { ...type.small, color: colors.primary, textDecorationLine: 'underline' },
});

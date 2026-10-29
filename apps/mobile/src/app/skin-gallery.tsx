// Me → Skin gallery (behind Admin → Feed skins → Skin gallery): every skin the member can
// use right now, with a small preview, who made it, likes and "Use this skin". Members'
// own skins show to everyone once an admin has approved them; your own show to you at once.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { SkinPreview } from '@/components/skin-preview';
import { Button, Empty, ErrorText, Screen } from '@/components/ui';
import { api, type GallerySkin } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { breakpoints, colors, radius, space, type } from '@/lib/theme';

export default function SkinGallery() {
  const { t } = useLocale();
  const { width } = useWindowDimensions();
  const [skins, setSkins] = useState<GallerySkin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (p: Promise<{ skins: GallerySkin[] }>) =>
    p.then((r) => setSkins(r.skins)).catch((e: Error) => setError(e.message));
  useFocusEffect(useCallback(() => void run(api.skinGallery()), []));

  const use = (slug: string) =>
    api
      .chooseFeedTheme(slug)
      .then(() => {
        resetFeatures();
        return run(api.skinGallery());
      })
      .catch((e: Error) => setError(e.message));

  // One column on a phone, two on a tablet, three on a wide screen.
  const columns = width >= breakpoints.twoColumnFeed ? 3 : width >= breakpoints.split ? 2 : 1;
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
        <Text style={type.title}>{t('gallery.title')}</Text>
        <Text style={type.body}>{t('gallery.intro')}</Text>
        <ErrorText error={error} onRetry={() => run(api.skinGallery())} />
        {skins && !skins.length ? <Empty text={t('gallery.none')} /> : null}
        <View style={styles.grid}>
          {skins?.map((s) => (
            <View key={s.slug} style={[styles.card, { width: columns === 1 ? '100%' : `${100 / columns - 2}%` }]} testID={`gallery-${s.slug}`}>
              <SkinPreview layout={s.layout} tokens={s.tokens} height={140} />
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{s.name}</Text>
                  <Text style={type.small}>
                    {s.maker ? t('gallery.by', { name: s.maker.name }) : t('gallery.builtIn')}
                    {s.season ? ` · ${t(`gallery.season.${s.season}`)}` : ''}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: s.liked }}
                  accessibilityLabel={t(s.liked ? 'gallery.unlike' : 'gallery.like', { name: s.name, count: s.likes })}
                  onPress={() => run(api.likeSkin(s.slug, !s.liked))}
                  style={[styles.like, s.liked && styles.liked]}>
                  <Text>{s.liked ? '♥' : '♡'}</Text>
                  <Text style={type.small}>{s.likes}</Text>
                </Pressable>
              </View>
              {s.inUse ? <Text style={styles.inUse}>{t('gallery.inUse')}</Text> : <Button small label={t('gallery.use')} onPress={() => use(s.slug)} />}
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 80 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  card: { gap: space.sm, padding: space.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { ...type.body, fontWeight: '700' },
  like: { minWidth: 44, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.sm },
  liked: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  inUse: { ...type.small, color: colors.primary, fontWeight: '700', textAlign: 'center', paddingVertical: space.sm },
});

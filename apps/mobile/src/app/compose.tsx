import {
  MAX_POST_WORDS,
  POST_BACKGROUNDS,
  POST_BACKGROUND_STYLES,
  POST_TYPES,
  POST_TYPE_LABELS,
  PRAYER_KINDS,
  PRAYER_KIND_LABELS,
  PRAYER_REALMS,
  PRAYER_REALM_LABELS,
  type Card,
  type PostBackground,
  type PostType,
  type PrayerKind,
  type PrayerRealm,
} from '@prayer-tower/shared';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Chip, ErrorText, Screen, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { uploadAsset } from '@/lib/media';
import { colors, radius, space, type } from '@/lib/theme';

const MAX_MEDIA = 10;
const URGENCY = [0, 1, 2, 3];
const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export default function Compose() {
  const { profile } = useAuth();
  const { t, label } = useLocale();
  // The thanksgiving card opens the composer as a praise post.
  const params = useLocalSearchParams<{ type?: string }>();
  const [postType, setPostType] = useState<PostType>(params.type === 'praise' ? 'praise' : 'prayer_request');
  const [body, setBody] = useState('');
  const [urgency, setUrgency] = useState(0);
  const [kind, setKind] = useState<PrayerKind | undefined>();
  const [realm, setRealm] = useState<PrayerRealm | undefined>();
  const [background, setBackground] = useState<PostBackground | undefined>();
  const [anonymous, setAnonymous] = useState(profile?.anonymous_by_default ?? false);
  const [sensitive, setSensitive] = useState(false);
  const [allSupport, setAllSupport] = useState(false);
  const features = useFeatures();
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = wordCount(body);
  const bg = background ? POST_BACKGROUND_STYLES[background] : null;

  const afterCreate = (post: Card) => {
    // A request that mentions suicide or self-harm opens with crisis support showing.
    if (post.crisis) router.replace(`/post/${post.id}`);
    // Praise opens with the thanksgiving celebration.
    else if (postType === 'praise') router.replace(`/post/${post.id}?celebrate=1`);
    else router.back();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const media = [];
      for (const a of assets) media.push(await uploadAsset(a));
      if (!assets.length) {
        // Text-only posts can wait in the offline queue; photos need a connection to upload.
        const result = await api.createPostOrQueue({
          postType,
          body: body.trim(),
          urgency,
          kind,
          realm,
          background,
          isAnonymous: anonymous,
          isSensitive: sensitive,
          allSupportWelcome: features.supportLabel && allSupport,
        });
        if ('queued' in result) return router.back();
        return afterCreate(result.post);
      }
      const created = await api.createPost({
        postType,
        body: body.trim(),
        urgency,
        kind,
        realm,
        // Backgrounds are for text-only posts.
        background: assets.length ? undefined : background,
        isAnonymous: anonymous,
        isSensitive: sensitive,
        allSupportWelcome: features.supportLabel && allSupport,
        media,
      });
      afterCreate(created.post);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_MEDIA - assets.length,
      quality: 0.8,
    });
    if (!result.canceled) setAssets((prev) => [...prev, ...result.assets].slice(0, MAX_MEDIA));
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Button small variant="ghost" label={t('common.cancel')} onPress={() => router.back()} />
          <Button small testID="compose-post" label={t('compose.post')} onPress={submit} busy={busy} disabled={!body.trim() || words > MAX_POST_WORDS} />
        </View>
        <ErrorText error={error} />
        <Text style={styles.greeting}>{t('compose.greeting', { name: profile?.display_name || t('common.friend') })}</Text>
        <View style={styles.chips}>
          {POST_TYPES.map((p) => (
            <Chip key={p} label={label('postType', p, POST_TYPE_LABELS[p])} selected={postType === p} onPress={() => setPostType(p)} />
          ))}
        </View>
        <TextInput
          style={[styles.input, bg && !assets.length && { backgroundColor: bg.color, color: bg.text, borderColor: bg.color }]}
          testID="compose-body"
          placeholder={t('compose.placeholder')}
          placeholderTextColor={colors.textMuted}
          value={body}
          onChangeText={setBody}
          multiline
          autoFocus
          accessibilityLabel={t('compose.bodyLabel')}
        />
        <Text style={[type.small, words > MAX_POST_WORDS && { color: colors.danger }]}>
          {t('compose.words', { count: words, max: MAX_POST_WORDS })}
        </Text>
        <View style={styles.media}>
          {assets.map((a, i) => (
            <Pressable
              key={a.uri}
              onPress={() => setAssets((prev) => prev.filter((_, j) => j !== i))}
              accessibilityRole="button"
              accessibilityLabel={t('compose.removeAttachment')}>
              {a.type === 'video' ? (
                <View style={[styles.thumb, styles.videoThumb]}>
                  <Text style={styles.videoLabel}>{t('compose.video')}</Text>
                </View>
              ) : (
                <Image source={{ uri: a.uri }} style={styles.thumb} contentFit="cover" />
              )}
              <Text style={styles.remove}>{t('compose.remove')}</Text>
            </Pressable>
          ))}
          {assets.length < MAX_MEDIA ? <Button small variant="secondary" label={t('compose.addMedia')} onPress={pick} /> : null}
        </View>
        {assets.length === 0 ? (
          <View style={styles.swatches} role="radiogroup" aria-label={t('compose.background')}>
            <Pressable
              onPress={() => setBackground(undefined)}
              role="radio"
              aria-checked={!background}
              accessibilityLabel={t('compose.noBackground')}
              style={[styles.swatch, { backgroundColor: colors.surface }, !background && styles.swatchOn]}
            />
            {POST_BACKGROUNDS.map((b) => (
              <Pressable
                key={b}
                onPress={() => setBackground(b)}
                role="radio"
                aria-checked={background === b}
                accessibilityLabel={t('compose.backgroundNamed', { name: POST_BACKGROUND_STYLES[b].label })}
                style={[styles.swatch, { backgroundColor: POST_BACKGROUND_STYLES[b].color }, background === b && styles.swatchOn]}
              />
            ))}
          </View>
        ) : null}
        <View style={{ gap: space.sm }}>
          <Text style={type.heading}>{t('compose.kind')}</Text>
          <View style={styles.chips}>
            {PRAYER_KINDS.map((k) => (
              <Chip key={k} label={label('prayerKind', k, PRAYER_KIND_LABELS[k])} selected={kind === k} onPress={() => setKind(kind === k ? undefined : k)} />
            ))}
          </View>
        </View>
        <View style={{ gap: space.sm }}>
          <Text style={type.heading}>{t('compose.realm')}</Text>
          <View style={styles.chips}>
            {PRAYER_REALMS.map((r) => (
              <Chip key={r} label={label('prayerRealm', r, PRAYER_REALM_LABELS[r])} selected={realm === r} onPress={() => setRealm(realm === r ? undefined : r)} />
            ))}
          </View>
        </View>
        {postType === 'prayer_request' ? (
          <View style={{ gap: space.sm }}>
            <Text style={type.heading}>{t('compose.urgency')}</Text>
            <View style={styles.chips}>
              {URGENCY.map((i) => (
                <Chip key={i} label={t(`compose.urgencies.${i}`)} selected={urgency === i} onPress={() => setUrgency(i)} />
              ))}
            </View>
          </View>
        ) : null}
        <Toggle label={t('compose.anonymous')} hint={t('compose.anonymousHint')} value={anonymous} onChange={setAnonymous} />
        <Toggle
          label={t('compose.sensitive')}
          hint={t('compose.sensitiveHint')}
          value={sensitive}
          onChange={setSensitive}
        />
        {features.supportLabel ? (
          <Toggle label={t('notebook.supportToggle')} hint={t('notebook.supportHint')} value={allSupport} onChange={setAllSupport} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg, paddingBottom: 80 },
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  greeting: { ...type.heading, color: colors.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  media: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.border },
  videoThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.text },
  videoLabel: { color: colors.surface, fontWeight: '700' },
  remove: { ...type.small, textAlign: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  swatchOn: { borderWidth: 3, borderColor: colors.primary },
  input: {
    minHeight: 180,
    textAlignVertical: 'top',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    fontSize: 17,
    lineHeight: 24,
    color: colors.text,
  },
});

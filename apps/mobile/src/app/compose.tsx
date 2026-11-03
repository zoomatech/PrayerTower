import {
  MAX_POST_WORDS,
  POST_BACKGROUNDS,
  POST_BACKGROUND_STYLES,
  PRAYER_REALMS,
  PRAYER_REALM_LABELS,
  type Card,
  type PostBackground,
  type PostType,
  type PrayerRealm,
} from '@prayer-tower/shared';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { rememberSupport } from '@/components/harm-support';
import { KindCloud } from '@/components/kind-cloud';
import { Button, Chip, ErrorText, Screen, Toggle } from '@/components/ui';
import { api, type HarmNote } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { uploadAsset } from '@/lib/media';
import { colors, radius, space, type } from '@/lib/theme';

const MAX_MEDIA = 10;
const URGENCY = [0, 1, 2, 3];
// Opened from a link or after a reload there is nothing to go back to: go to the feed.
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export default function Compose() {
  const { profile } = useAuth();
  const { t, label, wording } = useLocale();
  // Two ways to send (Steve, 2026-11-02): a post, or a prayer PrayerCast to heaven (also posted to
  // the feed). Prayers and posts are kept apart so answered prayers can be counted. Open Circle has no PrayerCast.
  const casts = wording !== 'neutral';
  // The thanksgiving card opens the composer as a praise post; the gratitude card also passes its words.
  const params = useLocalSearchParams<{ type?: string; body?: string }>();
  const [asked] = useState<PostType>(params.type === 'praise' ? 'praise' : 'prayer_request');
  const [body, setBody] = useState(typeof params.body === 'string' ? params.body.slice(0, 5000) : '');
  const [urgency, setUrgency] = useState(0);
  const [realm, setRealm] = useState<PrayerRealm | undefined>();
  const [background, setBackground] = useState<PostBackground | undefined>();
  const [anonymous, setAnonymous] = useState(profile?.anonymous_by_default ?? false);
  const [sensitive, setSensitive] = useState(false);
  const [allSupport, setAllSupport] = useState(false);
  const [lament, setLament] = useState(false);
  const [lamentRadio, setLamentRadio] = useState(false);
  const features = useFeatures();
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Post my PrayerCast publicly, or PrayerCast privately: none until the member picks (Steve, 2026-11-02).
  const [castChoice, setCastChoice] = useState<'public' | 'private' | null>(null);
  const [posted, setPosted] = useState(false);
  const words = wordCount(body);
  const bg = background ? POST_BACKGROUND_STYLES[background] : null;

  const afterCreate = (post: Card, harm?: HarmNote | null, postType: PostType = asked) => {
    // A request that mentions suicide or self-harm opens with crisis support showing, and one
    // that describes abuse opens with the hotlines (harmful-prayer check). Neither is blocked.
    if (rememberSupport(post.id, harm) || post.crisis) router.replace(`/post/${post.id}`);
    // Praise opens with the thanksgiving celebration.
    else if (postType === 'praise') router.replace(`/post/${post.id}?celebrate=1`);
    else leave();
  };

  const submit = async (cast: boolean) => {
    setBusy(true);
    setError(null);
    // Post: a post that isn't a prayer (thanks from the thanksgiving card stays praise).
    const postType: PostType = cast || !casts || asked === 'praise' ? asked : 'discussion';
    const fields = {
      postType,
      body: body.trim(),
      urgency: postType === 'prayer_request' ? urgency : 0,
      realm,
      isAnonymous: anonymous,
      isSensitive: sensitive,
      allSupportWelcome: features.supportLabel && allSupport,
      ...(features.lament && lament ? { isLament: true, lamentRadio } : {}),
    };
    try {
      const media = [];
      for (const a of assets) media.push(await uploadAsset(a));
      // Backgrounds are for text-only posts.
      const input = { ...fields, background: assets.length ? undefined : background, media };
      if (cast && castChoice) {
        // Posted and sent by radio together; if it can't be sent, nothing is saved.
        const sent = await api.sendPrayerCast(input, castChoice);
        if (sent.castError) {
          // Posted, but not sent by radio: say so, and leave only Close.
          setError(t('compose.castFailed', { reason: sent.castError }));
          setPosted(true);
          setBusy(false);
          return;
        }
        return sent.post ? afterCreate(sent.post, sent.harm, postType) : leave();
      }
      if (!assets.length) {
        // Text-only posts can wait in the offline queue; photos need a connection to upload.
        const result = await api.createPostOrQueue({ ...fields, background });
        if ('queued' in result) return leave();
        return afterCreate(result.post, result.harm, postType);
      }
      const created = await api.createPost(input);
      afterCreate(created.post, created.harm, postType);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const pick = async () => {
    const max = features.videoMaxSeconds;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_MEDIA - assets.length,
      quality: 0.8,
      videoMaxDuration: max,
      // Short clips at 720p keep storage and data use low (docs/FEED_SKINS.md, video cap).
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
    });
    if (result.canceled) return;
    // Videos over the cap are left out, with a note; the server refuses them too.
    const fits = result.assets.filter((a) => a.type !== 'video' || a.duration == null || a.duration <= max * 1000 + 500);
    setError(fits.length < result.assets.length ? t('compose.videoTooLong', { count: max }) : null);
    setAssets((prev) => [...prev, ...fits].slice(0, MAX_MEDIA));
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.top}>
          <Button small variant="ghost" label={t('common.cancel')} onPress={leave} />
        </View>
        <ErrorText error={error} />
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
        <KindCloud text={body} context={features.lament && lament ? 'lament' : undefined} />
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
          <Text style={type.heading}>{t('compose.realm')}</Text>
          <View style={styles.chips}>
            {PRAYER_REALMS.map((r) => (
              <Chip key={r} label={label('prayerRealm', r, PRAYER_REALM_LABELS[r])} selected={realm === r} onPress={() => setRealm(realm === r ? undefined : r)} />
            ))}
          </View>
        </View>
        {asked === 'prayer_request' ? (
          <View style={{ gap: space.sm }}>
            <Text style={type.heading}>{t('compose.urgency')}</Text>
            <View style={styles.chips}>
              {URGENCY.map((i) => (
                <Chip radio key={i} label={t(`compose.urgencies.${i}`)} selected={urgency === i} onPress={() => setUrgency(i)} />
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
        {features.lament ? (
          <>
            <Toggle label={t('lament.toggle')} hint={t('lament.toggleHint')} value={lament} onChange={setLament} />
            {lament ? <Toggle label={t('lament.radio')} hint={t('lament.radioHint')} value={lamentRadio} onChange={setLamentRadio} /> : null}
          </>
        ) : null}
      </ScrollView>
      <View style={styles.send}>
        {posted ? <Button label={t('common.close')} onPress={leave} /> : null}
        {!posted && casts ? (
          <>
            <Toggle label={t('compose.castPublic')} value={castChoice === 'public'} onChange={(on) => setCastChoice(on ? 'public' : null)} />
            <Toggle label={t('compose.castPrivate')} value={castChoice === 'private'} onChange={(on) => setCastChoice(on ? 'private' : null)} />
            <Button
              testID="compose-cast"
              label={t('compose.cast')}
              onPress={() => submit(true)}
              busy={busy}
              disabled={!castChoice || !body.trim() || words > MAX_POST_WORDS}
            />
            {/* What "heaven*" means (Steve, 2026-11-02). */}
            <Text style={type.small}>{t('compose.castNote')}</Text>
          </>
        ) : null}
        {posted ? null : (
          <Button testID="compose-post" label={t('compose.post')} onPress={() => submit(false)} busy={busy} disabled={!body.trim() || words > MAX_POST_WORDS} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg, paddingBottom: 80 },
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  send: { gap: space.sm, padding: space.md },
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

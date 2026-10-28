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
  type PostBackground,
  type PostType,
  type PrayerKind,
  type PrayerRealm,
} from '@prayer-tower/shared';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Chip, ErrorText, Screen, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { uploadAsset } from '@/lib/media';
import { colors, radius, space, type } from '@/lib/theme';

const MAX_MEDIA = 10;
const URGENCY = ['Whenever you can', 'Soon', 'Today', 'Right now'];
const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export default function Compose() {
  const { profile } = useAuth();
  const [postType, setPostType] = useState<PostType>('prayer_request');
  const [body, setBody] = useState('');
  const [urgency, setUrgency] = useState(0);
  const [kind, setKind] = useState<PrayerKind | undefined>();
  const [realm, setRealm] = useState<PrayerRealm | undefined>();
  const [background, setBackground] = useState<PostBackground | undefined>();
  const [anonymous, setAnonymous] = useState(profile?.anonymous_by_default ?? false);
  const [sensitive, setSensitive] = useState(false);
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = wordCount(body);
  const bg = background ? POST_BACKGROUND_STYLES[background] : null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const media = [];
      for (const a of assets) media.push(await uploadAsset(a));
      await api.createPost({
        postType,
        body: body.trim(),
        urgency,
        kind,
        realm,
        // Backgrounds are for text-only posts.
        background: assets.length ? undefined : background,
        isAnonymous: anonymous,
        isSensitive: sensitive,
        media,
      });
      router.back();
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
          <Button small variant="ghost" label="Cancel" onPress={() => router.back()} />
          <Button small label="Post" onPress={submit} busy={busy} disabled={!body.trim() || words > MAX_POST_WORDS} />
        </View>
        <Text style={styles.greeting}>Welcome, {profile?.display_name || 'friend'}! Let&apos;s talk to the Lord.</Text>
        <View style={styles.chips}>
          {POST_TYPES.map((t) => (
            <Chip key={t} label={POST_TYPE_LABELS[t]} selected={postType === t} onPress={() => setPostType(t)} />
          ))}
        </View>
        <TextInput
          style={[styles.input, bg && !assets.length && { backgroundColor: bg.color, color: bg.text, borderColor: bg.color }]}
          placeholder="Type your prayer here"
          placeholderTextColor={colors.textMuted}
          value={body}
          onChangeText={setBody}
          multiline
          autoFocus
          accessibilityLabel="Your prayer"
        />
        <Text style={[type.small, words > MAX_POST_WORDS && { color: colors.danger }]}>
          {words}/{MAX_POST_WORDS} words
        </Text>
        <View style={styles.media}>
          {assets.map((a, i) => (
            <Pressable
              key={a.uri}
              onPress={() => setAssets((prev) => prev.filter((_, j) => j !== i))}
              accessibilityRole="button"
              accessibilityLabel="Remove this attachment">
              {a.type === 'video' ? (
                <View style={[styles.thumb, styles.videoThumb]}>
                  <Text style={styles.videoLabel}>Video</Text>
                </View>
              ) : (
                <Image source={{ uri: a.uri }} style={styles.thumb} contentFit="cover" />
              )}
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          ))}
          {assets.length < MAX_MEDIA ? <Button small variant="secondary" label="Add photos or video" onPress={pick} /> : null}
        </View>
        {assets.length === 0 ? (
          <View style={styles.swatches} accessibilityLabel="Background">
            <Pressable
              onPress={() => setBackground(undefined)}
              accessibilityRole="radio"
              accessibilityState={{ checked: !background }}
              accessibilityLabel="No background"
              style={[styles.swatch, { backgroundColor: colors.surface }, !background && styles.swatchOn]}
            />
            {POST_BACKGROUNDS.map((b) => (
              <Pressable
                key={b}
                onPress={() => setBackground(b)}
                accessibilityRole="radio"
                accessibilityState={{ checked: background === b }}
                accessibilityLabel={`${POST_BACKGROUND_STYLES[b].label} background`}
                style={[styles.swatch, { backgroundColor: POST_BACKGROUND_STYLES[b].color }, background === b && styles.swatchOn]}
              />
            ))}
          </View>
        ) : null}
        <View style={{ gap: space.sm }}>
          <Text style={type.heading}>What kind of prayer?</Text>
          <View style={styles.chips}>
            {PRAYER_KINDS.map((k) => (
              <Chip key={k} label={PRAYER_KIND_LABELS[k]} selected={kind === k} onPress={() => setKind(kind === k ? undefined : k)} />
            ))}
          </View>
        </View>
        <View style={{ gap: space.sm }}>
          <Text style={type.heading}>Who is it for?</Text>
          <View style={styles.chips}>
            {PRAYER_REALMS.map((r) => (
              <Chip key={r} label={PRAYER_REALM_LABELS[r]} selected={realm === r} onPress={() => setRealm(realm === r ? undefined : r)} />
            ))}
          </View>
        </View>
        {postType === 'prayer_request' ? (
          <View style={{ gap: space.sm }}>
            <Text style={type.heading}>How urgent is it?</Text>
            <View style={styles.chips}>
              {URGENCY.map((u, i) => (
                <Chip key={u} label={u} selected={urgency === i} onPress={() => setUrgency(i)} />
              ))}
            </View>
          </View>
        ) : null}
        <Toggle label="Post anonymously" hint="Others will see “Anonymous.”" value={anonymous} onChange={setAnonymous} />
        <Toggle
          label="Contains graphic or trauma-related details"
          hint="Hidden from people who asked not to see such posts."
          value={sensitive}
          onChange={setSensitive}
        />
        <ErrorText error={error} />
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

// The member's own profile photo on Me (Steve, 2026-10-30): picked from their library, uploaded
// like post media, and shown in the oval locket on their posts. Initials show until they add one.
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/lib/i18n';
import { uploadAsset } from '@/lib/media';
import { colors, space, type } from '@/lib/theme';

export function ProfilePhoto() {
  const { profile, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!profile) return null;
  const url = profile.photo_url ?? null;

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await run(async () => api.setPhoto((await uploadAsset(asset)).storagePath));
  };

  return (
    <View style={styles.row}>
      <View style={styles.oval}>
        {url ? (
          <Image source={{ uri: url }} style={styles.photo} accessibilityLabel={t('profile.photoAlt')} />
        ) : (
          <Text style={styles.initial} aria-hidden>
            {(profile.display_name.trim()[0] ?? '?').toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.side}>
        <Button small label={url ? t('profile.photoChange') : t('profile.photoAdd')} onPress={pick} disabled={busy} testID="profile-photo" />
        {url ? <Button small variant="ghost" label={t('profile.photoRemove')} onPress={() => run(() => api.removePhoto())} disabled={busy} /> : null}
        <Text style={type.small}>{t('profile.photoHint')}</Text>
        <ErrorText error={error} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  oval: { width: 72, height: 90, borderRadius: 45, borderWidth: 3, borderColor: colors.gold, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldSoft },
  photo: { width: '100%', height: '100%' },
  initial: { fontSize: 32, fontWeight: '700', color: colors.text },
  side: { flex: 1, gap: space.xs, alignItems: 'flex-start' },
});

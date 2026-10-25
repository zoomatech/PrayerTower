import { MAX_POST_WORDS, POST_TYPES, POST_TYPE_LABELS, type PostType } from '@prayer-tower/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Chip, ErrorText, Screen, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, radius, space, type } from '@/lib/theme';

const URGENCY = ['Whenever you can', 'Soon', 'Today', 'Right now'];
const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export default function Compose() {
  const { profile } = useAuth();
  const [postType, setPostType] = useState<PostType>('prayer_request');
  const [body, setBody] = useState('');
  const [urgency, setUrgency] = useState(0);
  const [anonymous, setAnonymous] = useState(profile?.anonymous_by_default ?? false);
  const [sensitive, setSensitive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const words = wordCount(body);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createPost({ postType, body: body.trim(), urgency, isAnonymous: anonymous, isSensitive: sensitive });
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
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
          style={styles.input}
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

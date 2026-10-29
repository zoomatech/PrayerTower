// Support for someone who has just described abuse (docs/HARMFUL_PRAYERS.md): the
// hotlines the harmful-prayer check returned, shown gently after posting. Nothing is
// blocked or hidden. Self-harm keeps its own crisis box (components/crisis.tsx).
import * as Linking from 'expo-linking';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import type { HarmNote } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

/** The note for a post just created, read once by its page. */
const pending = new Map<string, HarmNote>();
export const rememberSupport = (postId: string, note: HarmNote | null | undefined) => {
  if (note?.resources?.length) pending.set(postId, note);
  return !!note?.resources?.length;
};
export const takeSupport = (postId: string) => {
  const note = pending.get(postId) ?? null;
  pending.delete(postId);
  return note;
};

export function HarmSupport({ note }: { note: HarmNote }) {
  const open = (url: string) => Linking.openURL(url).catch(() => undefined);
  return (
    <View style={styles.box} accessibilityRole="summary">
      {note.title ? <Text style={type.heading}>{note.title}</Text> : null}
      <Text style={type.body}>{note.message}</Text>
      <View style={styles.row}>
        {(note.resources ?? []).map((r, i) =>
          r.url ? <Button key={r.url} small variant={i === 0 ? 'primary' : 'secondary'} label={r.label ?? r.name ?? r.url} onPress={() => open(r.url!)} /> : null,
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

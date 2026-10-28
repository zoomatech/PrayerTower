// A simple message list for the two AI screens. Each reply is labeled, so the
// member always sees who is speaking.
import { StyleSheet, Text, View } from 'react-native';

import type { AiTurn } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

export function AiThread({ turns, you, ai }: { turns: AiTurn[]; you: string; ai: string }) {
  return (
    <View style={styles.list}>
      {turns.map((m, i) => (
        <View key={i} style={[styles.bubble, m.role === 'user' ? styles.mine : styles.theirs]}>
          <Text style={styles.who}>{m.role === 'user' ? you : ai}</Text>
          <Text style={type.body}>{m.content}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  bubble: { borderRadius: radius.lg, padding: space.md, gap: space.xs, maxWidth: '90%' },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primarySoft },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  who: { ...type.small, fontWeight: '600' },
});

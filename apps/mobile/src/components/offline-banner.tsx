// Tells the member when they're offline, what is waiting to send, and anything
// the server turned down once it was sent.
import { StyleSheet, Text, View } from 'react-native';

import { dismissDropped, useOffline } from '@/lib/offline';
import { colors, radius, space, type } from '@/lib/theme';

import { Button } from './ui';

export function OfflineBanner({ savedAt }: { savedAt?: number | null }) {
  const { online, queued, dropped } = useOffline();
  if (online && !queued.length && !dropped.length && !savedAt) return null;
  const waiting = queued.length ? ` ${queued.length} ${queued.length === 1 ? 'action is' : 'actions are'} waiting to send.` : '';
  return (
    <View style={styles.box} role="status" aria-live="polite">
      {!online || savedAt ? (
        <Text style={type.body}>
          {"You're offline."}
          {savedAt ? ` Showing prayers saved ${new Date(savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.` : ''}
          {waiting}
        </Text>
      ) : queued.length ? (
        <Text style={type.body}>Sending what you did while offline…</Text>
      ) : null}
      {dropped.map((d) => (
        <Text key={d} style={type.small}>
          Not sent: {d}
        </Text>
      ))}
      {dropped.length ? <Button small variant="ghost" label="OK" onPress={dismissDropped} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: space.md, gap: space.xs },
});

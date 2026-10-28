// Macro Needs featured above the feed: pray for the need AND give material
// help. "Prayer without action is sounding brass" (notebook Page 3).
import { type Card, type CardAction } from '@prayer-tower/shared';
import { router } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { type MacroNeed } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

import { Button } from './ui';

export function MacroNeeds({
  needs,
  onAction,
  onHelped,
}: {
  needs: MacroNeed[];
  onAction: (card: Card, action: CardAction) => void;
  onHelped: (id: string) => void;
}) {
  return (
    <>
      {needs.map((n) => (
        <View key={n.id} style={styles.box}>
          <Text style={styles.kicker}>Macro need</Text>
          <Text style={type.heading}>{n.title}</Text>
          {n.card ? (
            <Text style={type.body} onPress={() => router.push(`/post/${n.card!.id}`)}>
              {n.card.preview}
            </Text>
          ) : null}
          <Text style={type.small}>
            {n.prayers} praying · {n.tokens} tokens given · {n.helpers} gave material help
          </Text>
          <Text style={styles.label}>Pray</Text>
          <View style={styles.row}>
            {n.card ? (
              <>
                <Button small label="Praying now" onPress={() => onAction(n.card!, 'praying_now')} />
                <Button small variant="secondary" label="Commit to pray" onPress={() => onAction(n.card!, 'commit')} />
                <Button small variant="secondary" label="Give tokens" onPress={() => onAction(n.card!, 'gift_tokens')} />
              </>
            ) : null}
          </View>
          {n.helpOptions.length ? (
            <>
              <Text style={styles.label}>Help in person or with a gift</Text>
              <View style={styles.row}>
                {n.helpOptions.map((h) => (
                  <Button key={h.url} small variant="secondary" label={`${h.label} ↗`} onPress={() => Linking.openURL(h.url)} />
                ))}
              </View>
            </>
          ) : null}
          {n.helped ? (
            <Text style={type.small}>Thank you for helping.</Text>
          ) : (
            <Button small variant="ghost" label="I gave material help" onPress={() => onHelped(n.id)} />
          )}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  kicker: { ...type.small, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 1 },
  label: { ...type.small, fontWeight: '700', marginTop: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

// A link to a page that doesn't exist (or no longer does) lands here instead of
// Expo Router's default "Unmatched Route" screen. English only for now (Steve, 2026-10-28).
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { colors, space, type } from '@/lib/theme';

export default function NotFound() {
  return (
    <Screen>
      <View style={styles.wrap}>
        <Text style={type.title}>We couldn't find that page</Text>
        <Text style={[type.body, { color: colors.textMuted }]}>The link may be old, or the request may have been taken down.</Text>
        <Button label="Go to Prayers" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg },
});

// Links to the privacy policy and terms of use, shown at sign-up and on the profile.
import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, Text } from 'react-native';

import { env } from '@/lib/env';
import { colors, type } from '@/lib/theme';

function Link({ label, url }: { label: string; url: string }) {
  if (!url) return <Text>{label}</Text>;
  return (
    <Text style={styles.link} accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(url)}>
      {label}
    </Text>
  );
}

export function LegalLinks({ prefix }: { prefix?: string }) {
  return (
    <Text style={[type.small, styles.center]}>
      {prefix ? `${prefix} ` : ''}
      <Link label="Terms of Use" url={env.termsUrl} /> and <Link label="Privacy Policy" url={env.privacyUrl} />.
    </Text>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.primary, textDecorationLine: 'underline' },
  center: { textAlign: 'center' },
});

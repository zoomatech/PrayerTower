// Links to the privacy policy, terms of use and contact address, shown at sign-up, on the profile and with the rules.
import * as WebBrowser from 'expo-web-browser';
import { Linking, StyleSheet, Text } from 'react-native';

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

export function LegalLinks({ prefix, contact = false }: { prefix?: string; contact?: boolean }) {
  return (
    <Text style={[type.small, styles.center]}>
      {prefix ? `${prefix} ` : ''}
      <Link label="Terms of Use" url={env.termsUrl} /> and <Link label="Privacy Policy" url={env.privacyUrl} />.
      {contact && env.supportEmail ? (
        <>
          {' Questions or concerns? '}
          <Text style={styles.link} accessibilityRole="link" onPress={() => Linking.openURL(`mailto:${env.supportEmail}`)}>
            {env.supportEmail}
          </Text>
        </>
      ) : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.primary, textDecorationLine: 'underline' },
  center: { textAlign: 'center' },
});

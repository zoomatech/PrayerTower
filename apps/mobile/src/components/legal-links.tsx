// Links to the privacy policy, terms of use and contact address, shown at sign-up, on the profile and with the rules.
import * as WebBrowser from 'expo-web-browser';
import { Linking, StyleSheet, Text } from 'react-native';

import { env } from '@/lib/env';
import { useLocale } from '@/lib/i18n';
import { colors, type } from '@/lib/theme';

function Link({ label, url }: { label: string; url: string }) {
  if (!url) return <Text>{label}</Text>;
  return (
    <Text style={styles.link} accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(url)}>
      {label}
    </Text>
  );
}

/** Our own site serves Spanish under /es (for example /es/privacy); other addresses are left alone. */
export function localizedUrl(url: string, language: string) {
  if (!url || language !== 'es') return url;
  try {
    const u = new URL(url);
    if (!['/privacy', '/terms', '/support', '/account-deletion'].includes(u.pathname)) return url;
    u.pathname = `/es${u.pathname}`;
    return u.toString();
  } catch {
    return url;
  }
}

export function LegalLinks({ prefix, contact = false }: { prefix?: string; contact?: boolean }) {
  const { t, language } = useLocale();
  return (
    <Text style={[type.small, styles.center]}>
      {prefix ? `${prefix} ` : ''}
      <Link label={t('legal.terms')} url={localizedUrl(env.termsUrl, language)} /> {t('legal.and')}{' '}
      <Link label={t('legal.privacy')} url={localizedUrl(env.privacyUrl, language)} />.
      {contact && env.supportEmail ? (
        <>
          {` ${t('legal.questions')} `}
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

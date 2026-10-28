import { WHY_HERE_LABELS, type FeedThemeChoices, type TierStatus, type TokenSummary } from '@prayer-tower/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Screen, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, radius, space, type } from '@/lib/theme';

export default function Profile() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [tier, setTier] = useState<TierStatus | null>(null);
  const [tokens, setTokens] = useState<TokenSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedStyles, setFeedStyles] = useState<FeedThemeChoices | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.tier().then(setTier).catch(() => undefined);
      api.tokens().then(setTokens).catch(() => undefined);
      api.feedThemes().then(setFeedStyles).catch(() => undefined);
    }, []),
  );

  const update = async (patch: Record<string, unknown>) => {
    try {
      await api.updateMe(patch);
      await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!profile) return null;
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={type.title}>{profile.display_name || 'Me'}</Text>
        {profile.why_here.length ? (
          <Text style={type.body}>{profile.why_here.map((w) => WHY_HERE_LABELS[w as keyof typeof WHY_HERE_LABELS] ?? w).join(' · ')}</Text>
        ) : null}

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{tier?.tier?.label ?? '—'}</Text>
            <Text style={type.small}>{profile.anonymous_by_default ? 'Your tier (private)' : 'Your tier'}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{tier?.prayers ?? 0}</Text>
            <Text style={type.small}>Prayers</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{tokens?.balance ?? 0}</Text>
            <Text style={type.small}>Tokens</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.gold }]}>{tokens?.priestly.balance ?? 0}</Text>
            <Text style={type.small}>Priestly</Text>
          </View>
        </View>
        {tier?.next ? (
          <Text style={type.small}>
            {tier.next.prayersNeeded} more prayers to become a {tier.next.label}.
          </Text>
        ) : null}
        {tokens ? (
          <Text style={type.small}>
            {tokens.priestly.towardNext} of {tokens.priestly.prayersPerToken} prayers toward your next Priestly token. Priestly
            tokens keep the prayer infrastructure running; you can give them to others or donate them.
          </Text>
        ) : null}
        {tokens && tokens.priestly.balance > 0 ? (
          <Button
            small
            variant="secondary"
            label="Donate 1 Priestly token"
            onPress={() => api.donatePriestly(1).then(() => api.tokens().then(setTokens)).catch((e) => setError((e as Error).message))}
          />
        ) : null}
        <Text style={type.small}>Tokens help requests reach more people. A lack of tokens never stops a request from being seen.</Text>

        {feedStyles && feedStyles.themes.length > 1 ? (
          <View style={{ gap: space.sm }}>
            <Text style={type.heading}>Feed style</Text>
            <View style={styles.chips}>
              {feedStyles.themes.map((t) => (
                <Chip
                  key={t.slug}
                  label={t.status === 'beta' ? `${t.name} (beta)` : t.name}
                  selected={feedStyles.current === t.slug}
                  onPress={() =>
                    api
                      .chooseFeedTheme(t.is_default ? null : t.slug)
                      .then(setFeedStyles)
                      .catch((e) => setError((e as Error).message))
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        <Text style={type.heading}>Settings</Text>
        <Toggle label="Hide graphic or trauma-related requests" value={profile.trauma_content_opt_out} onChange={(v) => update({ traumaContentOptOut: v })} />
        <Toggle label="Pray and post anonymously by default" value={profile.anonymous_by_default} onChange={(v) => update({ anonymousByDefault: v })} />
        <Toggle label="Occasional prayer reminders" value={profile.prompts_enabled} onChange={(v) => update({ promptsEnabled: v })} />
        <Toggle label="Show my updates as the first comment" value={profile.updates_in_first_comment} onChange={(v) => update({ updatesInFirstComment: v })} />
        <ErrorText error={error} />
        <Button variant="ghost" label="Sign out" onPress={signOut} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 120 },
  stats: { flexDirection: 'row', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.primary, textAlign: 'center' },
});

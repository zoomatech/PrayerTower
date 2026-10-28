import {
  FEED_MIX_KEYS,
  POST_TYPE_LABELS,
  PRAYER_REALM_LABELS,
  WHY_HERE_LABELS,
  type FeedMix,
  type FeedMixKey,
  type FeedThemeChoices,
  type TierStatus,
  type TokenSummary,
} from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { LanguagePicker } from '@/components/language-picker';
import { LegalLinks } from '@/components/legal-links';
import { Button, Chip, ErrorText, Screen, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/lib/i18n';
import { saveJson } from '@/lib/save-file';
import { colors, radius, space, type } from '@/lib/theme';

export default function Profile() {
  const { profile, roles, refreshProfile, signOut } = useAuth();
  const { t, label } = useLocale();
  const [tier, setTier] = useState<TierStatus | null>(null);
  const [tokens, setTokens] = useState<TokenSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
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
        <Text style={type.title}>{profile.display_name || t('profile.me')}</Text>
        {profile.why_here.length ? (
          <Text style={type.body}>{profile.why_here.map((w) => label('whyHere', w, WHY_HERE_LABELS[w as keyof typeof WHY_HERE_LABELS])).join(' · ')}</Text>
        ) : null}

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{tier?.tier?.label ?? '—'}</Text>
            <Text style={type.small}>{profile.anonymous_by_default ? t('profile.tierPrivate') : t('profile.tier')}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{tier?.prayers ?? 0}</Text>
            <Text style={type.small}>{t('profile.prayers')}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{tokens?.balance ?? 0}</Text>
            <Text style={type.small}>{t('profile.tokens')}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.goldText }]}>{tokens?.priestly.balance ?? 0}</Text>
            <Text style={type.small}>{t('profile.priestly')}</Text>
          </View>
        </View>
        {tier?.next ? (
          <Text style={type.small}>
            {t('profile.nextTier', { count: tier.next.prayersNeeded, tier: tier.next.label })}
          </Text>
        ) : null}
        {tokens ? (
          <Text style={type.small}>
            {t('profile.priestlyProgress', { done: tokens.priestly.towardNext, per: tokens.priestly.prayersPerToken })}
          </Text>
        ) : null}
        {tokens && tokens.priestly.balance > 0 ? (
          <Button
            small
            variant="secondary"
            label={t('profile.donatePriestly')}
            onPress={() => api.donatePriestly(1).then(() => api.tokens().then(setTokens)).catch((e) => setError((e as Error).message))}
          />
        ) : null}
        <Text style={type.small}>{t('profile.tokensNote')}</Text>
        <View style={styles.chips}>
          <Button small variant="secondary" label={t('profile.pools')} onPress={() => router.push('/pools')} />
          <Button small variant="secondary" label={t('profile.scheduled')} onPress={() => router.push('/scheduled')} />
          <Button small variant="secondary" label={t('profile.prayerCast')} onPress={() => router.push('/prayer-cast')} />
        </View>

        {feedStyles && feedStyles.themes.length > 1 ? (
          <View style={{ gap: space.sm }}>
            <Text style={type.heading}>{t('profile.feedStyle')}</Text>
            <View style={styles.chips}>
              {feedStyles.themes.map((th) => (
                <Chip
                  key={th.slug}
                  label={th.status === 'beta' ? t('profile.beta', { name: th.name }) : th.name}
                  selected={feedStyles.current === th.slug}
                  onPress={() =>
                    api
                      .chooseFeedTheme(th.is_default ? null : th.slug)
                      .then(setFeedStyles)
                      .catch((e) => setError((e as Error).message))
                  }
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: space.sm }}>
          <Text style={type.heading}>{t('profile.mix')}</Text>
          <Text style={type.small}>{t('profile.mixHint')}</Text>
          {FEED_MIX_KEYS.map((key) => {
            const level = profile.feed_mix?.[key] ?? 'normal';
            const setLevel = (next: 'less' | 'normal' | 'more') => {
              const mix: FeedMix = { ...profile.feed_mix };
              if (next === 'normal') delete mix[key];
              else mix[key] = next;
              update({ feedMix: mix });
            };
            return (
              <View key={key} style={styles.mixRow}>
                <Text style={[type.body, styles.mixLabel]}>{mixLabel(key, label)}</Text>
                <View style={styles.chips}>
                  {(['less', 'normal', 'more'] as const).map((l) => (
                    <Chip key={l} label={t(`profile.${l}`)} selected={level === l} onPress={() => setLevel(l)} />
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        <Text style={type.heading}>{t('profile.settings')}</Text>
        <Toggle label={t('settings.traumaOptOut')} value={profile.trauma_content_opt_out} onChange={(v) => update({ traumaContentOptOut: v })} />
        <Toggle label={t('settings.anonymous')} value={profile.anonymous_by_default} onChange={(v) => update({ anonymousByDefault: v })} />
        <Toggle label={t('settings.prompts')} value={profile.prompts_enabled} onChange={(v) => update({ promptsEnabled: v })} />
        {profile.prompts_enabled ? (
          <Toggle
            label={t('settings.firm')}
            hint={t('settings.firmHint')}
            value={profile.prompt_tone === 'firm'}
            onChange={(v) => update({ promptTone: v ? 'firm' : 'gentle' })}
          />
        ) : null}
        <Toggle label={t('settings.updatesFirst')} value={profile.updates_in_first_comment} onChange={(v) => update({ updatesInFirstComment: v })} />
        <Toggle label={t('settings.digest')} hint={t('settings.digestHint')} value={!!profile.digest_enabled} onChange={(v) => update({ digestEnabled: v })} />
        <LanguagePicker />
        <Button variant="ghost" label={t('profile.rules')} onPress={() => router.push('/rules')} />
        {roles.some((r) => r === 'moderator' || r === 'admin') ? (
          <>
            <Button variant="secondary" label={t('profile.moderation')} onPress={() => router.push('/moderation')} />
            <Button variant="secondary" label={t('profile.macroNeeds')} onPress={() => router.push('/macro-needs')} />
          </>
        ) : null}
        {roles.some((r) => r === 'witness' || r === 'moderator' || r === 'admin') ? (
          <Button variant="secondary" label={t('profile.witness')} onPress={() => router.push('/witness')} />
        ) : null}
        {roles.includes('admin') ? <Button variant="secondary" label={t('profile.admin')} onPress={() => router.push('/admin')} /> : null}
        <ErrorText error={error} />
        <Button variant="ghost" label={t('profile.tour')} onPress={() => router.push('/tour')} />
        <Button variant="ghost" label={t('profile.feedback')} onPress={() => router.push('/feedback')} />
        <Button
          variant="ghost"
          label={exporting ? t('profile.exporting') : t('profile.export')}
          disabled={exporting}
          onPress={async () => {
            setExporting(true);
            try {
              const data = await api.exportMyData();
              await saveJson(`prayer-tower-data-${data.exportedAt.slice(0, 10)}.json`, data);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setExporting(false);
            }
          }}
        />
        <Button variant="ghost" label={t('profile.signOut')} onPress={signOut} />
        <Button variant="ghost" label={t('profile.deleteAccount')} onPress={() => router.push('/delete-account')} />
        <LegalLinks contact />
      </ScrollView>
    </Screen>
  );
}

function mixLabel(key: FeedMixKey, label: ReturnType<typeof useLocale>['label']) {
  const [kind, value] = key.split(':') as ['type' | 'realm', string];
  return kind === 'type'
    ? label('postType', value, POST_TYPE_LABELS[value as keyof typeof POST_TYPE_LABELS])
    : label('prayerRealm', value, PRAYER_REALM_LABELS[value as keyof typeof PRAYER_REALM_LABELS]);
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 120 },
  stats: { flexDirection: 'row', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  mixRow: { gap: space.xs },
  mixLabel: { fontWeight: '600' },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.primary, textAlign: 'center' },
});

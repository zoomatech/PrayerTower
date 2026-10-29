import {
  FEED_MIX_KEYS,
  isPrayable,
  POST_TYPE_LABELS,
  PRAYER_REALM_LABELS,
  WHY_HERE_LABELS,
  type FeedMix,
  type FeedMixKey,
  type FeedThemeChoices,
  type PostType,
  type PrayerStats,
  type TierStatus,
  type TokenSummary,
} from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AiLinks } from '@/components/ai-links';
import { AwardCard } from '@/components/award-card';
import { LiveHostLink } from '@/components/live-now';
import { CommunityPicker } from '@/components/community-picker';
import { LanguagePicker } from '@/components/language-picker';
import { LegalLinks } from '@/components/legal-links';
import { PrayedForYou } from '@/components/notebook';
import { TownField } from '@/components/town-field';
import { Button, Chip, ErrorText, Screen, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFeature } from '@/lib/community-features';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { saveJson } from '@/lib/save-file';
import { colors, radius, space, type } from '@/lib/theme';

export default function Profile() {
  const { profile, roles, community, refreshProfile, signOut } = useAuth();
  const { t, label, n, wording } = useLocale();
  const poolsOn = useFeature('pools');
  const radioOn = useFeature('radio');
  const podcastsOn = useFeature('podcasts');
  const [tier, setTier] = useState<TierStatus | null>(null);
  const [tokens, setTokens] = useState<TokenSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [feedStyles, setFeedStyles] = useState<FeedThemeChoices | null>(null);
  const [stats, setStats] = useState<PrayerStats | null>(null);
  // "Buy tokens" shows only while an admin has turned purchases on.
  const [storeOn, setStoreOn] = useState(false);
  // "Give" shows only while giving is on; staff see radio requests while members can ask.
  const [giving, setGiving] = useState<{ enabled: boolean; allocationRequests: boolean } | null>(null);
  const features = useFeatures();

  // If the counts can't load, say so instead of showing zeros that look real.
  const [countsError, setCountsError] = useState<string | null>(null);
  const loadCounts = useCallback(() => {
    setCountsError(null);
    api.tier().then(setTier).catch(() => undefined);
    api.tokens().then(setTokens).catch((e) => setCountsError((e as Error).message));
    api.feedThemes().then(setFeedStyles).catch(() => undefined);
    api.tokenStore().then((l) => setStoreOn(l.enabled)).catch(() => undefined);
    api.givingInfo().then(setGiving).catch(() => undefined);
    loadStats();
  }, []);
  useFocusEffect(loadCounts);

  const loadStats = () =>
    api
      .prayerStats(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
      .then((r) => setStats(r.stats))
      .catch(() => undefined);

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

        <ErrorText error={countsError} onRetry={loadCounts} />
        <View style={styles.stats}>
          <View style={[styles.stat, styles.tierStat]}>
            <Text style={[styles.statValue, styles.tierValue]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
              {tier?.tier?.label ? n(tier.tier.label) : '—'}
            </Text>
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
        {tier?.upkeep ? (
          <Text style={type.small}>
            {tier.upkeep.held ? t('profile.tierHeld', { tier: n(tier.upkeep.held.label) }) : t('profile.tierUpkeep', { days: tier.upkeep.days })}
          </Text>
        ) : null}
        {tier?.next ? (
          <Text style={type.small}>
            {t('profile.nextTier', { count: tier.next.prayersNeeded, tier: n(tier.next.label) })}
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

        {stats?.enabled ? (
          <View style={styles.prayerLife} accessibilityLabel={t('stats.summary', { days: stats.daysPrayed, people: stats.peoplePrayedFor, streak: stats.currentStreak })}>
            <Text style={type.heading}>{t('stats.title')}</Text>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{stats.daysPrayed}</Text>
                <Text style={type.small}>{t('stats.days')}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{stats.peoplePrayedFor}</Text>
                <Text style={type.small}>{t('stats.people')}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{stats.currentStreak}</Text>
                <Text style={type.small}>{t('stats.streak')}</Text>
              </View>
            </View>
            <View style={styles.week} accessible={false}>
              {stats.week.map((d) => (
                <View key={d.date} style={[styles.dot, d.prayed && styles.dotOn]} />
              ))}
            </View>
            <Text style={type.small}>
              {stats.currentStreak > 1 ? t('stats.streakNote', { count: stats.currentStreak }) : t('stats.gentle')} {t('stats.private')}
            </Text>
          </View>
        ) : null}
        <AwardCard />
        <PrayedForYou />
        <View style={styles.chips}>
          {poolsOn ? <Button small variant="secondary" label={t('profile.pools')} onPress={() => router.push('/pools')} /> : null}
          <Button small variant="secondary" label={t('vine.branchLink')} onPress={() => router.push('/branch')} />
          <AiLinks />
          <LiveHostLink />
          <Button small variant="secondary" label={t('profile.scheduled')} onPress={() => router.push('/scheduled')} />
          {storeOn ? <Button small variant="secondary" label={t('tokenStore.open')} onPress={() => router.push('/token-store')} /> : null}
          {giving?.enabled || (radioOn && giving?.allocationRequests) ? <Button small variant="secondary" label={t('give.open')} onPress={() => router.push('/give')} /> : null}
          {radioOn ? <Button small variant="secondary" label={t('profile.prayerCast')} onPress={() => router.push('/prayer-cast')} /> : null}
          {features.whyGifts ? <Button small variant="secondary" label={t('whyGifts.link')} onPress={() => router.push('/why-gifts')} /> : null}
          {features.podcasts && podcastsOn ? <Button small variant="secondary" label={t('podcasts.title')} onPress={() => router.push('/podcasts')} /> : null}
          {features.prayerChain ? <Button small variant="secondary" label={t('growth.chainOpen')} onPress={() => router.push('/prayer-chain')} /> : null}
          {features.prayerMinute ? <Button small variant="secondary" label={t('growth.minuteOpen')} onPress={() => router.push('/prayer-minute')} /> : null}
        </View>

        {feedStyles && feedStyles.themes.length > 1 ? (
          <View style={{ gap: space.sm }}>
            <Text style={type.heading}>{t('profile.feedStyle')}</Text>
            <View style={styles.chips}>
              {feedStyles.themes.map((th) => (
                <Chip
                  key={th.slug}
                  label={th.status === 'beta' ? t('profile.beta', { name: n(th.name) }) : n(th.name)}
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
          {FEED_MIX_KEYS.filter((key) => !key.startsWith('type:') || (community ? community.enabledPostTypes.includes(key.slice(5)) : isPrayable(key.slice(5) as PostType))).map((key) => {
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
        <Button variant="secondary" label={t('notifySettings.title')} onPress={() => router.push('/notification-settings')} />
        <Toggle label={t('settings.updatesFirst')} value={profile.updates_in_first_comment} onChange={(v) => update({ updatesInFirstComment: v })} />
        <Toggle
          label={t('stats.toggle')}
          hint={t('stats.toggleHint')}
          value={profile.show_prayer_stats !== false}
          onChange={(v) => update({ showPrayerStats: v }).then(loadStats)}
        />
        <Toggle label={t('settings.digest')} hint={t('settings.digestHint')} value={!!profile.digest_enabled} onChange={(v) => update({ digestEnabled: v })} />
        {features.crossCommunity && wording === 'faith' ? (
          <Toggle label={t('across.toggle')} hint={t('across.toggleHint')} value={!!profile.open_to_other_communities} onChange={(v) => update({ openToOtherCommunities: v })} />
        ) : null}
        {features.memberTown ? <TownField town={profile.town} onSave={(town) => update({ town })} /> : null}
        <CommunityPicker />
        <LanguagePicker />
        <Button variant="ghost" label={t('profile.rules')} onPress={() => router.push('/rules')} />
        {wording === 'faith' ? (
          <Button variant="secondary" label={roles.includes('pastor') ? t('profile.myChurch') : t('profile.churchApply')} onPress={() => router.push('/church')} />
        ) : null}
        {roles.some((r) => r === 'moderator' || r === 'admin') ? (
          <>
            <Button variant="secondary" label={t('profile.moderation')} onPress={() => router.push('/moderation')} />
            <Button variant="secondary" label={t('profile.macroNeeds')} onPress={() => router.push('/macro-needs')} />
          </>
        ) : null}
        {roles.some((r) => r === 'witness' || r === 'moderator' || r === 'admin') ? (
          <Button variant="secondary" label={t('profile.witness')} onPress={() => router.push('/witness')} />
        ) : null}
        {radioOn && giving?.allocationRequests && roles.some((r) => r === 'moderator' || r === 'admin' || r === 'pastor_counselor') ? (
          <Button variant="secondary" label={t('radioRequests.title')} onPress={() => router.push('/radio-requests')} />
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
        <Button variant="ghost" label={t('accountSecurity.title')} onPress={() => router.push('/account-security')} />
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
  prayerLife: { gap: space.sm },
  week: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  mixRow: { gap: space.xs },
  mixLabel: { fontWeight: '600' },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  // Tier names are long (Kindness Champion): a wider tile and smaller text, so no word breaks mid-way.
  tierValue: { fontSize: 14 },
  tierStat: { flex: 1.6 },
});

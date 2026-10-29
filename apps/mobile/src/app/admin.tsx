// Admin console for the pilot (Epic 9): pilot metrics, token settings
// (including whether radio prayers spend Priestly tokens or are free), tier
// thresholds and weekly allotments, and finding people to grant or revoke
// roles. The server checks the admin role on every call.
import { COMMUNITY_FEATURES, POST_TYPE_LABELS, POST_TYPES, type Role } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { HarmSettingsSection, ModerationDashboardSection, ModeratorCareSection, SafetyCenterSection, SafetyDashboardSection } from '@/components/harm-admin';
import { OncallAdminSection } from '@/components/oncall';
import { staffOnly } from '@/components/staff-only';
import { JobsPanel } from '@/components/jobs-panel';
import { LedgerCheckPanel } from '@/components/ledger-check';
import { CoverageSection, PacketFallbackSection, RadioDigestSection, RadioSetupSection } from '@/components/radio-setup-admin';
import { Button, Chip, Field, ErrorText, Screen, Toggle } from '@/components/ui';
import { api, type AdminMessagingSettings, type Award, type AwardSettings, type Community, type SpokenPrayerSettings, type AdminPerson, type AdminRadioSettings, type AdminSafetySettings, type AdminTier, type AdminTokenSettings, type MilestoneRule, type NotebookSettings, type GrowthSettings, type GoldfishSettings, type PracticeSettings, type ConversationSettings, type TalkCountSummary, type CheckInAnswer, type Weather, type WeatherWeek, type HealthWeek, type PilotWeek, type AiSettings, type LiveSettings, type AdminDonationSettings, type AdminGift, type SkinSettings, type ThemeProposal, type TokenPool, type StationBurst, type StationAlerts, type RadioNodes, type StationHealth, type RadioSchedule, type PushDelivery, type PracticeConnected, type PracticeModeSettings, type ReminderSettings, type SecuritySettings, type SkySettings, type SkyNow } from '@/lib/api';
import { HighlightsAdmin } from '@/components/kindness-highlights';
import { MeaningProposalsAdmin } from '@/components/meaning-proposals';
import { resetFeatures, useFeatures } from '@/lib/features';
import { useLocale, useT, type T } from '@/lib/i18n';
import { saveText } from '@/lib/save-file';
import { colors, radius, space, type } from '@/lib/theme';

const PERIODS = [7, 30, 90];
const REPORT_WEEKS = 12;
const TREND: (keyof PilotWeek)[] = ['requests_posted', 'praying_now_taps', 'commitments_made', 'commitment_checkins'];
const ROLES: Role[] = ['admin', 'moderator', 'pastor_counselor', 'witness', 'prayer_partner', 'radio_operator'];

// Metric names come from the server; known ones are translated, the rest are prettified.
const LABELS: Record<string, string> = { ai_flags: 'AI flags', active_pray_ers: 'Active pray-ers', checkins: 'Check-ins' };
const label = (t: T, key: string) =>
  t(`admin.metric.${key}`, { defaultValue: LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) });
const toInt = (s: string) => (s.trim() === '' ? null : Number.parseInt(s, 10));

function Admin() {
  const { t, language } = useLocale();
  const features = useFeatures();
  // A member who lost their phone and backup codes: the first tap asks, the second turns two-step sign-in off.
  const [resetAsk, setResetAsk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [metrics, setMetrics] = useState<Record<string, Record<string, number | string | null>> | null>(null);
  const [weeks, setWeeks] = useState<PilotWeek[]>([]);
  const [radio, setRadio] = useState<AdminRadioSettings | null>(null);
  const [tokens, setTokens] = useState<AdminTokenSettings | null>(null);
  const [tokenDraft, setTokenDraft] = useState({ perToken: '', gap: '', cost: '', perDay: '', amplify: '' });
  const [safety, setSafety] = useState<AdminSafetySettings | null>(null);
  const [safetyDraft, setSafetyDraft] = useState({ hours: '', prayers: '', posts: '', comments: '', postsHour: '', commentsHour: '', messagesMinute: '' });
  const [tiers, setTiers] = useState<AdminTier[]>([]);
  const [tierDraft, setTierDraft] = useState<Record<string, { min: string; weekly: string }>>({});
  const [rules, setRules] = useState<MilestoneRule[]>([]);
  const [ruleDraft, setRuleDraft] = useState<{ label: string; metric: MilestoneRule['metric']; threshold: string; amount: string }>({
    label: '',
    metric: 'prayers_for_others',
    threshold: '',
    amount: '',
  });
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<AdminPerson[] | null>(null);

  const run = async (fn: () => Promise<void>, done?: string) => {
    try {
      setError(null);
      await fn();
      setSaved(done ?? null);
    } catch (e) {
      setSaved(null);
      setError((e as Error).message);
    }
  };

  const showTokens = (s: AdminTokenSettings) => {
    setTokens(s);
    setTokenDraft({ perToken: String(s.priestly_prayers_per_token), gap: String(s.verified_prayer_min_gap_seconds), cost: String(s.radio_prayer_cost), perDay: String(s.verified_prayers_per_day), amplify: s.amplify_paid_cost === null ? '' : String(s.amplify_paid_cost) });
  };
  const showSafety = (s: AdminSafetySettings) => {
    setSafety(s);
    setSafetyDraft({
      hours: String(s.new_member_hours),
      prayers: String(s.new_member_min_prayers),
      posts: String(s.new_member_posts_per_day),
      comments: String(s.new_member_comments_per_day),
      postsHour: String(s.posts_per_hour),
      commentsHour: String(s.comments_per_hour),
      messagesMinute: String(s.messages_per_minute),
    });
  };
  const showTiers = (list: AdminTier[]) => {
    setTiers(list);
    setTierDraft(Object.fromEntries(list.map((x) => [x.tier, { min: x.min_prayer_events?.toString() ?? '', weekly: x.weekly_allotment?.toString() ?? '' }])));
  };

  const load = useCallback(
    () =>
      run(async () => {
        const [m, s, tr, sf, w, rs, ms] = await Promise.all([
          api.admin.metrics(days),
          api.admin.tokenSettings(),
          api.admin.tiers(),
          api.admin.safetySettings(),
          api.admin.pilotReport(REPORT_WEEKS),
          api.admin.radioSettings(),
          api.admin.milestones(),
        ]);
        setRules(ms.rules);
        setMetrics(m);
        setWeeks(w.weeks);
        setRadio(rs.settings);
        showTokens(s.settings);
        showSafety(sf.settings);
        showTiers(tr.tiers);
      }),
    [days],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Web downloads a file; phones hand the CSV to the share sheet (mail, Files, Drive).
  const downloadCsv = () =>
    run(async () => {
      const csv = await api.admin.pilotCsv(REPORT_WEEKS);
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = 'prayer-tower-pilot.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        await Share.share({ title: t('admin.reportTitle'), message: csv });
      }
    });

  // The printable sponsor report (open it in a browser and print to PDF).
  const downloadSponsorReport = () =>
    run(async () => saveText('prayer-tower-pilot-report.html', await api.admin.pilotHtml(REPORT_WEEKS, language === 'es' ? 'es' : 'en'), 'text/html', 'public.html'));

  const saveRadio = (patch: Parameters<typeof api.admin.updateRadioSettings>[0]) =>
    run(async () => setRadio((await api.admin.updateRadioSettings(patch)).settings), t('admin.saved.radio'));

  const saveTokens = () =>
    run(async () => {
      const r = await api.admin.updateTokenSettings({
        priestlyPrayersPerToken: toInt(tokenDraft.perToken) ?? undefined,
        verifiedPrayerMinGapSeconds: toInt(tokenDraft.gap) ?? undefined,
        radioPrayerCost: toInt(tokenDraft.cost) ?? undefined,
        verifiedPrayersPerDay: toInt(tokenDraft.perDay) ?? undefined,
        amplifyPaidCost: tokenDraft.amplify.trim() ? (toInt(tokenDraft.amplify) ?? undefined) : null,
      });
      showTokens(r.settings);
    }, t('admin.saved.tokens'));

  const setFunding = (free: boolean) =>
    run(async () => showTokens((await api.admin.updateTokenSettings({ radioFunding: free ? 'free' : 'tokens' })).settings), t('admin.saved.funding'));

  const saveSafety = (patch: Parameters<typeof api.admin.updateSafetySettings>[0] = {}) =>
    run(async () => {
      const r = await api.admin.updateSafetySettings({
        newMemberHours: toInt(safetyDraft.hours) ?? undefined,
        newMemberMinPrayers: toInt(safetyDraft.prayers) ?? undefined,
        newMemberPostsPerDay: toInt(safetyDraft.posts) ?? undefined,
        newMemberCommentsPerDay: toInt(safetyDraft.comments) ?? undefined,
        postsPerHour: toInt(safetyDraft.postsHour) ?? undefined,
        commentsPerHour: toInt(safetyDraft.commentsHour) ?? undefined,
        messagesPerMinute: toInt(safetyDraft.messagesMinute) ?? undefined,
        ...patch,
      });
      showSafety(r.settings);
    }, t('admin.saved.safety'));

  const saveTiers = () =>
    run(async () => {
      for (const tier of tiers) {
        const d = tierDraft[tier.tier];
        if (!d) continue;
        const min = toInt(d.min);
        const weekly = toInt(d.weekly);
        if (min !== tier.min_prayer_events || weekly !== tier.weekly_allotment) {
          await api.admin.updateTier(tier.tier, { minPrayerEvents: min, weeklyAllotment: weekly });
        }
      }
      showTiers((await api.admin.tiers()).tiers);
    }, t('admin.saved.tiers'));

  const search = () => run(async () => setPeople((await api.admin.people(query)).people));

  const toggleRole = (p: AdminPerson, role: Role) =>
    run(async () => {
      const r = p.roles.includes(role) ? await api.admin.revoke(p.id, role) : await api.admin.grant(p.id, role);
      setPeople((list) => list?.map((x) => (x.id === p.id ? { ...x, roles: r.roles } : x)) ?? null);
    });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('profile.admin')}</Text>
        <ErrorText error={error} />
        {saved ? <Text style={[type.small, { color: colors.primary }]}>{saved}</Text> : null}
        <DeletionRequestsSection />
        <FeedbackSection />
        <PrayerWarriorsSection />

        <View style={styles.section}>
          <Text style={type.heading}>{t('admin.metrics')}</Text>
          <View style={styles.row}>
            {PERIODS.map((d) => (
              <Chip key={d} label={t('admin.days', { count: d })} selected={days === d} onPress={() => setDays(d)} />
            ))}
          </View>
          {metrics
            ? Object.entries(metrics)
                .filter(([, v]) => v && typeof v === 'object')
                .map(([group, values]) => (
                  <View key={group} style={styles.group}>
                    <Text style={styles.groupTitle}>{label(t, group)}</Text>
                    {Object.entries(values).map(([k, v]) => (
                      <View key={k} style={styles.stat}>
                        <Text style={type.body}>{label(t, k)}</Text>
                        <Text style={styles.value}>{v ?? '—'}</Text>
                      </View>
                    ))}
                  </View>
                ))
            : null}
        </View>

        {weeks.length ? (
          <View style={styles.section}>
            <Text style={type.heading}>{t('admin.byWeek')}</Text>
            <View style={styles.trendRow}>
              <Text style={[styles.trendCell, styles.trendWeek, styles.trendHead]}>{t('admin.weekOf')}</Text>
              {TREND.map((c) => (
                <Text key={c} style={[styles.trendCell, styles.trendHead]}>
                  {t(`admin.trend.${c}`)}
                </Text>
              ))}
            </View>
            {[...weeks].reverse().map((w) => (
              <View key={w.week_start} style={styles.trendRow}>
                <Text style={[styles.trendCell, styles.trendWeek]}>{w.week_start.slice(5)}</Text>
                {TREND.map((c) => (
                  <Text key={c} style={styles.trendCell}>
                    {w[c]}
                  </Text>
                ))}
              </View>
            ))}
            <Button variant="secondary" label={t('admin.downloadCsv', { weeks: REPORT_WEEKS })} onPress={downloadCsv} />
            <Button variant="secondary" label={t('admin.downloadSponsor', { weeks: REPORT_WEEKS })} onPress={downloadSponsorReport} />
            <Button variant="secondary" label={t('admin.ops')} onPress={() => router.push('/ops')} />
            <Button variant="secondary" label={t('admin.auditLog')} onPress={() => router.push('/audit-log')} />
            <Button variant="secondary" label={t('admin.invites')} onPress={() => router.push('/invites')} />
            <Button variant="secondary" label={t('waitlist.title')} onPress={() => router.push('/waitlist')} />
            <Button variant="secondary" label={t('admin.churches')} onPress={() => router.push('/churches')} />
            <Button variant="secondary" label={t('admin.announcements')} onPress={() => router.push('/announcements')} />
            <Button variant="secondary" label={t('admin.surveys')} onPress={() => router.push('/surveys')} />
            <Button variant="secondary" label={t('admin.legal')} onPress={() => router.push('/legal')} />
            <Button variant="secondary" label={t('admin.podcasts')} onPress={() => router.push('/podcasts-admin')} />
          </View>
        ) : null}

        {tokens ? (
          <View style={styles.section}>
            <JobsPanel />
          </View>
        ) : null}

        {tokens ? (
          <View style={styles.section}>
            <Text style={type.heading}>{t('admin.tokens')}</Text>
            <LedgerCheckPanel />
            <Toggle
              label={t('admin.radioFree')}
              hint={t('admin.radioFreeHint')}
              value={tokens.radio_funding === 'free'}
              onChange={setFunding}
            />
            <Field label={t('admin.field.perToken')} keyboardType="number-pad" value={tokenDraft.perToken} onChangeText={(perToken) => setTokenDraft((d) => ({ ...d, perToken }))} />
            <Field label={t('admin.field.gap')} keyboardType="number-pad" value={tokenDraft.gap} onChangeText={(gap) => setTokenDraft((d) => ({ ...d, gap }))} />
            <Field label={t('admin.field.cost')} keyboardType="number-pad" value={tokenDraft.cost} onChangeText={(cost) => setTokenDraft((d) => ({ ...d, cost }))} />
            <Field label={t('admin.field.verifiedPerDay')} keyboardType="number-pad" value={tokenDraft.perDay} onChangeText={(perDay) => setTokenDraft((d) => ({ ...d, perDay }))} />
            <Field label={t('admin.field.amplifyCost')} keyboardType="number-pad" value={tokenDraft.amplify} onChangeText={(amplify) => setTokenDraft((d) => ({ ...d, amplify }))} />
            <Button label={t('admin.btn.saveTokens')} onPress={saveTokens} />
          </View>
        ) : null}

        {safety ? (
          <View style={styles.section}>
            <Text style={type.heading}>{t('admin.newMembers')}</Text>
            <Toggle
              label={t('admin.toggle.limitNew')}
              hint={t('admin.toggle.limitNewHint')}
              value={safety.new_member_limits_enabled}
              onChange={(v) => saveSafety({ newMemberLimitsEnabled: v })}
            />
            <Toggle label={t('admin.toggle.links')} value={safety.new_member_links_allowed} onChange={(v) => saveSafety({ newMemberLinksAllowed: v })} />
            <Field label={t('admin.field.hours')} keyboardType="number-pad" value={safetyDraft.hours} onChangeText={(hours) => setSafetyDraft((d) => ({ ...d, hours }))} />
            <Field label={t('admin.field.prayers')} keyboardType="number-pad" value={safetyDraft.prayers} onChangeText={(prayers) => setSafetyDraft((d) => ({ ...d, prayers }))} />
            <Field label={t('admin.field.posts')} keyboardType="number-pad" value={safetyDraft.posts} onChangeText={(posts) => setSafetyDraft((d) => ({ ...d, posts }))} />
            <Field label={t('admin.field.comments')} keyboardType="number-pad" value={safetyDraft.comments} onChangeText={(comments) => setSafetyDraft((d) => ({ ...d, comments }))} />
            <Text style={type.small}>{t('admin.everyoneLimits')}</Text>
            <Field label={t('admin.field.postsHour')} keyboardType="number-pad" value={safetyDraft.postsHour} onChangeText={(postsHour) => setSafetyDraft((d) => ({ ...d, postsHour }))} />
            <Field label={t('admin.field.commentsHour')} keyboardType="number-pad" value={safetyDraft.commentsHour} onChangeText={(commentsHour) => setSafetyDraft((d) => ({ ...d, commentsHour }))} />
            <Field label={t('admin.field.messagesMinute')} keyboardType="number-pad" value={safetyDraft.messagesMinute} onChangeText={(messagesMinute) => setSafetyDraft((d) => ({ ...d, messagesMinute }))} />
            <Button label={t('admin.btn.saveSafety')} onPress={() => saveSafety()} />
          </View>
        ) : null}

        <MessagingSettingsSection />
        <CareAndEventSettingsSection />
        <NotebookSettingsSection />
        <GrowthSettingsSection />
        <GivingSplitSection />
        <PushDeliverySection />
        <ReminderSettingsSection />
        <PracticeModeSection />
        <ModerationToolsSection />
        <GoldfishSection />
        <PracticeSettingsSection />
        <ConversationSettingsSection />
        <SkinSettingsSection />
        <CommunitiesSection />
        <SpokenPrayerSection />
        <MaterialMatchSection />
        <AwardSection />
        <AiSection />
        <LiveSection />
        <GivingSection />
        <SecuritySection />
        <HarmSettingsSection />
        <ModeratorCareSection />
        <OncallAdminSection />
        <ModerationDashboardSection />
        <SafetyDashboardSection />
        <SafetyCenterSection />
        <ReminderToneSection />

        {radio ? (
          <View style={styles.section}>
            <Text style={type.heading}>{t('admin.radio')}</Text>
            <View style={styles.row}>
              <Chip label={t('admin.logOnly')} selected={radio.radio_transmitter === 'log'} onPress={() => saveRadio({ transmitter: 'log' })} />
              <Chip label={t('admin.station')} selected={radio.radio_transmitter === 'station'} onPress={() => saveRadio({ transmitter: 'station' })} />
            </View>
            <Toggle
              label={t('admin.toggle.stationFree')}
              hint={t('admin.toggle.stationFreeHint')}
              value={radio.radio_station_requires_free}
              onChange={(v) => saveRadio({ stationRequiresFree: v })}
            />
            <Text style={type.small}>{t('admin.radioOrder')}</Text>
            <View style={styles.row}>
              <Chip label={t('admin.radioOldest')} selected={radio.radio_order !== 'need'} onPress={() => saveRadio({ order: 'oldest' })} />
              <Chip label={t('admin.radioNeed')} selected={radio.radio_order === 'need'} onPress={() => saveRadio({ order: 'need' })} />
            </View>
            {radio.radio_order === 'need' ? <Text style={type.small}>{t('admin.radioNeedHint')}</Text> : null}
            <Toggle
              label={t('admin.radioUrgentFirst')}
              hint={t('admin.radioUrgentFirstHint')}
              value={radio.radio_urgent_first}
              onChange={(v) => saveRadio({ urgentFirst: v })}
            />
            <Text style={type.small}>{t('admin.radioBurst')}</Text>
            <View style={styles.row}>
              {[1, 10, 50, 100, 500].map((n) => (
                <Chip key={n} label={n === 1 ? t('admin.radioBurstOne') : String(n)} selected={radio.radio_batch_max === n} onPress={() => saveRadio({ batchMax: n })} />
              ))}
            </View>
            {radio.radio_batch_max > 1 ? <Text style={type.small}>{t('admin.radioBurstHint')}</Text> : null}
            {radio.radio_transmitter === 'station' ? <RadioSetupSection /> : null}
            {radio.radio_transmitter === 'station' ? <StationAlertsSection /> : null}
            {radio.radio_transmitter === 'station' ? <StationHealthSection /> : null}
            {radio.radio_transmitter === 'station' ? <RadioScheduleSection /> : null}
            {radio.radio_transmitter === 'station' ? <OperatorLogSection /> : null}
            {radio.radio_transmitter === 'station' ? <RadioConsoleSection /> : null}
            {radio.radio_transmitter === 'station' ? <SkyTargetSection /> : null}
            <CeaselessSection />
            {radio.radio_transmitter === 'station' ? <ListenerModeSection /> : null}
            {radio.radio_transmitter === 'station' ? <RadioFollowupsSection /> : null}
            {radio.radio_transmitter === 'station' ? <RadioNodesSection burst={radio.radio_batch_max > 1} /> : null}
            {radio.radio_transmitter === 'station' ? <PacketFallbackSection /> : null}
            {radio.radio_transmitter === 'station' ? <CoverageSection /> : null}
            {radio.radio_transmitter === 'station' ? <RadioDigestSection /> : null}
            {radio.radio_batch_max > 1 ? <RecentBursts /> : null}
            {radio.radio_batch_max > 1 ? (
              <>
                <View style={styles.row}>
                  <Chip label={t('admin.listenPageOff')} selected={!radio.listen_page_enabled} onPress={() => saveRadio({ listenPage: false })} />
                  <Chip label={t('admin.listenPageOn')} selected={radio.listen_page_enabled} onPress={() => saveRadio({ listenPage: true })} />
                </View>
                <Text style={type.small}>{t('admin.listenPageHint')}</Text>
              </>
            ) : null}
            <View style={styles.row}>
              <Chip label={t('admin.receiptsOff')} selected={!radio.radio_receipts_enabled} onPress={() => saveRadio({ receipts: false })} />
              <Chip label={t('admin.receiptsOn')} selected={radio.radio_receipts_enabled} onPress={() => saveRadio({ receipts: true })} />
            </View>
            <Text style={type.small}>{t('admin.receiptsHint')}</Text>
            <View style={styles.row}>
              <Chip label={t('admin.onAirOff')} selected={!radio.on_air_page_enabled} onPress={() => saveRadio({ onAirPage: false })} />
              <Chip label={t('admin.onAirOn')} selected={radio.on_air_page_enabled} onPress={() => saveRadio({ onAirPage: true })} />
            </View>
            <Text style={type.small}>{t('admin.onAirHint')}</Text>
            <Text style={type.small}>
              {t('admin.amplify', { count: radio.radio_amplify_repeats })}
            </Text>
            <View style={styles.row}>
              {[2, 3, 5, 10, 100, 1000].map((n) => (
                <Chip key={n} label={`${n}x`} selected={radio.radio_amplify_repeats === n} onPress={() => saveRadio({ amplifyRepeats: n })} />
              ))}
            </View>
            {radio.radio_amplify_repeats > 50 ? <Text style={type.small}>{t('admin.amplifyBurstHint')}</Text> : null}
            {radio.radio_transmitter === 'station' && radio.radio_station_requires_free && tokens?.radio_funding !== 'free' ? (
              <Text style={[type.small, { color: colors.danger }]}>{t('admin.paused')}</Text>
            ) : null}
          </View>
        ) : null}

        {tiers.length ? (
          <View style={styles.section}>
            <Text style={type.heading}>{t('admin.tiers')}</Text>
            <Text style={type.small}>{t('admin.tiersHint')}</Text>
            {tiers.map((tier) => (
              <View key={tier.tier} style={styles.group}>
                <Text style={styles.groupTitle}>{tier.label}</Text>
                <Field
                  label={t('admin.field.tierMin')}
                  keyboardType="number-pad"
                  value={tierDraft[tier.tier]?.min ?? ''}
                  onChangeText={(min) => setTierDraft((d) => ({ ...d, [tier.tier]: { weekly: d[tier.tier]?.weekly ?? '', min } }))}
                />
                <Field
                  label={t('admin.field.tierWeekly')}
                  keyboardType="number-pad"
                  value={tierDraft[tier.tier]?.weekly ?? ''}
                  onChangeText={(weekly) => setTierDraft((d) => ({ ...d, [tier.tier]: { min: d[tier.tier]?.min ?? '', weekly } }))}
                />
              </View>
            ))}
            <Button label={t('admin.btn.saveTiers')} onPress={saveTiers} />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={type.heading}>{t('admin.milestones')}</Text>
          <Text style={type.small}>{t('admin.milestonesHint')}</Text>
          {rules.map((r) => (
            <View key={r.id} style={styles.group}>
              <Toggle
                label={r.label}
                hint={`${t(`admin.ruleMetric.${r.metric}`)}: ${r.threshold} → ${t(r.currency === 'priestly' ? 'admin.priestlyTokens' : 'admin.regularTokens', { count: r.amount })} · ${t('admin.given', { count: r.awarded })}`}
                value={r.enabled}
                onChange={(enabled) =>
                  run(async () => {
                    const { rule } = await api.admin.updateMilestone(r.id, { enabled });
                    setRules((all) => all.map((x) => (x.id === r.id ? { ...x, ...rule } : x)));
                  }, enabled ? t('admin.saved.ruleOn') : t('admin.saved.ruleOff'))
                }
              />
            </View>
          ))}
          <View style={styles.group}>
            <Text style={styles.groupTitle}>{t('admin.addRuleTitle')}</Text>
            <View style={styles.row}>
              {METRICS.map((m) => (
                <Chip key={m} label={t(`admin.ruleMetric.${m}`)} selected={ruleDraft.metric === m} onPress={() => setRuleDraft((d) => ({ ...d, metric: m }))} />
              ))}
            </View>
            <Field label={t('admin.field.ruleName')} value={ruleDraft.label} onChangeText={(label) => setRuleDraft((d) => ({ ...d, label }))} maxLength={80} />
            <Field label={t('admin.field.ruleAt')} keyboardType="number-pad" value={ruleDraft.threshold} onChangeText={(threshold) => setRuleDraft((d) => ({ ...d, threshold }))} />
            <Field label={t('admin.field.ruleAmount')} keyboardType="number-pad" value={ruleDraft.amount} onChangeText={(amount) => setRuleDraft((d) => ({ ...d, amount }))} />
            <Button
              label={t('admin.btn.addRule')}
              disabled={!ruleDraft.label.trim() || !(Number(ruleDraft.threshold) > 0) || !(Number(ruleDraft.amount) > 0)}
              onPress={() =>
                run(async () => {
                  const { rule } = await api.admin.addMilestone({
                    label: ruleDraft.label.trim(),
                    metric: ruleDraft.metric,
                    threshold: Number(ruleDraft.threshold),
                    amount: Number(ruleDraft.amount),
                  });
                  setRules((all) => [...all, { ...rule, awarded: 0 }]);
                  setRuleDraft((d) => ({ ...d, label: '', threshold: '', amount: '' }));
                }, t('admin.saved.ruleAdded'))
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={type.heading}>{t('admin.people')}</Text>
          <Field placeholder={t('admin.search')} value={query} onChangeText={setQuery} onSubmitEditing={search} autoCapitalize="none" />
          <Button variant="secondary" label={t('admin.btn.find')} disabled={!query.trim()} onPress={search} />
          {people?.length === 0 ? <Text style={type.small}>{t('admin.noMatch')}</Text> : null}
          {people?.map((p) => (
            <View key={p.id} style={styles.group}>
              <Text style={styles.groupTitle}>{p.display_name}</Text>
              {p.email ? <Text style={type.small}>{p.email}</Text> : null}
              <View style={styles.row}>
                {ROLES.map((r) => (
                  <Chip key={r} label={t(`admin.role.${r}`)} selected={p.roles.includes(r)} onPress={() => toggleRole(p, r)} />
                ))}
              </View>
              {features.twoStep || features.backupCodes ? (
                <Button
                  small
                  variant="ghost"
                  label={resetAsk === p.id ? t('backupCodes.adminResetSure') : t('backupCodes.adminReset')}
                  onPress={() =>
                    resetAsk === p.id
                      ? run(async () => {
                          await api.admin.resetTwoStep(p.id);
                          setResetAsk(null);
                        }, t('backupCodes.adminResetDone', { name: p.display_name }))
                      : setResetAsk(p.id)
                  }
                />
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const METRICS: MilestoneRule['metric'][] = ['prayers_for_others', 'commitment_checkins', 'answered_requests'];

/**
 * Requests from the public account-deletion web page. Email the person from
 * the account's address first to confirm it's them; then delete.
 */
function DeletionRequestsSection() {
  const { t, language } = useLocale();
  const [requests, setRequests] = useState<Awaited<ReturnType<typeof api.admin.deletionRequests>>['requests']>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api.admin
      .deletionRequests()
      .then((r) => setRequests(r.requests))
      .catch(() => undefined);
  }, []);
  useFocusEffect(load);
  if (!requests.length) return null;
  const decide = (id: string, action: 'delete' | 'dismiss') =>
    api.admin
      .decideDeletionRequest(id, action)
      .then(() => {
        setConfirm(null);
        load();
      })
      .catch((e) => setError((e as Error).message));
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.deletion')}</Text>
      <Text style={type.small}>{t('admin.deletionHint')}</Text>
      <ErrorText error={error} />
      {requests.map((r) => (
        <View key={r.id} style={styles.group}>
          <Text style={styles.groupTitle}>{r.email}</Text>
          <Text style={type.small}>
            {new Date(r.createdAt).toLocaleDateString(language)} · {r.accountFound ? t('admin.found') : t('admin.notFound')}
          </Text>
          {r.note ? <Text style={type.body}>{r.note}</Text> : null}
          <View style={styles.row}>
            {r.accountFound ? (
              <Button
                small
                label={confirm === r.id ? t('admin.confirmDelete') : t('admin.deleteAccount')}
                onPress={() => (confirm === r.id ? decide(r.id, 'delete') : setConfirm(r.id))}
              />
            ) : null}
            <Button small variant="ghost" label={t('admin.btn.dismiss')} onPress={() => decide(r.id, 'dismiss')} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Radio nodes: receive-only listener nodes and extra stations sharing the queue,
 * each with its own key (shown once). Both off by default.
 */
function RadioNodesSection({ burst }: { burst: boolean }) {
  const t = useT();
  const [data, setData] = useState<RadioNodes | null>(null);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);
  const load = useCallback(() => {
    api.admin.radioNodes().then(setData).catch(() => undefined);
  }, []);
  useFocusEffect(load);
  if (!data) return null;
  const add = async (role: 'listener' | 'station') => {
    if (!name.trim()) return;
    const made = await api.admin.addRadioNode(name.trim(), role).catch(() => null);
    if (made) {
      setNewKey({ name: made.node.name, key: made.key });
      setName('');
      load();
    }
  };
  const save = (patch: { enabled?: boolean; multiStation?: boolean; signaturesRequired?: boolean }) => api.admin.setRadioNodesEnabled(patch).then(load).catch(() => undefined);
  const shown = data.nodes.filter((n) => (n.role === 'listener' ? data.enabled : data.multiStation));
  return (
    <View>
      <View style={styles.row}>
        <Chip label={t('admin.multiStationOff')} selected={!data.multiStation} onPress={() => save({ multiStation: false })} />
        <Chip label={t('admin.multiStationOn')} selected={data.multiStation} onPress={() => save({ multiStation: true })} />
      </View>
      <Text style={type.small}>{t('admin.multiStationHint')}</Text>
      {data.multiStation
        ? data.stations.map((s) => (
            <Text key={s.node ?? 'main'} style={type.small}>
              {t('admin.stationCount', { name: s.node ?? t('admin.mainStation'), sending: s.sending, sent: s.sent })}
            </Text>
          ))
        : null}
      {burst ? (
        <>
          <View style={styles.row}>
            <Chip label={t('admin.listenersOff')} selected={!data.enabled} onPress={() => save({ enabled: false })} />
            <Chip label={t('admin.listenersOn')} selected={data.enabled} onPress={() => save({ enabled: true })} />
          </View>
          <Text style={type.small}>{t('admin.listenersHint')}</Text>
          {data.enabled ? (
            <Toggle label={t('admin.signedReports')} hint={t('admin.signedReportsHint')} value={data.signaturesRequired} onChange={(v) => save({ signaturesRequired: v })} />
          ) : null}
        </>
      ) : null}
      {shown.map((n) => (
        <View key={n.id} style={styles.row}>
          <Text style={type.small}>
            {t(n.role === 'station' ? 'admin.stationNodeLine' : 'admin.listenerLine', { name: n.name, seen: n.last_seen_at ? new Date(n.last_seen_at).toLocaleString() : t('admin.listenerNever') })}
          </Text>
          <Chip label={n.enabled ? t('admin.listenerOn') : t('admin.listenerOff')} selected={n.enabled} onPress={() => api.admin.updateRadioNode(n.id, { enabled: !n.enabled }).then(load)} />
          <Button small variant="ghost" label={t('admin.listenerRemove')} onPress={() => api.admin.removeRadioNode(n.id).then(load)} />
        </View>
      ))}
      {data.enabled
        ? data.reports.map((r) => (
            <Text key={r.node} style={type.small}>
              {t('admin.listenerHeard', { name: r.node, callSign: r.call_sign, snr: r.snr_db, preset: r.preset, when: new Date(r.heard_at).toLocaleString() })}
            </Text>
          ))
        : null}
      {data.enabled || data.multiStation ? (
        <>
          <Field label={t('admin.listenerName')} value={name} onChangeText={setName} />
          <View style={styles.row}>
            {data.enabled ? <Button variant="secondary" label={t('admin.listenerAdd')} onPress={() => add('listener')} /> : null}
            {data.multiStation ? <Button variant="secondary" label={t('admin.stationAdd')} onPress={() => add('station')} /> : null}
          </View>
          {newKey ? (
            <Text selectable style={type.small}>
              {t('admin.listenerKey', { name: newKey.name, key: newKey.key })}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** Station health alerts: no sound card, PTT failed, a failed or overdue burst, a silent station, an empty queue. Off by default. */
function StationAlertsSection() {
  const t = useT();
  const [data, setData] = useState<StationAlerts | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.radioAlerts().then(setData).catch(() => undefined);
    }, []),
  );
  if (!data) return null;
  const save = (patch: Parameters<typeof api.admin.updateRadioAlerts>[0]) => api.admin.updateRadioAlerts(patch).then(setData).catch(() => undefined);
  return (
    <View>
      <View style={styles.row}>
        <Chip label={t('admin.stationAlertsOff')} selected={!data.enabled} onPress={() => save({ enabled: false })} />
        <Chip label={t('admin.stationAlertsOn')} selected={data.enabled} onPress={() => save({ enabled: true })} />
      </View>
      <Text style={type.small}>{t('admin.stationAlertsHint')}</Text>
      {data.enabled ? (
        <>
          <Text style={type.small}>{t('admin.stationOverdue')}</Text>
          <View style={styles.row}>
            {[15, 30, 60, 120].map((n) => (
              <Chip key={n} label={t('admin.stationMinutes', { count: n })} selected={data.overdueMinutes === n} onPress={() => save({ overdueMinutes: n })} />
            ))}
          </View>
          {data.alerts.length ? (
            data.alerts.map((a, i) => (
              <Text key={`${a.kind}-${i}`} style={[type.small, a.level === 'problem' ? { color: colors.danger } : null]}>
                {t(`admin.stationAlert.${a.kind}`)}
                {a.callSign ? ` (${a.callSign})` : ''}
                {a.detail && a.kind !== 'queue_empty' ? ` ${a.detail}` : ''}
              </Text>
            ))
          ) : (
            <Text style={type.small}>{t('admin.stationAlertsNone')}</Text>
          )}
        </>
      ) : null}
    </View>
  );
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Transmission windows and quiet hours (radio/schedule.ts), off by default. */
function RadioScheduleSection() {
  const t = useT();
  const [data, setData] = useState<{ schedule: RadioSchedule; onAirNow: boolean } | null>(null);
  const [draft, setDraft] = useState<RadioSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = (d: { schedule: RadioSchedule; onAirNow: boolean }) => {
    setData(d);
    setDraft(d.schedule);
  };
  useFocusEffect(
    useCallback(() => {
      api.admin.radioSchedule().then(load).catch(() => undefined);
    }, []),
  );
  if (!data || !draft) return null;
  const save = (patch: Partial<RadioSchedule>) => {
    setError(null);
    api.admin.updateRadioSchedule(patch).then(load).catch((e: Error) => setError(e.message));
  };
  // Sun ... Sat (4 January 2026 was a Sunday).
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + d))));
  const setWindow = (i: number, w: Partial<RadioSchedule['windows'][number]>) => setDraft({ ...draft, windows: draft.windows.map((x, j) => (j === i ? { ...x, ...w } : x)) });
  const valid = draft.windows.every((w) => w.days.length && HHMM.test(w.start) && HHMM.test(w.end)) && [draft.quietStart, draft.quietEnd].every((v) => !v || HHMM.test(v));
  return (
    <View>
      <View style={styles.row}>
        <Chip label={t('admin.scheduleOff')} selected={!data.schedule.enabled} onPress={() => save({ enabled: false })} />
        <Chip label={t('admin.scheduleOn')} selected={data.schedule.enabled} onPress={() => save({ enabled: true })} />
      </View>
      <Text style={type.small}>{t('admin.scheduleHint')}</Text>
      {data.schedule.enabled ? (
        <>
          <Text style={[type.small, data.onAirNow ? null : { color: colors.danger }]}>{t(`admin.scheduleNow.${data.onAirNow ? 'on' : 'off'}`)}</Text>
          <Field label={t('admin.scheduleTz')} value={draft.timeZone} autoCapitalize="none" onChangeText={(v) => setDraft({ ...draft, timeZone: v })} />
          <Text style={type.small}>{t('admin.scheduleQuiet')}</Text>
          <View style={styles.row}>
            <Field label={t('admin.scheduleQuietStart')} value={draft.quietStart ?? ''} placeholder="22:00" onChangeText={(v) => setDraft({ ...draft, quietStart: v.trim() || null })} />
            <Field label={t('admin.scheduleQuietEnd')} value={draft.quietEnd ?? ''} placeholder="06:00" onChangeText={(v) => setDraft({ ...draft, quietEnd: v.trim() || null })} />
          </View>
          <Text style={type.small}>{t('admin.scheduleWindows')}</Text>
          {draft.windows.map((w, i) => (
            <View key={i}>
              <View style={styles.row}>
                {days.map((d, day) => (
                  <Chip key={d} label={d} selected={w.days.includes(day)} onPress={() => setWindow(i, { days: w.days.includes(day) ? w.days.filter((x) => x !== day) : [...w.days, day].sort() })} />
                ))}
              </View>
              <View style={styles.row}>
                <Field label={t('admin.scheduleStart')} value={w.start} placeholder="18:00" onChangeText={(v) => setWindow(i, { start: v.trim() })} />
                <Field label={t('admin.scheduleEnd')} value={w.end} placeholder="21:00" onChangeText={(v) => setWindow(i, { end: v.trim() })} />
                <Button small variant="ghost" label={t('admin.scheduleRemove')} onPress={() => setDraft({ ...draft, windows: draft.windows.filter((_, j) => j !== i) })} />
              </View>
            </View>
          ))}
          <View style={styles.row}>
            <Button small variant="ghost" label={t('admin.scheduleAdd')} onPress={() => setDraft({ ...draft, windows: [...draft.windows, { days: [1, 2, 3, 4, 5], start: '18:00', end: '21:00' }] })} />
            <Button small label={t('admin.scheduleSave')} disabled={!valid} onPress={() => save({ timeZone: draft.timeZone.trim(), quietStart: draft.quietStart, quietEnd: draft.quietEnd, windows: draft.windows })} />
          </View>
          <ErrorText error={error} />
        </>
      ) : null}
    </View>
  );
}

/** Prayer without ceasing (radio/ceaseless.ts), off by default. */
function CeaselessSection() {
  const t = useT();
  const [s, setS] = useState<{ enabled: boolean; gapMinutes: number } | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.radioCeaseless().then(setS).catch(() => undefined);
    }, []),
  );
  if (!s) return null;
  const save = (patch: { enabled?: boolean; gapMinutes?: number }) => api.admin.setRadioCeaseless(patch).then(setS).catch(() => undefined);
  return (
    <View>
      <Toggle label={t('admin.ceaseless')} hint={t('admin.ceaselessHint')} value={s.enabled} onChange={(v) => save({ enabled: v })} />
      {s.enabled ? (
        <View style={styles.row}>
          {[15, 30, 60, 120].map((m) => (
            <Chip key={m} label={t('admin.ceaselessGap', { minutes: m })} selected={s.gapMinutes === m} onPress={() => save({ gapMinutes: m })} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The dish's sky target (radio/sky.ts), off by default. */
function SkyTargetSection() {
  const t = useT();
  const [data, setData] = useState<{ settings: SkySettings; now: SkyNow | null } | null>(null);
  const [place, setPlace] = useState({ lat: '', lon: '' });
  const [custom, setCustom] = useState({ name: '', ra: '', dec: '' });
  const [error, setError] = useState<string | null>(null);
  const show = (r: { settings: SkySettings; now: SkyNow | null }) => {
    setData(r);
    setPlace({ lat: r.settings.location ? String(r.settings.location.lat) : '', lon: r.settings.location ? String(r.settings.location.lon) : '' });
    setCustom({ name: r.settings.custom?.name ?? '', ra: r.settings.custom ? String(r.settings.custom.raHours) : '', dec: r.settings.custom ? String(r.settings.custom.decDeg) : '' });
  };
  useFocusEffect(
    useCallback(() => {
      api.admin.radioSky().then(show).catch(() => undefined);
    }, []),
  );
  if (!data) return null;
  const save = (patch: Partial<SkySettings>) => {
    setError(null);
    api.admin.setRadioSky(patch).then(show).catch((e: Error) => setError(e.message));
  };
  const s = data.settings;
  const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
  return (
    <View>
      <Toggle label={t('admin.sky')} hint={t('admin.skyHint')} value={s.enabled} onChange={(v) => save({ enabled: v })} />
      {s.enabled ? (
        <>
          <View style={styles.row}>
            {(['zenith', 'moon', 'alpha_centauri', 'custom'] as const).map((k) => (
              <Chip key={k} label={t(`operatorConsole.skyTarget.${k}`)} selected={s.target === k} onPress={() => save({ target: k })} />
            ))}
          </View>
          {s.target === 'custom' ? (
            <>
              <Field label={t('admin.skyCustomName')} value={custom.name} onChangeText={(v) => setCustom((c) => ({ ...c, name: v }))} maxLength={40} />
              <Field label={t('admin.skyCustomRa')} value={custom.ra} onChangeText={(v) => setCustom((c) => ({ ...c, ra: v }))} keyboardType="numbers-and-punctuation" />
              <Field label={t('admin.skyCustomDec')} value={custom.dec} onChangeText={(v) => setCustom((c) => ({ ...c, dec: v }))} keyboardType="numbers-and-punctuation" />
              <Button
                small
                label={t('admin.skySave')}
                disabled={!custom.name.trim() || Number.isNaN(num(custom.ra)) || Number.isNaN(num(custom.dec))}
                onPress={() => save({ custom: { name: custom.name.trim(), raHours: num(custom.ra), decDeg: num(custom.dec) } })}
              />
            </>
          ) : null}
          <Field label={t('admin.skyLat')} value={place.lat} onChangeText={(v) => setPlace((p) => ({ ...p, lat: v }))} keyboardType="numbers-and-punctuation" />
          <Field label={t('admin.skyLon')} value={place.lon} onChangeText={(v) => setPlace((p) => ({ ...p, lon: v }))} keyboardType="numbers-and-punctuation" />
          <Button
            small
            label={t('admin.skySave')}
            disabled={Number.isNaN(num(place.lat)) || Number.isNaN(num(place.lon))}
            onPress={() => save({ location: { lat: num(place.lat), lon: num(place.lon) } })}
          />
          <Text style={type.small}>{t('admin.skyMinElevation')}</Text>
          <View style={styles.row}>
            {[0, 5, 10, 20, 30].map((m) => (
              <Chip key={m} label={`${m}°`} selected={s.minElevation === m} onPress={() => save({ minElevation: m })} />
            ))}
          </View>
          <Toggle label={t('admin.skyHold')} hint={t('admin.skyHoldHint')} value={s.holdBelow} onChange={(v) => save({ holdBelow: v })} />
          {data.now ? (
            <Text style={type.small}>
              {t('operatorConsole.skyPoint', { target: data.now.name ?? t(`operatorConsole.skyTarget.${data.now.target}`), az: data.now.az.toFixed(1), el: data.now.el.toFixed(1) })}
            </Text>
          ) : (
            <Text style={type.small}>{t('admin.skyNeedsPlace')}</Text>
          )}
          <ErrorText error={error} />
        </>
      ) : null}
    </View>
  );
}

/** The operator console, operator alert and reception beacon switches (radio/console.ts, operator-alerts.ts, beacon.ts), off by default. */
function RadioConsoleSection() {
  const t = useT();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [alerts, setAlerts] = useState<boolean | null>(null);
  const [beacon, setBeacon] = useState<{ enabled: boolean; minutes: number } | null>(null);
  const saveBeacon = (patch: { enabled?: boolean; minutes?: number }) => api.admin.setRadioBeacon(patch).then(setBeacon).catch(() => undefined);
  useFocusEffect(
    useCallback(() => {
      api.admin.radioConsole().then((r) => setEnabled(r.enabled)).catch(() => undefined);
      api.admin.operatorAlerts().then((r) => setAlerts(r.enabled)).catch(() => undefined);
      api.admin.radioBeacon().then(setBeacon).catch(() => undefined);
    }, []),
  );
  if (enabled === null) return null;
  const set = (on: boolean) => api.admin.setRadioConsole(on).then((r) => setEnabled(r.enabled)).catch(() => undefined);
  return (
    <View>
      <View style={styles.row}>
        <Chip label={t('admin.radioConsoleOff')} selected={!enabled} onPress={() => set(false)} />
        <Chip label={t('admin.radioConsoleOn')} selected={enabled} onPress={() => set(true)} />
      </View>
      <Text style={type.small}>{t('admin.radioConsoleHint')}</Text>
      {enabled ? <Button small label={t('profile.operatorConsole')} onPress={() => router.push('/operator-console')} /> : null}
      {alerts !== null ? (
        <Toggle label={t('admin.operatorAlerts')} hint={t('admin.operatorAlertsHint')} value={alerts} onChange={(v) => api.admin.setOperatorAlerts(v).then((r) => setAlerts(r.enabled)).catch(() => undefined)} />
      ) : null}
      {beacon ? (
        <>
          <Toggle label={t('admin.radioBeacon')} hint={t('admin.radioBeaconHint')} value={beacon.enabled} onChange={(v) => saveBeacon({ enabled: v })} />
          {beacon.enabled ? (
            <View style={styles.row}>
              {[30, 60, 120, 240].map((m) => (
                <Chip key={m} label={t('admin.radioBeaconEvery', { minutes: m })} selected={beacon.minutes === m} onPress={() => saveBeacon({ minutes: m })} />
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** The operator log as CSV (radio/oplog.ts), off by default. */
function OperatorLogSection() {
  const t = useT();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.operatorLog().then((r) => setEnabled(r.enabled)).catch(() => undefined);
    }, []),
  );
  if (enabled === null) return null;
  const set = (on: boolean) => api.admin.setOperatorLog(on).then((r) => setEnabled(r.enabled)).catch(() => undefined);
  const download = () => {
    setError(null);
    api.admin
      .operatorLogCsv()
      .then((csv) => saveText('prayer-tower-operator-log.csv', csv, 'text/csv', 'public.comma-separated-values-text'))
      .catch((e: Error) => setError(e.message));
  };
  return (
    <View>
      <View style={styles.row}>
        <Chip label={t('admin.operatorLogOff')} selected={!enabled} onPress={() => set(false)} />
        <Chip label={t('admin.operatorLogOn')} selected={enabled} onPress={() => set(true)} />
      </View>
      <Text style={type.small}>{t('admin.operatorLogHint')}</Text>
      {enabled ? <Button small label={t('admin.operatorLogDownload')} onPress={download} /> : null}
      <ErrorText error={error} />
    </View>
  );
}

/** Thanksgiving bursts for answered requests, and listeners' "I'm praying too" (both off by default). */
function RadioFollowupsSection() {
  const t = useT();
  const [data, setData] = useState<{ thanksgiving: boolean; prayingToo: boolean } | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.radioFollowups().then(setData).catch(() => undefined);
    }, []),
  );
  if (!data) return null;
  const set = (patch: { thanksgiving?: boolean; prayingToo?: boolean }) => api.admin.setRadioFollowups(patch).then(setData).catch(() => undefined);
  return (
    <View>
      <Toggle label={t('admin.thanksgivingBurst')} hint={t('admin.thanksgivingBurstHint')} value={data.thanksgiving} onChange={(v) => set({ thanksgiving: v })} />
      <Toggle label={t('admin.prayingTooSwitch')} hint={t('admin.prayingTooSwitchHint')} value={data.prayingToo} onChange={(v) => set({ prayingToo: v })} />
    </View>
  );
}

/** Listener mode: the Listen screen from the sign-in screen, with no account. */
function ListenerModeSection() {
  const t = useT();
  const [data, setData] = useState<{ enabled: boolean; active: boolean } | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.listenerMode().then(setData).catch(() => undefined);
    }, []),
  );
  if (!data) return null;
  const set = (on: boolean) => api.admin.setListenerMode(on).then(setData).catch(() => undefined);
  return (
    <View>
      <View style={styles.row}>
        <Chip label={t('admin.listenerModeOff')} selected={!data.enabled} onPress={() => set(false)} />
        <Chip label={t('admin.listenerModeOn')} selected={data.enabled} onPress={() => set(true)} />
      </View>
      <Text style={type.small}>{t('admin.listenerModeHint')}</Text>
      {data.enabled && !data.active ? <Text style={[type.small, { color: colors.danger }]}>{t('admin.listenerModeInactive')}</Text> : null}
    </View>
  );
}

/** Station health page and listener acknowledgements (radio/health.ts, radio/acks.ts); both off by default. */
function StationHealthSection() {
  const t = useT();
  const [data, setData] = useState<StationHealth | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.radioHealth().then(setData).catch(() => undefined);
    }, []),
  );
  if (!data) return null;
  const save = (patch: Parameters<typeof api.admin.updateRadioHealth>[0]) => api.admin.updateRadioHealth(patch).then(setData).catch(() => undefined);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : t('admin.healthNever'));
  const h = data.health;
  const a = data.acks;
  return (
    <View>
      <View style={styles.row}>
        <Chip label={t('admin.healthOff')} selected={!data.enabled} onPress={() => save({ enabled: false })} />
        <Chip label={t('admin.healthOn')} selected={data.enabled} onPress={() => save({ enabled: true })} />
      </View>
      <Text style={type.small}>{t('admin.healthHint')}</Text>
      {h ? (
        <>
          {h.stations.map((s) => (
            <View key={s.callSign}>
              <Text style={[type.small, s.silent ? { color: colors.danger } : null]}>
                {s.silent
                  ? t('admin.healthSilent', { callSign: s.callSign, when: when(s.lastHeartbeat) })
                  : t('admin.healthStation', { callSign: s.callSign, when: when(s.lastHeartbeat), bursts: s.bursts24h, prayers: s.prayers24h, failed: s.failed24h })}
              </Text>
              {s.checks
                .filter((c) => !c.ok)
                .map((c) => (
                  <Text key={c.name} style={[type.small, { color: colors.danger }]}>
                    {t('admin.healthCheck', { name: c.name, detail: c.detail })}
                  </Text>
                ))}
              {s.lastError ? <Text style={[type.small, { color: colors.danger }]}>{t('admin.healthLastError', { error: s.lastError })}</Text> : null}
            </View>
          ))}
          <Text style={type.small}>
            {t('admin.healthQueue', { queued: h.queue.queued, sending: h.queue.sending })}
            {h.queue.oldestMinutes !== null ? ` ${t('admin.healthOldest', { minutes: h.queue.oldestMinutes })}` : ''}
          </Text>
          <Text style={type.small}>{t('admin.healthSnrTitle')}</Text>
          {h.snr.length ? (
            h.snr.map((r) => (
              <Text key={`${r.callSign}-${r.preset}`} style={type.small}>
                {t('admin.healthSnr', { callSign: r.callSign, preset: r.preset, avg: r.avgDb, min: r.minDb, reports: r.reports })}
              </Text>
            ))
          ) : (
            <Text style={type.small}>{t('admin.healthSnrNone')}</Text>
          )}
          <Text style={type.small}>{t('admin.healthListenersTitle')}</Text>
          {h.listeners.map((l) => (
            <Text key={l.name} style={[type.small, l.silent ? { color: colors.danger } : null]}>
              {t(l.silent ? 'admin.healthListenerSilent' : 'admin.healthListener', { name: l.name, when: when(l.lastHeartbeat) })}
            </Text>
          ))}
          <Text style={type.small}>{t('admin.healthHeardTitle')}</Text>
          {h.lastHeard.length ? (
            h.lastHeard.map((r, i) => (
              <Text key={`${r.at}-${i}`} style={type.small}>
                {t('admin.healthHeard', { when: when(r.at), node: r.node, callSign: r.callSign, preset: r.preset, snr: r.snrDb })}
              </Text>
            ))
          ) : (
            <Text style={type.small}>{t('admin.healthHeardNone')}</Text>
          )}
          <Text style={type.small}>{t('admin.healthFailuresTitle')}</Text>
          {h.failures.length ? (
            h.failures.map((f, i) => (
              <Text key={`${f.at}-${i}`} style={[type.small, { color: colors.danger }]}>
                {t(`admin.healthFailure.${f.kind}`, { when: when(f.at), callSign: f.callSign ?? '', error: f.error })}
              </Text>
            ))
          ) : (
            <Text style={type.small}>{t('admin.healthFailuresNone')}</Text>
          )}
        </>
      ) : null}
      <View style={styles.row}>
        <Chip label={t('admin.acksOff')} selected={!a.enabled} onPress={() => save({ acks: { enabled: false } })} />
        <Chip label={t('admin.acksOn')} selected={a.enabled} onPress={() => save({ acks: { enabled: true } })} />
      </View>
      <Text style={type.small}>{t('admin.acksHint')}</Text>
      {a.enabled ? (
        <>
          <Text style={type.small}>{t('admin.acksTimeout')}</Text>
          <View style={styles.row}>
            {[5, 10, 30, 60].map((n) => (
              <Chip key={n} label={t('admin.stationMinutes', { count: n })} selected={a.timeoutMinutes === n} onPress={() => save({ acks: { timeoutMinutes: n } })} />
            ))}
          </View>
          <Text style={type.small}>{t('admin.acksRetries')}</Text>
          <View style={styles.row}>
            {[0, 1, 2, 3].map((n) => (
              <Chip key={n} label={String(n)} selected={a.maxRetries === n} onPress={() => save({ acks: { maxRetries: n } })} />
            ))}
          </View>
          <Text style={type.small}>{t('admin.acksStats', { heard: a.heard, waiting: a.waiting, unheard: a.unheard, retried: a.retried })}</Text>
        </>
      ) : null}
    </View>
  );
}

/** The station's latest bursts (burst mode): size, air time and, in simulate mode, what a receiver decoded. */
function RecentBursts() {
  const t = useT();
  const [bursts, setBursts] = useState<StationBurst[] | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.radioBursts().then((r) => setBursts(r.bursts)).catch(() => setBursts([]));
    }, []),
  );
  if (!bursts) return null;
  if (!bursts.length) return <Text style={type.small}>{t('admin.burstsNone')}</Text>;
  return (
    <View>
      <Text style={type.small}>{t('admin.burstsTitle')}</Text>
      {bursts.slice(0, 5).map((b) => (
        <Text key={b.id} style={[type.small, b.ok && (b.decoded === null || b.decoded === b.prayers) ? null : { color: colors.danger }]}>
          {t('admin.burstLine', {
            when: new Date(b.created_at).toLocaleString(),
            prayers: b.prayers,
            seconds: b.seconds.toFixed(2),
            bytes: b.bytes,
            frames: b.frames,
            preset: b.preset,
            mode: b.mode,
          })}
          {b.decoded !== null ? ` ${t('admin.burstDecoded', { decoded: b.decoded, prayers: b.prayers })}` : ''}
          {b.ok ? '' : ` ${t('admin.burstFailed', { error: b.error ?? '' })}`}
        </Text>
      ))}
    </View>
  );
}

/** Reminder popups: gentle or firm by default, with 30-day results for each tone. */
function ReminderToneSection() {
  const t = useT();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.admin.promptSettings>> | null>(null);
  const load = useCallback(() => {
    api.admin.promptSettings().then(setData).catch(() => undefined);
  }, []);
  useFocusEffect(load);
  if (!data) return null;
  const set = (tone: 'gentle' | 'firm') => api.admin.setDefaultTone(tone).then(load).catch(() => undefined);
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.tone')}</Text>
      <Text style={type.small}>{t('admin.toneHint')}</Text>
      <View style={styles.row}>
        <Chip label={t('admin.gentle')} selected={data.defaultTone === 'gentle'} onPress={() => set('gentle')} />
        <Chip label={t('admin.firm')} selected={data.defaultTone === 'firm'} onPress={() => set('firm')} />
      </View>
      {data.results.map((r) => (
        <Text key={r.tone} style={type.small}>
          {t('admin.toneResult', { tone: r.tone === 'firm' ? t('admin.firm') : t('admin.gentle'), prayed: r.prayed, shown: r.shown })}
        </Text>
      ))}
    </View>
  );
}

/** Prayer partners on call, and events. Confession stays off until a lawyer reviews it. */
function CareAndEventSettingsSection() {
  const t = useT();
  const [care, setCare] = useState<{ care_enabled: boolean; confession_enabled: boolean; confession_retention_days: number } | null>(null);
  const [keepDays, setKeepDays] = useState('');
  const [ev, setEv] = useState<{ events_enabled: boolean; new_members_can_host: boolean; allowed_video_hosts: string[]; reminder_minutes: number } | null>(null);
  const [hosts, setHosts] = useState('');
  const [reminder, setReminder] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const showEv = (s: NonNullable<typeof ev>) => {
    setEv(s);
    setHosts(s.allowed_video_hosts.join(', '));
    setReminder(String(s.reminder_minutes));
  };

  useFocusEffect(
    useCallback(() => {
      api.admin.careSettings().then((r) => showCare(r.settings)).catch((e) => setNote((e as Error).message));
      api.admin.eventSettings().then((r) => showEv(r.settings)).catch((e) => setNote((e as Error).message));
    }, []),
  );

  const showCare = (s: NonNullable<typeof care>) => {
    setCare(s);
    setKeepDays(String(s.confession_retention_days));
  };
  const saveCare = (patch: Parameters<typeof api.admin.updateCareSettings>[0]) =>
    api.admin.updateCareSettings(patch).then((r) => showCare(r.settings)).catch((e) => setNote((e as Error).message));
  const saveEv = (patch: Parameters<typeof api.admin.updateEventSettings>[0] = {}) =>
    api.admin
      .updateEventSettings({
        allowedVideoHosts: hosts.split(',').map((h) => h.trim()).filter(Boolean),
        reminderMinutes: toInt(reminder) ?? undefined,
        ...patch,
      })
      .then((r) => {
        showEv(r.settings);
        setNote(t('admin.saved.events'));
      })
      .catch((e) => setNote((e as Error).message));

  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.careEvents')}</Text>
      {care ? (
        <>
          <Toggle label={t('admin.toggle.care')} value={care.care_enabled} onChange={(v) => saveCare({ careEnabled: v })} />
          <Toggle label={t('admin.toggle.confession')} hint={t('admin.toggle.confessionHint')} value={care.confession_enabled} onChange={(v) => saveCare({ confessionEnabled: v })} />
          <Field label={t('admin.field.confessionDays')} keyboardType="number-pad" value={keepDays} onChangeText={setKeepDays} />
          <Button small variant="secondary" label={t('admin.btn.saveConfession')} onPress={() => saveCare({ confessionRetentionDays: toInt(keepDays) ?? undefined })} />
        </>
      ) : null}
      {ev ? (
        <>
          <Toggle label={t('admin.toggle.events')} value={ev.events_enabled} onChange={(v) => saveEv({ eventsEnabled: v })} />
          <Toggle label={t('admin.toggle.host')} value={ev.new_members_can_host} onChange={(v) => saveEv({ newMembersCanHost: v })} />
          <Field label={t('admin.field.hosts')} value={hosts} onChangeText={setHosts} autoCapitalize="none" multiline />
          <Field label={t('admin.field.reminder')} keyboardType="number-pad" value={reminder} onChangeText={setReminder} />
          <Button label={t('admin.btn.saveEvents')} onPress={() => saveEv()} />
        </>
      ) : null}
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Live video rooms: off by default; the Jitsi Meet server address, or hosts paste links. */
function LiveSection() {
  const t = useT();
  const [s, setS] = useState<LiveSettings | null>(null);
  const [draft, setDraft] = useState({ url: '', minutes: '' });
  const [note, setNote] = useState<string | null>(null);
  const show = (x: LiveSettings) => {
    setS(x);
    setDraft({ url: x.jitsi_url ?? '', minutes: String(x.max_minutes) });
  };
  useFocusEffect(
    useCallback(() => {
      api.admin.liveSettings().then((r) => show(r.settings)).catch((e) => setNote((e as Error).message));
    }, []),
  );
  const save = (patch: { enabled?: boolean } = {}) =>
    api.admin
      .updateLiveSettings({ jitsiUrl: draft.url.trim(), maxMinutes: toInt(draft.minutes) ?? undefined, ...patch })
      .then((r) => {
        show(r.settings);
        setNote(t('admin.saved.live'));
      })
      .catch((e) => setNote((e as Error).message));
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.liveSection')}</Text>
      <Toggle label={t('admin.toggle.live')} hint={t('admin.toggle.liveHint')} value={s.enabled} onChange={(v) => save({ enabled: v })} />
      <Field label={t('admin.field.jitsiUrl')} value={draft.url} onChangeText={(url) => setDraft((d) => ({ ...d, url }))} autoCapitalize="none" keyboardType="url" />
      <Field label={t('admin.field.liveMinutes')} keyboardType="number-pad" value={draft.minutes} onChangeText={(minutes) => setDraft((d) => ({ ...d, minutes }))} />
      <Button label={t('admin.btn.saveLive')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Two-step sign-in with an authenticator app. Off by default; members who turned it on keep it. */
function SecuritySection() {
  const t = useT();
  const [s, setS] = useState<SecuritySettings | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.securitySettings().then((r) => setS(r.settings), (e) => setNote((e as Error).message));
    }, []),
  );
  const save = (patch: { twoStepEnabled?: boolean; backupCodesEnabled?: boolean; passkeysEnabled?: boolean }) =>
    api.admin
      .updateSecuritySettings(patch)
      .then((r) => (setS(r.settings), resetFeatures(), setNote(t('admin.saved.security'))))
      .catch((e) => setNote((e as Error).message));
  if (s === null) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.security')}</Text>
      <Toggle label={t('admin.toggle.twoStep')} hint={t('admin.toggle.twoStepHint')} value={s.two_step_enabled} onChange={(v) => save({ twoStepEnabled: v })} />
      <Toggle label={t('backupCodes.adminToggle')} hint={t('backupCodes.adminHint')} value={s.backup_codes_enabled} onChange={(v) => save({ backupCodesEnabled: v })} />
      <Toggle label={t('passkeys.adminToggle')} hint={t('passkeys.adminHint')} value={s.passkeys_enabled} onChange={(v) => save({ passkeysEnabled: v })} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Giving instead of ads: the switch, how people give, and gifts that came in. Off by default. */
export function GivingSection() {
  const t = useT();
  const [s, setS] = useState<AdminDonationSettings | null>(null);
  const [keys, setKeys] = useState({ stripe: false, webhook: false, zeffy: false, zeffyWebhook: false });
  const [gifts, setGifts] = useState<AdminGift[]>([]);
  const [pools, setPools] = useState<TokenPool[]>([]);
  const [draft, setDraft] = useState({ url: '', paypal: '', monthly: '', max: '', amount: '', reference: '' });
  const [via, setVia] = useState<'manual' | 'zeffy' | 'paypal'>('manual');
  const [poolId, setPoolId] = useState<string | null>(null);
  // A gift for one member, and who gave it (so they get their thank-you tokens).
  const [forMember, setForMember] = useState<AdminPerson | null>(null);
  const [donor, setDonor] = useState<AdminPerson | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const fail = (e: unknown) => setNote((e as Error).message);
  const show = (x: AdminDonationSettings) => {
    setS(x);
    setDraft((d) => ({ ...d, url: x.donate_url ?? '', paypal: x.paypal_url ?? '', monthly: String(x.everyone_monthly), max: String(x.allocation_max_per_request) }));
  };
  const loadGifts = () => api.admin.gifts().then((r) => setGifts(r.donations), fail);
  useFocusEffect(
    useCallback(() => {
      api.admin
        .donationSettings()
        .then((r) => (show(r.settings), setKeys({ stripe: r.stripeKeySet, webhook: r.webhookSecretSet, zeffy: r.zeffyKeySet, zeffyWebhook: r.zeffyWebhookSet })))
        .catch(fail);
      api.admin.gifts().then((r) => setGifts(r.donations), fail);
      api.tokenPools().then((r) => setPools(r.pools), () => undefined);
    }, []),
  );
  const save = (patch: Parameters<typeof api.admin.updateDonationSettings>[0]) =>
    api.admin
      .updateDonationSettings(patch)
      .then((r) => (show(r.settings), setNote(t('admin.saved.giving'))))
      .catch(fail);
  const saveDraft = () =>
    save({
      donateUrl: draft.url.trim() || null,
      paypalUrl: draft.paypal.trim() || null,
      everyoneMonthly: toInt(draft.monthly) ?? undefined,
      allocationMaxPerRequest: toInt(draft.max) ?? undefined,
    });
  const record = () => {
    const cents = Math.round(Number(draft.amount.replace(/[$,]/g, '')) * 100);
    if (!(cents > 0)) return;
    api.admin
      .recordGift({
        amountCents: cents,
        reference: draft.reference.trim(),
        via,
        donorId: donor?.id ?? null,
        target: forMember ? { kind: 'member', userId: forMember.id } : poolId ? { kind: 'pool', poolId } : { kind: 'everyone' },
      })
      .then(() => (setDraft((d) => ({ ...d, amount: '', reference: '' })), setDonor(null), setForMember(null), setNote(t('admin.giftRecorded')), loadGifts()))
      .catch(fail);
  };
  const syncZeffy = () =>
    api.admin
      .syncZeffy()
      .then((r) => (setNote(t('admin.zeffySynced', { recorded: r.recorded, refunded: r.refunded })), loadGifts()))
      .catch(fail);
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.giving')}</Text>
      <Toggle label={t('admin.toggle.giving')} hint={t('admin.toggle.givingHint')} value={s.enabled} onChange={(v) => save({ enabled: v })} />
      <Text style={type.small}>{t('admin.givingProvider')}</Text>
      <View style={styles.row}>
        {(['none', 'zeffy', 'stripe'] as const).map((p) => (
          <Chip key={p} label={t(`admin.provider.${p}`)} selected={s.provider === p} onPress={() => save({ provider: p })} />
        ))}
      </View>
      {s.provider === 'stripe' && (!keys.stripe || !keys.webhook) ? <Text style={[type.small, { color: colors.danger }]}>{t('admin.stripeKeysMissing')}</Text> : null}
      {s.provider === 'zeffy' ? (
        <>
          <Field label={t('admin.field.donateUrl')} value={draft.url} onChangeText={(url) => setDraft((d) => ({ ...d, url }))} autoCapitalize="none" keyboardType="url" />
          <Text style={type.small}>{t(keys.zeffy ? (keys.zeffyWebhook ? 'admin.zeffyConnected' : 'admin.zeffyNoWebhook') : 'admin.zeffyNotConnected')}</Text>
          {keys.zeffy ? (
            <>
              <Text style={type.small}>{t('admin.zeffyAmountUnit')}</Text>
              <View style={styles.row}>
                {(['cents', 'dollars'] as const).map((u) => (
                  <Chip key={u} label={t(`admin.zeffyUnit.${u}`)} selected={s.zeffy_amount_unit === u} onPress={() => save({ zeffyAmountUnit: u })} />
                ))}
              </View>
              <Button small variant="secondary" label={t('admin.btn.syncZeffy')} onPress={syncZeffy} />
            </>
          ) : null}
        </>
      ) : null}
      <Field label={t('admin.field.paypalUrl')} value={draft.paypal} onChangeText={(paypal) => setDraft((d) => ({ ...d, paypal }))} autoCapitalize="none" keyboardType="url" />
      <Field label={t('admin.field.everyoneMonthly')} keyboardType="number-pad" value={draft.monthly} onChangeText={(monthly) => setDraft((d) => ({ ...d, monthly }))} />
      <Toggle
        label={t('admin.toggle.allocationRequests')}
        hint={t('admin.toggle.allocationRequestsHint')}
        value={s.allocation_requests_enabled}
        onChange={(v) => save({ allocationRequestsEnabled: v })}
      />
      <Field label={t('admin.field.allocationMax')} keyboardType="number-pad" value={draft.max} onChangeText={(max) => setDraft((d) => ({ ...d, max }))} />
      <Button label={t('admin.btn.saveGiving')} onPress={saveDraft} />
      <Text style={type.small}>{t('admin.recordGift')}</Text>
      <View style={styles.row}>
        {(['manual', 'zeffy', 'paypal'] as const).map((v) => (
          <Chip key={v} label={t(`admin.giftVia.${v}`)} selected={via === v} onPress={() => setVia(v)} />
        ))}
      </View>
      <View style={styles.row}>
        <Chip label={t('give.everyone')} selected={!poolId && !forMember} onPress={() => (setPoolId(null), setForMember(null))} />
        {pools.map((p) => (
          <Chip key={p.id} label={p.name} selected={!forMember && poolId === p.id} onPress={() => (setForMember(null), setPoolId(p.id))} />
        ))}
      </View>
      <PersonPicker label={t('admin.giftFor')} person={forMember} onPick={setForMember} />
      <PersonPicker label={t('admin.giftFrom')} person={donor} onPick={setDonor} />
      <Field label={t('admin.field.giftAmount')} keyboardType="decimal-pad" value={draft.amount} onChangeText={(amount) => setDraft((d) => ({ ...d, amount }))} />
      <Field label={t('admin.field.giftReference')} value={draft.reference} onChangeText={(reference) => setDraft((d) => ({ ...d, reference }))} />
      <Button small variant="secondary" label={t('admin.btn.recordGift')} onPress={record} disabled={!(Number(draft.amount.replace(/[$,]/g, '')) > 0)} />
      {gifts.slice(0, 20).map((g) => (
        <View key={g.id} style={styles.row}>
          <Text style={type.small}>
            {new Date(g.created_at).toLocaleDateString()} · ${(g.amount_cents / 100).toFixed(2)} · {g.provider} · {g.status}
            {g.donor_name ? ` · ${g.donor_name}` : ''}
          </Text>
          {/* Stripe refunds arrive by webhook; Zeffy and hand-entered gifts are marked here. */}
          {g.status === 'paid' && g.provider !== 'stripe' ? (
            <Button
              small
              variant="ghost"
              label={t('admin.refundGift')}
              onPress={() =>
                api.admin
                  .refundGift(g.id)
                  .then(() => (setNote(t('admin.giftRefunded')), loadGifts()))
                  .catch(fail)
              }
            />
          ) : null}
        </View>
      ))}
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Find one member by name or email (Admin → Giving: who a gift is for, and who gave it). */
function PersonPicker({ label, person, onPick }: { label: string; person: AdminPerson | null; onPick: (p: AdminPerson | null) => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<AdminPerson[]>([]);
  if (person) return <Chip label={`${label}: ${person.display_name}`} selected onPress={() => onPick(null)} />;
  return (
    <View style={{ gap: space.sm }}>
      <Field label={label} value={query} onChangeText={setQuery} autoCapitalize="none" />
      <Button small variant="ghost" label={t('admin.btn.find')} disabled={!query.trim()} onPress={() => api.admin.people(query.trim()).then((r) => setFound(r.people.slice(0, 8)), () => setFound([]))} />
      <View style={styles.row}>
        {found.map((p) => (
          <Chip key={p.id} label={p.email ? `${p.display_name} (${p.email})` : p.display_name} selected={false} onPress={() => (setFound([]), setQuery(''), onPick(p))} />
        ))}
      </View>
    </View>
  );
}

/** AI features: the "not God" conversation and the circle facilitator, both off by default. */
function AiSection() {
  const t = useT();
  const [s, setS] = useState<AiSettings | null>(null);
  const [chat, setChat] = useState<{ ai_chat_enabled: boolean; ai_chat_warning: string } | null>(null);
  const [connected, setConnected] = useState(false);
  const [draft, setDraft] = useState({ warning: '', chatLimit: '', facLimit: '', apPerDay: '', apLimit: '', apDays: '' });
  const [note, setNote] = useState<string | null>(null);
  const fail = (e: unknown) => setNote((e as Error).message);
  const show = (x: AiSettings, c: { ai_chat_enabled: boolean; ai_chat_warning: string }) => {
    setS(x);
    setChat(c);
    setDraft({
      warning: c.ai_chat_warning,
      chatLimit: String(x.chat_daily_limit),
      facLimit: String(x.facilitator_daily_limit),
      apPerDay: String(x.auto_pray_per_day),
      apLimit: String(x.auto_pray_daily_limit),
      apDays: String(x.auto_pray_days),
    });
  };
  useFocusEffect(
    useCallback(() => {
      Promise.all([api.admin.aiSettings(), api.admin.futureSettings()])
        .then(([a, f]) => {
          setConnected(a.aiConnected);
          show(a.settings, f.settings);
        })
        .catch(fail);
    }, []),
  );
  const save = async (patch: { chatEnabled?: boolean; facilitatorEnabled?: boolean; autoPrayEnabled?: boolean } = {}) => {
    try {
      const f = await api.admin.updateFutureSettings({ aiChatEnabled: patch.chatEnabled, aiChatWarning: draft.warning || undefined });
      const a = await api.admin.updateAiSettings({
        facilitatorEnabled: patch.facilitatorEnabled,
        chatDailyLimit: toInt(draft.chatLimit) ?? undefined,
        facilitatorDailyLimit: toInt(draft.facLimit) ?? undefined,
        autoPrayEnabled: patch.autoPrayEnabled,
        autoPrayPerDay: toInt(draft.apPerDay) ?? undefined,
        autoPrayDailyLimit: toInt(draft.apLimit) ?? undefined,
        autoPrayDays: toInt(draft.apDays) ?? undefined,
      });
      show(a.settings, f.settings);
      setNote(t('admin.saved.ai'));
    } catch (e) {
      fail(e);
    }
  };
  if (!s || !chat) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.aiSection')}</Text>
      <Text style={type.small}>{t(connected ? 'admin.aiConnected' : 'admin.aiNotConnected')}</Text>
      <Toggle label={t('admin.toggle.aiChat')} hint={t('admin.toggle.aiChatHint')} value={chat.ai_chat_enabled} onChange={(v) => save({ chatEnabled: v })} />
      <Field label={t('admin.field.aiWarning')} value={draft.warning} onChangeText={(warning) => setDraft((d) => ({ ...d, warning }))} multiline maxLength={1000} />
      <Field label={t('admin.field.aiChatLimit')} keyboardType="number-pad" value={draft.chatLimit} onChangeText={(chatLimit) => setDraft((d) => ({ ...d, chatLimit }))} />
      <Toggle label={t('admin.toggle.aiFacilitator')} hint={t('admin.toggle.aiFacilitatorHint')} value={s.facilitator_enabled} onChange={(v) => save({ facilitatorEnabled: v })} />
      <Field label={t('admin.field.aiFacLimit')} keyboardType="number-pad" value={draft.facLimit} onChangeText={(facLimit) => setDraft((d) => ({ ...d, facLimit }))} />
      <Toggle label={t('admin.toggle.autoPray')} hint={t('admin.toggle.autoPrayHint')} value={s.auto_pray_enabled} onChange={(v) => save({ autoPrayEnabled: v })} />
      <Field label={t('admin.field.autoPrayPerDay')} keyboardType="number-pad" value={draft.apPerDay} onChangeText={(apPerDay) => setDraft((d) => ({ ...d, apPerDay }))} />
      <Field label={t('admin.field.autoPrayLimit')} keyboardType="number-pad" value={draft.apLimit} onChangeText={(apLimit) => setDraft((d) => ({ ...d, apLimit }))} />
      <Field label={t('admin.field.autoPrayDays')} keyboardType="number-pad" value={draft.apDays} onChangeText={(apDays) => setDraft((d) => ({ ...d, apDays }))} />
      <Button label={t('admin.btn.saveAi')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Annual Prayer Warrior Award: off by default. Offer it to a year's top pray-ers from the standings. */
function AwardSection() {
  const t = useT();
  const [s, setS] = useState<AwardSettings | null>(null);
  const [draft, setDraft] = useState({ winners: '', tokens: '', priestly: '', note: '' });
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [awards, setAwards] = useState<Award[]>([]);
  const [top, setTop] = useState<{ rank: number; name: string; prayers: number; checkins: number }[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const fail = (e: unknown) => setNote((e as Error).message);
  const show = (x: AwardSettings) => {
    setS(x);
    setDraft({ winners: String(x.winners), tokens: String(x.token_prize), priestly: String(x.priestly_prize), note: x.prize_note });
  };
  const loadYear = (y = year) =>
    toInt(y) &&
    api.admin
      .awardYear(toInt(y)!)
      .then((r) => {
        setAwards(r.awards);
        setTop(r.standings);
      })
      .catch(fail);
  useFocusEffect(
    useCallback(() => {
      api.admin.awardSettings().then((r) => show(r.settings)).catch(fail);
      loadYear();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
  const save = (patch: Parameters<typeof api.admin.updateAwardSettings>[0] = {}) =>
    api.admin
      .updateAwardSettings({
        winners: toInt(draft.winners) ?? undefined,
        tokenPrize: toInt(draft.tokens) ?? undefined,
        priestlyPrize: toInt(draft.priestly) ?? undefined,
        prizeNote: draft.note,
        ...patch,
      })
      .then((r) => {
        show(r.settings);
        setNote(t('admin.saved.award'));
      })
      .catch(fail);
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.award')}</Text>
      <Toggle label={t('admin.toggle.award')} hint={t('admin.toggle.awardHint')} value={s.enabled} onChange={(v) => save({ enabled: v })} />
      <Toggle label={t('admin.toggle.awardHall')} value={s.public_hall} onChange={(v) => save({ publicHall: v })} />
      <Field label={t('admin.field.awardWinners')} keyboardType="number-pad" value={draft.winners} onChangeText={(winners) => setDraft((d) => ({ ...d, winners }))} />
      <Field label={t('admin.field.awardTokens')} keyboardType="number-pad" value={draft.tokens} onChangeText={(tokens) => setDraft((d) => ({ ...d, tokens }))} />
      <Field label={t('admin.field.awardPriestly')} keyboardType="number-pad" value={draft.priestly} onChangeText={(priestly) => setDraft((d) => ({ ...d, priestly }))} />
      <Field label={t('admin.field.awardNote')} value={draft.note} onChangeText={(n) => setDraft((d) => ({ ...d, note: n }))} maxLength={500} />
      <Button label={t('admin.btn.saveAward')} onPress={() => save()} />
      <Field label={t('admin.field.awardYear')} keyboardType="number-pad" value={year} onChangeText={setYear} onBlur={() => loadYear()} />
      {top.slice(0, 10).map((x) => (
        <Text key={x.rank} style={type.small}>
          {x.rank}. {x.name} · {x.prayers + x.checkins}
        </Text>
      ))}
      {s.enabled ? (
        <Button variant="secondary" label={t('admin.btn.selectWinners')} onPress={() => toInt(year) && api.admin.selectAwards(toInt(year)!).then((r) => setAwards(r.awards), fail)} />
      ) : null}
      {awards.map((a) => (
        <Text key={a.id} style={type.body}>
          {a.rank}. {a.name} · {a.status}
        </Text>
      ))}
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Spoken prayers: off by default; limits for recording length and token offers. */
function SpokenPrayerSection() {
  const t = useT();
  const [s, setS] = useState<SpokenPrayerSettings | null>(null);
  const [draft, setDraft] = useState({ seconds: '', offer: '' });
  const [note, setNote] = useState<string | null>(null);
  const show = (x: SpokenPrayerSettings) => {
    setS(x);
    setDraft({ seconds: String(x.max_seconds), offer: String(x.max_offer_tokens) });
  };
  useFocusEffect(
    useCallback(() => {
      api.admin.spokenPrayerSettings().then((r) => show(r.settings)).catch((e) => setNote((e as Error).message));
    }, []),
  );
  const save = (patch: Parameters<typeof api.admin.updateSpokenPrayerSettings>[0] = {}) =>
    api.admin
      .updateSpokenPrayerSettings({ maxSeconds: toInt(draft.seconds) ?? undefined, maxOfferTokens: toInt(draft.offer) ?? undefined, ...patch })
      .then((r) => {
        show(r.settings);
        setNote(t('admin.saved.spoken'));
      })
      .catch((e) => setNote((e as Error).message));
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.spoken')}</Text>
      <Toggle label={t('admin.toggle.spoken')} hint={t('admin.toggle.spokenHint')} value={s.enabled} onChange={(v) => save({ enabled: v })} />
      <Field label={t('admin.field.spokenSeconds')} keyboardType="number-pad" value={draft.seconds} onChangeText={(seconds) => setDraft((d) => ({ ...d, seconds }))} />
      <Field label={t('admin.field.spokenOffer')} keyboardType="number-pad" value={draft.offer} onChangeText={(offer) => setDraft((d) => ({ ...d, offer }))} />
      <Button label={t('admin.btn.saveSpoken')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Equal material help for paid radio prayers (Notes p3), off by default. */
function MaterialMatchSection() {
  const t = useT();
  const [s, setS] = useState<Awaited<ReturnType<typeof api.admin.materialMatch>> | null>(null);
  const [rate, setRate] = useState('');
  const [kind, setKind] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(
    () =>
      api.admin.materialMatch().then(
        (r) => {
          setS(r);
          setRate(String(r.settings.centsPerToken));
        },
        (e) => setNote((e as Error).message),
      ),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const save = (patch: { enabled?: boolean; centsPerToken?: number }) =>
    api.admin
      .updateMaterialMatch(patch)
      .then(() => {
        resetFeatures();
        setNote(t('admin.saved.materialMatch'));
        return load();
      })
      .catch((e) => setNote((e as Error).message));
  const fulfill = () =>
    api.admin
      .fulfillMaterialMatch({ helpKind: kind.trim() })
      .then((r) => {
        setKind('');
        setNote(t('admin.materialMatch.recorded', { amount: (r.cents / 100).toFixed(2) }));
        return load();
      })
      .catch((e) => setNote((e as Error).message));
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.materialMatch.title')}</Text>
      <Toggle label={t('admin.materialMatch.toggle')} hint={t('admin.materialMatch.hint')} value={s.settings.enabled} onChange={(v) => save({ enabled: v })} />
      <Field label={t('admin.materialMatch.rate')} keyboardType="number-pad" value={rate} onChangeText={setRate} />
      <Button small variant="secondary" label={t('admin.materialMatch.saveRate')} disabled={!toInt(rate)} onPress={() => save({ centsPerToken: toInt(rate) ?? undefined })} />
      <Text style={type.body}>
        {t('admin.materialMatch.owed', { count: s.owed.count, amount: (s.owed.cents / 100).toFixed(2) })} · {t('admin.materialMatch.sent', { amount: (s.fulfilled.cents / 100).toFixed(2) })}
      </Text>
      {s.owed.count ? (
        <>
          <Field label={t('admin.materialMatch.kind')} value={kind} onChangeText={setKind} maxLength={60} />
          <Button small label={t('admin.materialMatch.fulfill')} disabled={!kind.trim()} onPress={fulfill} />
        </>
      ) : null}
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Communities (Open Circle, 2026-10-28): a non-default community is hidden until an admin turns it on. */
function CommunitiesSection() {
  const t = useT();
  const [list, setList] = useState<Community[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.communities().then((r) => setList(r.communities)).catch((e) => setNote((e as Error).message));
    }, []),
  );
  const change = (c: Community, patch: Parameters<typeof api.admin.updateCommunity>[1]) =>
    api.admin
      .updateCommunity(c.slug, patch)
      .then((r) => {
        setList((l) => l?.map((x) => (x.slug === c.slug ? { ...x, ...r.community } : x)) ?? null);
        setNote(t('admin.savedCommunity'));
      })
      .catch((e) => setNote((e as Error).message));
  if (!list) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.communities')}</Text>
      <Text style={type.small}>{t('admin.communitiesHint')}</Text>
      {list.map((c) => (
        <View key={c.slug} style={{ gap: space.xs }}>
          {c.isDefault ? (
            <Text style={type.body}>{t('admin.communityDefault', { name: c.name, count: c.members ?? 0 })}</Text>
          ) : (
            <Toggle
              label={t('admin.communityOn', { name: c.name, count: c.members ?? 0 })}
              hint={t('admin.communityOnHint')}
              value={c.status === 'active'}
              onChange={(v) => change(c, { status: v ? 'active' : 'hidden' })}
            />
          )}
          {!c.isDefault ? (
            <Toggle
              label={t('admin.communityNeutral')}
              hint={t('admin.communityNeutralHint')}
              value={c.wording === 'neutral'}
              onChange={(v) => change(c, { wording: v ? 'neutral' : 'faith' })}
            />
          ) : null}
          {c.operatorName ? <Text style={type.small}>{t('admin.communityOperator', { name: c.operatorName })}</Text> : null}
          <Text style={type.small}>{t('admin.communityTypes')}</Text>
          <View style={styles.row}>
            {POST_TYPES.map((p) => {
              const on = c.enabledPostTypes.includes(p);
              return (
                <Chip
                  key={p}
                  label={POST_TYPE_LABELS[p]}
                  selected={on}
                  onPress={() => change(c, { enabledPostTypes: on ? c.enabledPostTypes.filter((x) => x !== p) : [...c.enabledPostTypes, p] })}
                />
              );
            })}
          </View>
          <Text style={type.small}>{t('admin.communityFeatures')}</Text>
          <View style={styles.row}>
            {COMMUNITY_FEATURES.map((f) => {
              const hidden = c.hiddenFeatures?.includes(f) ?? false;
              return (
                <Chip
                  key={f}
                  label={t(`admin.feature.${f}`)}
                  selected={!hidden}
                  onPress={() =>
                    change(c, { hiddenFeatures: hidden ? (c.hiddenFeatures ?? []).filter((x) => x !== f) : [...(c.hiddenFeatures ?? []), f] })
                  }
                />
              );
            })}
          </View>
        </View>
      ))}
      <NewCommunity onCreated={(c) => setList((l) => [...(l ?? []), { ...c, members: 0 }])} onNote={setNote} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/**
 * A new community (Notes p16: a denomination's own space, or one run by a partner
 * faith group). It starts hidden; turn it on above when it's ready.
 */
function NewCommunity({ onCreated, onNote }: { onCreated: (c: Community) => void; onNote: (n: string) => void }) {
  const t = useT();
  const [d, setD] = useState({ name: '', slug: '', tradition: '', operatorName: '', operatorContact: '', neutral: false });
  const create = () =>
    api.admin
      .createCommunity({
        name: d.name.trim(),
        slug: d.slug.trim(),
        tradition: d.tradition.trim() || 'christian',
        wording: d.neutral ? 'neutral' : 'faith',
        operatorName: d.operatorName.trim() || null,
        operatorContact: d.operatorContact.trim() || null,
      })
      .then((r) => {
        onCreated(r.community);
        setD({ name: '', slug: '', tradition: '', operatorName: '', operatorContact: '', neutral: false });
        onNote(t('admin.communityCreated', { name: r.community.name }));
      })
      .catch((e) => onNote((e as Error).message));
  return (
    <View style={{ gap: space.xs }}>
      <Text style={type.heading}>{t('admin.newCommunity')}</Text>
      <Text style={type.small}>{t('admin.newCommunityHint')}</Text>
      <Field label={t('admin.field.communityName')} value={d.name} onChangeText={(name) => setD((x) => ({ ...x, name }))} />
      <Field label={t('admin.field.communitySlug')} autoCapitalize="none" value={d.slug} onChangeText={(slug) => setD((x) => ({ ...x, slug }))} />
      <Field label={t('admin.field.communityTradition')} autoCapitalize="none" value={d.tradition} onChangeText={(tradition) => setD((x) => ({ ...x, tradition }))} />
      <Field label={t('admin.field.communityOperator')} value={d.operatorName} onChangeText={(operatorName) => setD((x) => ({ ...x, operatorName }))} />
      <Field label={t('admin.field.communityContact')} autoCapitalize="none" value={d.operatorContact} onChangeText={(operatorContact) => setD((x) => ({ ...x, operatorContact }))} />
      <Toggle label={t('admin.communityNeutral')} hint={t('admin.communityNeutralHint')} value={d.neutral} onChange={(neutral) => setD((x) => ({ ...x, neutral }))} />
      <Button label={t('admin.btn.createCommunity')} disabled={!d.name.trim() || !d.slug.trim()} onPress={() => create()} />
    </View>
  );
}

/** Feed skins (docs/FEED_SKINS.md): skins and the Wall, comment trees, member skin ideas and the video cap. */
function SkinSettingsSection() {
  const t = useT();
  const [s, setS] = useState<SkinSettings | null>(null);
  const [draft, setDraft] = useState({ leaves: '', depth: '', video: '' });
  const [ideas, setIdeas] = useState<ThemeProposal[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const show = (x: SkinSettings) => {
    setS(x);
    setDraft({ leaves: String(x.comment_tree_leaves), depth: String(x.comment_tree_max_depth + 1), video: String(x.video_max_seconds) });
  };
  const loadIdeas = () =>
    api.admin
      .themeProposals()
      .then((r) => setIdeas(r.proposals))
      .catch(() => undefined);
  useFocusEffect(
    useCallback(() => {
      api.admin.skinSettings().then((r) => show(r.settings)).catch((e) => setNote((e as Error).message));
      loadIdeas();
    }, []),
  );
  const save = (patch: Parameters<typeof api.admin.updateSkinSettings>[0] = {}) => {
    const levels = toInt(draft.depth);
    return api.admin
      .updateSkinSettings({
        commentTreeLeaves: toInt(draft.leaves) ?? undefined,
        // Shown as levels (3), stored as the deepest reply depth (2).
        commentTreeMaxDepth: levels == null ? undefined : levels - 1,
        videoMaxSeconds: toInt(draft.video) ?? undefined,
        ...patch,
      })
      .then((r) => {
        show(r.settings);
        resetFeatures();
        setNote(t('skins.saved'));
      })
      .catch((e) => setNote((e as Error).message));
  };
  const review = (fn: () => Promise<unknown>) =>
    fn()
      .then(loadIdeas)
      .catch((e) => setNote((e as Error).message));
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  const pending = ideas.filter((i) => i.status === 'pending');
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('skins.title')}</Text>
      <Text style={type.small}>{t('skins.intro')}</Text>
      <Toggle label={t('skins.skins')} hint={t('skins.skinsHint')} value={s.skins_enabled} onChange={(v) => save({ skinsEnabled: v })} />
      <Toggle label={t('skins.gallery')} hint={t('skins.galleryHint')} value={s.gallery_enabled} onChange={(v) => save({ galleryEnabled: v })} />
      <Toggle label={t('skins.seasonal')} hint={t('skins.seasonalHint')} value={s.seasonal_enabled} onChange={(v) => save({ seasonalEnabled: v })} />
      {s.seasonal_enabled ? <Toggle label={t('skins.seasonalAuto')} hint={t('skins.seasonalAutoHint')} value={s.seasonal_auto} onChange={(v) => save({ seasonalAuto: v })} /> : null}
      <Toggle label={t('skins.tree')} hint={t('skins.treeHint')} value={s.comment_tree_enabled} onChange={(v) => save({ commentTreeEnabled: v })} />
      <Field label={t('skins.leaves')} keyboardType="number-pad" value={draft.leaves} onChangeText={(leaves) => setDraft((d) => ({ ...d, leaves }))} />
      <Field label={t('skins.levels')} keyboardType="number-pad" value={draft.depth} onChangeText={(depth) => setDraft((d) => ({ ...d, depth }))} />
      <Toggle label={t('skins.ideas')} hint={t('skins.ideasHint')} value={s.proposals_enabled} onChange={(v) => save({ proposalsEnabled: v })} />
      <Field label={t('skins.video')} keyboardType="number-pad" value={draft.video} onChangeText={(video) => setDraft((d) => ({ ...d, video }))} />
      <Text style={type.small}>{t('skins.videoHint')}</Text>
      <Button label={t('skins.save')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
      <Text style={type.heading}>{t('skins.queue', { count: pending.length })}</Text>
      {pending.map((i) => (
        <View key={i.id} style={styles.section}>
          <Text style={type.body}>
            {i.name} · {t(`skinIdea.layout.${i.layout}`)} · {i.from?.name}
          </Text>
          <Text style={type.small}>{i.description}</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {[...new Set([...Object.values(i.colors ?? {}), ...Object.values(i.tokens ?? {})].filter((v): v is string => typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v)))].slice(0, 6).map((c, n) => (
              <View key={n} style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: c }} accessibilityLabel={c} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button small label={t('skins.approve')} onPress={() => review(() => api.admin.approveThemeProposal(i.id))} />
            <Button small variant="secondary" label={t('skins.decline')} onPress={() => review(() => api.admin.declineThemeProposal(i.id))} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Push delivery: retries without repeats, receipts, folding and an hourly cap (docs/PUSH_DELIVERY.md). */
export function PushDeliverySection() {
  const t = useT();
  const [d, setD] = useState<PushDelivery | null>(null);
  const [fold, setFold] = useState('');
  const [cap, setCap] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const show = (x: PushDelivery) => {
    setD(x);
    setFold(String(x.settings.collapse_minutes));
    setCap(String(x.settings.max_per_hour));
  };
  useFocusEffect(
    useCallback(() => {
      api.admin.pushSettings().then(show).catch((e) => setNote((e as Error).message));
    }, []),
  );
  const save = (patch: { enabled?: boolean } = {}) =>
    api.admin
      .updatePushSettings({ collapseMinutes: toInt(fold) ?? undefined, maxPerHour: toInt(cap) ?? undefined, ...patch })
      .then((r) => {
        show(r);
        setNote(t('pushDelivery.saved'));
      })
      .catch((e) => setNote((e as Error).message));
  if (!d) return note ? <Text style={type.small}>{note}</Text> : null;
  const n = (k: keyof PushDelivery['health']['byStatus']) => d.health.byStatus[k] ?? 0;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('pushDelivery.title')}</Text>
      <Text style={type.small}>{t('pushDelivery.intro')}</Text>
      <Toggle label={t('pushDelivery.toggle')} value={d.settings.push_reliability_enabled} onChange={(v) => save({ enabled: v })} />
      <Field label={t('pushDelivery.fold')} keyboardType="number-pad" value={fold} onChangeText={setFold} />
      <Field label={t('pushDelivery.cap')} keyboardType="number-pad" value={cap} onChangeText={setCap} />
      <Button label={t('pushDelivery.save')} onPress={() => save()} />
      <Text style={type.small}>
        {t('pushDelivery.health', { delivered: n('ok'), sent: n('sent'), waiting: n('retry') + n('held'), folded: n('folded') + n('capped'), failed: n('error'), off: d.health.devicesTurnedOff })}
      </Text>
      {d.health.errors.map((e) => (
        <Text key={e.error} style={type.small}>
          {t('pushDelivery.error', { error: e.error, n: e.n })}
        </Text>
      ))}
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Giving split: members may ask that a share of gifts toward them go to their own page. */
function GivingSplitSection() {
  const t = useT();
  const [s, setS] = useState<{ giving_split_enabled: boolean; max_percent: number } | null>(null);
  const [max, setMax] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const show = (x: { giving_split_enabled: boolean; max_percent: number }) => {
    setS(x);
    setMax(String(x.max_percent));
  };
  useFocusEffect(
    useCallback(() => {
      api.admin.givingSplitSettings().then((r) => show(r.settings)).catch((e) => setNote((e as Error).message));
    }, []),
  );
  const save = (patch: { enabled?: boolean } = {}) =>
    api.admin
      .updateGivingSplitSettings({ maxPercent: toInt(max) ?? undefined, ...patch })
      .then((r) => {
        show(r.settings);
        resetFeatures();
        setNote(t('givingSplit.adminSaved'));
      })
      .catch((e) => setNote((e as Error).message));
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('givingSplit.adminTitle')}</Text>
      <Text style={type.small}>{t('givingSplit.adminIntro')}</Text>
      <Toggle label={t('givingSplit.adminToggle')} value={s.giving_split_enabled} onChange={(v) => save({ enabled: v })} />
      <Field label={t('givingSplit.adminMax')} keyboardType="number-pad" value={max} onChangeText={setMax} />
      <Button label={t('givingSplit.adminSave')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Gentle reminders: a daily reminder that never mentions a missed day, and weeks of prayer (docs/GENTLE_REMINDERS.md). */
export function PracticeModeSection() {
  const t = useT();
  const [d, setD] = useState<{ settings: PracticeModeSettings; connected: PracticeConnected } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.practiceMode().then(setD).catch((e) => setNote((e as Error).message));
    }, []),
  );
  const save = (patch: Partial<PracticeModeSettings>) =>
    api.admin
      .updatePracticeMode(patch)
      .then((r) => (setD(r), resetFeatures(), setNote(t('practiceMode.saved'))))
      .catch((e) => setNote((e as Error).message));
  if (!d) return note ? <Text style={type.small}>{note}</Text> : null;
  const c = d.connected;
  const list = [
    c.ai && t('practiceMode.aiOn'),
    c.videoServer && t('practiceMode.videoOn'),
    c.jaas && t('practiceMode.jaasOn'),
    c.appStore && t('practiceMode.storeOn'),
  ].filter(Boolean);
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('practiceMode.title')}</Text>
      <Text style={type.small}>{t('practiceMode.intro')}</Text>
      <Text style={type.small}>{list.length ? t('practiceMode.connected', { list: list.join(', ') }) : t('practiceMode.nothing')}</Text>
      <Toggle label={t('practiceMode.ai')} hint={t('practiceMode.aiHint')} value={d.settings.ai} onChange={(v) => save({ ai: v })} />
      <Toggle label={t('practiceMode.live')} hint={t('practiceMode.liveHint')} value={d.settings.live} onChange={(v) => save({ live: v })} />
      <Toggle label={t('practiceMode.purchases')} hint={t('practiceMode.purchasesHint')} value={d.settings.purchases} onChange={(v) => save({ purchases: v })} />
      {c.practicePurchasesAllowed ? null : <Text style={type.small}>{t('practiceMode.noPracticeBuy')}</Text>}
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

export function ReminderSettingsSection() {
  const t = useT();
  const [s, setS] = useState<ReminderSettings | null>(null);
  const [quiet, setQuiet] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const show = (x: ReminderSettings) => {
    setS(x);
    setQuiet(String(x.quiet_after));
  };
  useFocusEffect(
    useCallback(() => {
      api.admin.reminderSettings().then((r) => show(r.settings)).catch((e) => setNote((e as Error).message));
    }, []),
  );
  const save = (patch: { dailyReminderEnabled?: boolean; gentleStreakEnabled?: boolean } = {}) =>
    api.admin
      .updateReminderSettings({ quietAfter: toInt(quiet) ?? undefined, ...patch })
      .then((r) => {
        show(r.settings);
        resetFeatures();
        setNote(t('reminders.adminSaved'));
      })
      .catch((e) => setNote((e as Error).message));
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('reminders.adminTitle')}</Text>
      <Text style={type.small}>{t('reminders.adminIntro')}</Text>
      <Toggle
        label={t('reminders.adminDaily')}
        hint={t('reminders.adminDailyHint')}
        value={s.daily_reminder_enabled}
        onChange={(v) => save({ dailyReminderEnabled: v })}
      />
      <Field label={t('reminders.adminQuiet')} keyboardType="number-pad" value={quiet} onChangeText={setQuiet} />
      <Toggle
        label={t('reminders.adminWeeks')}
        hint={t('reminders.adminWeeksHint')}
        value={s.gentle_streak_enabled}
        onChange={(v) => save({ gentleStreakEnabled: v })}
      />
      <Button label={t('reminders.adminSave')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Moderation tools: search, bulk decisions and audit log filters (docs/MODERATION_TOOLS.md). */
export function ModerationToolsSection() {
  const t = useT();
  const [s, setS] = useState<{ tools_enabled: boolean; bulk_max: number } | null>(null);
  const [max, setMax] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const show = (x: { tools_enabled: boolean; bulk_max: number }) => {
    setS(x);
    setMax(String(x.bulk_max));
  };
  useFocusEffect(
    useCallback(() => {
      api.admin.moderationTools().then((r) => show(r.settings)).catch((e) => setNote((e as Error).message));
    }, []),
  );
  const save = (patch: { enabled?: boolean } = {}) =>
    api.admin
      .updateModerationTools({ bulkMax: toInt(max) ?? undefined, ...patch })
      .then((r) => {
        show(r.settings);
        resetFeatures();
        setNote(t('modTools.adminSaved'));
      })
      .catch((e) => setNote((e as Error).message));
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('modTools.adminTitle')}</Text>
      <Text style={type.small}>{t('modTools.adminIntro')}</Text>
      <Toggle label={t('modTools.adminToggle')} value={s.tools_enabled} onChange={(v) => save({ enabled: v })} />
      <Field label={t('modTools.adminMax')} keyboardType="number-pad" value={max} onChangeText={setMax} />
      <Button label={t('modTools.adminSave')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Goldfish memory (docs/GENTLE_REPAIR.md): recent removals in the queue, which fade after a set time. */
export function GoldfishSection() {
  const t = useT();
  const [s, setS] = useState<GoldfishSettings | null>(null);
  const [days, setDays] = useState('');
  const [repeat, setRepeat] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const show = (x: GoldfishSettings) => {
    setS(x);
    setDays(String(x.goldfish_days));
    setRepeat(String(x.goldfish_repeat));
  };
  useFocusEffect(
    useCallback(() => {
      api.admin.goldfish().then((r) => show(r.settings)).catch((e) => setNote((e as Error).message));
    }, []),
  );
  const save = (patch: { enabled?: boolean } = {}) =>
    api.admin
      .updateGoldfish({ days: toInt(days) ?? undefined, repeat: toInt(repeat) ?? undefined, ...patch })
      .then((r) => {
        show(r.settings);
        resetFeatures();
        setNote(t('goldfish.adminSaved'));
      })
      .catch((e) => setNote((e as Error).message));
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('goldfish.adminTitle')}</Text>
      <Toggle label={t('goldfish.adminToggle')} hint={t('goldfish.adminHint')} value={s.goldfish_enabled} onChange={(v) => save({ enabled: v })} />
      <Field label={t('goldfish.adminDays')} keyboardType="number-pad" value={days} onChangeText={setDays} />
      <Field label={t('goldfish.adminRepeat')} keyboardType="number-pad" value={repeat} onChangeText={setRepeat} />
      <Button label={t('goldfish.adminSave')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Growth ideas the big platforms missed (docs/GROWTH.md): each off until switched on here. */
function GrowthSettingsSection() {
  const t = useT();
  const [s, setS] = useState<GrowthSettings | null>(null);
  const [max, setMax] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const show = (x: GrowthSettings) => {
    setS(x);
    setMax(String(x.prayer_chain_max));
  };
  useFocusEffect(
    useCallback(() => {
      api.admin.growthSettings().then((r) => show(r.settings)).catch((e) => setNote((e as Error).message));
    }, []),
  );
  const save = (patch: Parameters<typeof api.admin.updateGrowthSettings>[0] = {}) =>
    api.admin
      .updateGrowthSettings({ prayerChainMax: toInt(max) ?? undefined, ...patch })
      .then((r) => {
        show(r.settings);
        resetFeatures();
        setNote(t('growth.adminSaved'));
      })
      .catch((e) => setNote((e as Error).message));
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('growth.adminTitle')}</Text>
      <Text style={type.small}>{t('growth.adminIntro')}</Text>
      <Toggle label={t('growth.adminGuest')} hint={t('growth.adminGuestHint')} value={s.guest_prayer_enabled} onChange={(v) => save({ guestPrayerEnabled: v })} />
      <Toggle label={t('growth.adminChain')} hint={t('growth.adminChainHint')} value={s.prayer_chain_enabled} onChange={(v) => save({ prayerChainEnabled: v })} />
      <Field label={t('growth.adminChainMax')} keyboardType="number-pad" value={max} onChangeText={setMax} />
      <Toggle label={t('growth.adminWidget')} hint={t('growth.adminWidgetHint')} value={s.prayed_for_widget_enabled} onChange={(v) => save({ prayedForWidgetEnabled: v })} />
      <Toggle label={t('growth.adminMinute')} hint={t('growth.adminMinuteHint')} value={s.prayer_minute_enabled} onChange={(v) => save({ prayerMinuteEnabled: v })} />
      <Toggle label={t('growth.adminShare')} hint={t('growth.adminShareHint')} value={s.share_consent_enabled} onChange={(v) => save({ shareConsentEnabled: v })} />
      <Toggle label={t('growth.adminSms')} hint={t('growth.adminSmsHint')} value={s.prayer_chain_sms_enabled} onChange={(v) => save({ prayerChainSmsEnabled: v })} />
      <Toggle label={t('growth.adminLive')} hint={t('growth.adminLiveHint')} value={s.prayed_for_live_enabled} onChange={(v) => save({ prayedForLiveEnabled: v })} />
      <Button label={t('growth.adminSave')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Encourager check-ins: totals by answer, never who said what. */
function CheckInTotals() {
  const t = useT();
  const [c, setC] = useState<Record<CheckInAnswer, number> | null>(null);
  useEffect(() => {
    api.admin.encouragerCheckins().then((r) => setC(r.totals), () => undefined);
  }, []);
  return c ? <Text style={type.small}>{t('encCheck.totals', { good: c.good, okay: c.okay, change: c.change })}</Text> : null;
}

const SKY: Record<Weather, string> = { sunny: '☀️', fair: '🌤️', cloudy: '☁️', stormy: '⛈️', quiet: '🌫️' };

/** Kindness weather: one line a week, newest first, from totals only. Quiet weeks show no numbers. */
function KindnessWeather() {
  const t = useT();
  const [weeks, setWeeks] = useState<WeatherWeek[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    api.admin.kindnessWeather().then((r) => setWeeks(r.weeks), (e) => setNote((e as Error).message));
  }, []);
  if (!weeks) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View testID="kindness-weather" style={{ gap: space.xs }}>
      <Text style={type.body} role="heading">
        {t('weather.title')}
      </Text>
      <Text style={type.small}>{t('weather.intro')}</Text>
      {weeks.map((w) => (
        <View key={w.weekStart} accessible accessibilityLabel={`${t('weather.week', { date: w.weekStart })}: ${t(`weather.${w.weather}`)}`}>
          <Text style={type.small}>
            {SKY[w.weather]} {t('weather.week', { date: w.weekStart })}: {t(`weather.${w.weather}`)}
          </Text>
          {w.comments !== null ? <Text style={type.small}>{t('weather.numbers', { comments: w.comments, warm: w.warm ?? 0, heated: w.heated ?? 0, lifts: w.prayers ?? 0, people: w.people ?? 0 })}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** Community health: what matters each week, never time spent. Quiet weeks are folded. */
export function CommunityHealth() {
  const t = useT();
  const [weeks, setWeeks] = useState<HealthWeek[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    api.admin.communityHealth().then((r) => setWeeks(r.weeks), (e) => setNote((e as Error).message));
  }, []);
  if (!weeks) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View testID="community-health" style={{ gap: space.xs }}>
      <Text style={type.body} role="heading">
        {t('health.title')}
      </Text>
      <Text style={type.small}>{t('health.intro')}</Text>
      {weeks.map((w) => (
        <Text key={w.weekStart} style={type.small}>
          {t('weather.week', { date: w.weekStart })}:{' '}
          {w.requests === null ? t('health.quiet') : t('health.numbers', { requests: w.requests, held: w.held ?? 0, answered: w.answered ?? 0, returning: w.returning ?? 0 })}
        </Text>
      ))}
    </View>
  );
}

/** Counting patterns: weekly totals of move labels; rows under the minimum are folded together. */
function TalkCountsView() {
  const t = useT();
  const [c, setC] = useState<TalkCountSummary | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    api.admin.talkCounts().then((r) => setC(r.counts), (e) => setNote((e as Error).message));
  }, []);
  if (!c) return note ? <Text style={type.small}>{note}</Text> : null;
  const move = (m: string) => t(`talk.move.${m}`);
  return (
    <View testID="talk-counts" style={{ gap: space.xs }}>
      <Text style={type.body}>{t('talk.countsTitle', { weeks: c.weeks })}</Text>
      {!c.chains.length && !c.emoji.length && !c.otherChains && !c.otherEmoji ? <Text style={type.small}>{t('talk.countsEmpty')}</Text> : null}
      {c.chains.length || c.otherChains ? <Text style={type.small}>{t('talk.countsChains')}</Text> : null}
      {c.chains.map((r) => (
        <Text key={r.moves.join('-')} style={type.small}>
          {r.moves.map(move).join(' → ')}: {r.n}
        </Text>
      ))}
      {c.otherChains ? <Text style={type.small}>{t('talk.countsFolded', { min: c.minShown, n: c.otherChains })}</Text> : null}
      {c.emoji.length || c.otherEmoji ? <Text style={type.small}>{t('talk.countsEmoji')}</Text> : null}
      {c.emoji.map((r) => (
        <Text key={`${r.emoji}-${r.meaning}-${r.toMove}`} style={type.small}>
          {t('talk.countsEmojiRow', { emoji: r.emoji, meaning: r.meaning, move: move(r.toMove), n: r.n })}
        </Text>
      ))}
      {c.otherEmoji ? <Text style={type.small}>{t('talk.countsFolded', { min: c.minShown, n: c.otherEmoji })}</Text> : null}
    </View>
  );
}

/** Conversation helpers (docs/CONVERSATION_HELPERS.md): each off until switched on; members still choose on Me. */
function ConversationSettingsSection() {
  const t = useT();
  const [s, setS] = useState<ConversationSettings | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.conversationSettings().then((r) => setS(r.settings)).catch((e) => setNote((e as Error).message));
    }, []),
  );
  const save = (patch: Parameters<typeof api.admin.updateConversationSettings>[0]) =>
    api.admin
      .updateConversationSettings(patch)
      .then((r) => {
        setS(r.settings);
        resetFeatures();
        setNote(t('talk.adminSave'));
      })
      .catch((e) => setNote((e as Error).message));
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('talk.adminTitle')}</Text>
      <Text style={type.small}>{t('talk.adminIntro')}</Text>
      <Toggle label={t('talk.adminSuggestions')} hint={t('talk.adminSuggestionsHint')} value={s.reply_suggestions_enabled} onChange={(v) => save({ replySuggestionsEnabled: v })} />
      <Toggle label={t('talk.adminMeaning')} hint={t('talk.adminMeaningHint')} value={s.meaning_prefs_enabled} onChange={(v) => save({ meaningPrefsEnabled: v })} />
      <Toggle label={t('talk.adminCare')} hint={t('talk.adminCareHint')} value={s.trouble_nudge_enabled} onChange={(v) => save({ troubleNudgeEnabled: v })} />
      <Toggle label={t('talk.adminPacks')} hint={t('talk.adminPacksHint')} value={s.greeting_packs_enabled} onChange={(v) => save({ greetingPacksEnabled: v })} />
      <Toggle label={t('talk.adminOwnWords')} hint={t('talk.adminOwnWordsHint')} value={s.own_words_enabled} onChange={(v) => save({ ownWordsEnabled: v })} />
      <Toggle label={t('talk.adminClosings')} hint={t('talk.adminClosingsHint')} value={s.kind_closings_enabled} onChange={(v) => save({ kindClosingsEnabled: v })} />
      <Toggle label={t('talk.adminMeaningRow')} hint={t('talk.adminMeaningRowHint')} value={s.meaning_row_enabled} onChange={(v) => save({ meaningRowEnabled: v })} />
      <Toggle label={t('talk.adminCounts')} hint={t('talk.adminCountsHint')} value={s.talk_counts_enabled} onChange={(v) => save({ talkCountsEnabled: v })} />
      {s.talk_counts_enabled ? <TalkCountsView /> : null}
      <Toggle label={t('meaningProposals.adminTitle')} hint={t('meaningProposals.adminHint')} value={s.meaning_proposals_enabled} onChange={(v) => save({ meaningProposalsEnabled: v })} />
      {s.meaning_proposals_enabled ? <MeaningProposalsAdmin /> : null}
      <Toggle label={t('talk.adminTypePrompts')} hint={t('talk.adminTypePromptsHint')} value={s.type_prompts_enabled} onChange={(v) => save({ typePromptsEnabled: v })} />
      <Toggle label={t('commentKindness.adminHearts')} hint={t('commentKindness.adminHeartsHint')} value={s.author_hearts_enabled} onChange={(v) => save({ authorHeartsEnabled: v })} />
      <Toggle label={t('commentKindness.adminThanks')} hint={t('commentKindness.adminThanksHint')} value={s.comment_thanks_enabled} onChange={(v) => save({ commentThanksEnabled: v })} />
      <Toggle label={t('quietCounts.adminTitle')} hint={t('quietCounts.adminHint')} value={s.quiet_counts_enabled} onChange={(v) => save({ quietCountsEnabled: v })} />
      <Toggle label={t('replyChoice.adminTitle')} hint={t('replyChoice.adminHint')} value={s.reply_choice_enabled} onChange={(v) => save({ replyChoiceEnabled: v })} />
      <Toggle label={t('research.adminTitle')} hint={t('research.adminHint')} value={s.research_page_enabled} onChange={(v) => save({ researchPageEnabled: v })} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Growth practices (docs/GROWTH_PRACTICES.md): kind habits with nothing to lose, each off until switched on. */
function PracticeSettingsSection() {
  const t = useT();
  const [s, setS] = useState<PracticeSettings | null>(null);
  const [days, setDays] = useState('');
  const [encDays, setEncDays] = useState('');
  const [partnerDays, setPartnerDays] = useState('');
  const [newDays, setNewDays] = useState('');
  const [welcome, setWelcome] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const show = (x: PracticeSettings) => {
    setS(x);
    setDays(String(x.followup_days));
    setEncDays(String(x.encourager_days));
    setPartnerDays(String(x.partner_days));
    setNewDays(String(x.newcomer_days));
    setWelcome(x.welcome_text ?? '');
  };
  useFocusEffect(
    useCallback(() => {
      api.admin.practiceSettings().then((r) => show(r.settings)).catch((e) => setNote((e as Error).message));
    }, []),
  );
  const save = (patch: Parameters<typeof api.admin.updatePracticeSettings>[0] = {}) =>
    api.admin
      .updatePracticeSettings({ followupDays: toInt(days) ?? undefined, encouragerDays: toInt(encDays) ?? undefined, partnerDays: toInt(partnerDays) ?? undefined, newcomerDays: toInt(newDays) ?? undefined, welcomeText: welcome, ...patch })
      .then((r) => {
        show(r.settings);
        resetFeatures();
        setNote(t('practices.adminSaved'));
      })
      .catch((e) => setNote((e as Error).message));
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('practices.adminTitle')}</Text>
      <Text style={type.small}>{t('practices.adminIntro')}</Text>
      <Toggle label={t('practices.adminFollowup')} hint={t('practices.adminFollowupHint')} value={s.followup_enabled} onChange={(v) => save({ followupEnabled: v })} />
      <Field label={t('practices.adminFollowupDays')} keyboardType="number-pad" value={days} onChangeText={setDays} />
      <Toggle label={t('practices.adminGratitude')} hint={t('practices.adminGratitudeHint')} value={s.gratitude_enabled} onChange={(v) => save({ gratitudeEnabled: v })} />
      <Toggle label={t('practices.adminRhythm')} hint={t('practices.adminRhythmHint')} value={s.gentle_rhythm_enabled} onChange={(v) => save({ gentleRhythmEnabled: v })} />
      <Toggle label={t('practices.adminEncourager')} hint={t('practices.adminEncouragerHint')} value={s.encourager_enabled} onChange={(v) => save({ encouragerEnabled: v })} />
      <Field label={t('practices.adminEncouragerDays')} keyboardType="number-pad" value={encDays} onChangeText={setEncDays} />
      <Field label={t('practices.adminNewcomerDays')} keyboardType="number-pad" value={newDays} onChangeText={setNewDays} />
      <Toggle label={t('encCheck.adminTitle')} hint={t('encCheck.adminHint')} value={s.encourager_checkin_enabled} onChange={(v) => save({ encouragerCheckinEnabled: v })} />
      {s.encourager_checkin_enabled ? <CheckInTotals /> : null}
      <Toggle label={t('practices.adminLiftUp')} hint={t('practices.adminLiftUpHint')} value={s.lift_up_enabled} onChange={(v) => save({ liftUpEnabled: v })} />
      <Toggle label={t('practices.adminGratitudeCount')} hint={t('practices.adminGratitudeCountHint')} value={s.gratitude_count_enabled} onChange={(v) => save({ gratitudeCountEnabled: v })} />
      <Toggle label={t('practices.adminBelieve')} hint={t('practices.adminBelieveHint')} value={s.believe_enabled} onChange={(v) => save({ believeEnabled: v })} />
      <Toggle label={t('practices.adminPartners')} hint={t('practices.adminPartnersHint')} value={s.partners_enabled} onChange={(v) => save({ partnersEnabled: v })} />
      <Field label={t('practices.adminPartnerDays')} keyboardType="number-pad" value={partnerDays} onChangeText={setPartnerDays} />
      <Toggle label={t('highlightsKind.adminTitle')} hint={t('highlightsKind.adminHint')} value={s.highlights_enabled} onChange={(v) => save({ highlightsEnabled: v })} />
      {s.highlights_enabled ? <HighlightsAdmin /> : null}
      <Toggle label={t('lament.adminTitle')} hint={t('lament.adminHint')} value={s.lament_enabled} onChange={(v) => save({ lamentEnabled: v })} />
      <Toggle label={t('answeredStory.adminTitle')} hint={t('answeredStory.adminHint')} value={s.answered_stories_enabled} onChange={(v) => save({ answeredStoriesEnabled: v })} />
      <Toggle label={t('kindIntro.adminTitle')} hint={t('kindIntro.adminHint')} value={s.kindness_intro_enabled} onChange={(v) => save({ kindnessIntroEnabled: v })} />
      <Toggle label={t('checkBack.adminTitle')} hint={t('checkBack.adminHint')} value={s.check_back_enabled} onChange={(v) => save({ checkBackEnabled: v })} />
      <Toggle label={t('kindMilestones.adminTitle')} hint={t('kindMilestones.adminHint')} value={s.kind_milestones_enabled} onChange={(v) => save({ kindMilestonesEnabled: v })} />
      <Toggle label={t('thankNote.adminTitle')} hint={t('thankNote.adminHint')} value={s.thank_note_enabled} onChange={(v) => save({ thankNoteEnabled: v })} />
      <Toggle label={t('calm.adminTitle')} hint={t('calm.adminHint')} value={s.calm_threads_enabled} onChange={(v) => save({ calmThreadsEnabled: v })} />
      <Toggle label={t('circles.adminTitle')} hint={t('circles.adminHint')} value={s.prayer_circles_enabled} onChange={(v) => save({ prayerCirclesEnabled: v })} />
      <Toggle label={t('circleWelcome.adminTitle')} hint={t('circleWelcome.adminHint')} value={s.circle_welcome_enabled} onChange={(v) => save({ circleWelcomeEnabled: v })} />
      <Toggle label={t('pathBack.adminTitle')} hint={t('pathBack.adminHint')} value={s.path_back_enabled} onChange={(v) => save({ pathBackEnabled: v })} />
      <Toggle label={t('kindWords.adminTitle')} hint={t('kindWords.adminHint')} value={s.empathy_practice_enabled} onChange={(v) => save({ empathyPracticeEnabled: v })} />
      <Toggle label={t('weather.adminTitle')} hint={t('weather.adminHint')} value={s.kindness_weather_enabled} onChange={(v) => save({ kindnessWeatherEnabled: v })} />
      {s.kindness_weather_enabled ? <KindnessWeather /> : null}
      <Toggle label={t('health.adminTitle')} hint={t('health.adminHint')} value={s.community_health_enabled} onChange={(v) => save({ communityHealthEnabled: v })} />
      {s.community_health_enabled ? <CommunityHealth /> : null}
      <Toggle label={t('intention.adminTitle')} hint={t('intention.adminHint')} value={s.weekly_intention_enabled} onChange={(v) => save({ weeklyIntentionEnabled: v })} />
      <Toggle label={t('coolDown.adminTitle')} hint={t('coolDown.adminHint')} value={s.cool_down_enabled} onChange={(v) => save({ coolDownEnabled: v })} />
      <Toggle label={t('practices.adminRemembered')} hint={t('practices.adminRememberedHint')} value={s.remembered_enabled} onChange={(v) => save({ rememberedEnabled: v })} />
      <Toggle label={t('repair.adminWelcome')} hint={t('repair.adminWelcomeHint')} value={s.welcome_card_enabled} onChange={(v) => save({ welcomeCardEnabled: v })} />
      <Field label={t('repair.adminWelcomeText')} value={welcome} onChangeText={setWelcome} multiline maxLength={600} />
      <Toggle label={t('repair.adminAskKindly')} hint={t('repair.adminAskKindlyHint')} value={s.ask_kindly_enabled} onChange={(v) => save({ askKindlyEnabled: v })} />
      <Toggle label={t('repair.adminMend')} hint={t('repair.adminMendHint')} value={s.mend_enabled} onChange={(v) => save({ mendEnabled: v })} />
      <Button label={t('practices.adminSave')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Notebook ideas (Batch 7): each on by default, each with its own switch. */
function NotebookSettingsSection() {
  const t = useT();
  const [s, setS] = useState<NotebookSettings | null>(null);
  const [days, setDays] = useState('');
  const [upkeepDays, setUpkeepDays] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const show = (x: NotebookSettings) => {
    setS(x);
    setDays(String(x.thanks_card_days));
    setUpkeepDays(String(x.tier_upkeep_days));
  };
  useFocusEffect(
    useCallback(() => {
      api.admin.notebookSettings().then((r) => show(r.settings)).catch((e) => setNote((e as Error).message));
    }, []),
  );
  const save = (patch: Parameters<typeof api.admin.updateNotebookSettings>[0] = {}) =>
    api.admin
      .updateNotebookSettings({ thanksCardDays: toInt(days) ?? undefined, tierUpkeepDays: toInt(upkeepDays) ?? undefined, ...patch })
      .then((r) => {
        show(r.settings);
        resetFeatures();
        setNote(t('admin.saved.notebook'));
      })
      .catch((e) => setNote((e as Error).message));
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.notebook')}</Text>
      <Toggle label={t('admin.toggle.worldwide')} hint={t('admin.toggle.worldwideHint')} value={s.worldwide_count_enabled} onChange={(v) => save({ worldwideCountEnabled: v })} />
      <Toggle label={t('admin.toggle.thanksCard')} hint={t('admin.toggle.thanksCardHint')} value={s.thanks_card_enabled} onChange={(v) => save({ thanksCardEnabled: v })} />
      <Field label={t('admin.field.thanksDays')} keyboardType="number-pad" value={days} onChangeText={setDays} />
      <Toggle label={t('admin.toggle.sermonInputs')} hint={t('admin.toggle.sermonInputsHint')} value={s.sermon_inputs_enabled} onChange={(v) => save({ sermonInputsEnabled: v })} />
      <Toggle label={t('admin.toggle.supportLabel')} hint={t('admin.toggle.supportLabelHint')} value={s.support_label_enabled} onChange={(v) => save({ supportLabelEnabled: v })} />
      <Toggle label={t('admin.toggle.witnessStories')} hint={t('admin.toggle.witnessStoriesHint')} value={s.witness_stories_enabled} onChange={(v) => save({ witnessStoriesEnabled: v })} />
      <Toggle label={t('admin.toggle.pressureRule')} hint={t('admin.toggle.pressureRuleHint')} value={s.pressure_rule_enabled} onChange={(v) => save({ pressureRuleEnabled: v })} />
      <Toggle label={t('admin.toggle.misleadingRule')} hint={t('admin.toggle.misleadingRuleHint')} value={s.misleading_rule_enabled} onChange={(v) => save({ misleadingRuleEnabled: v })} />
      <Toggle label={t('admin.toggle.automationRule')} hint={t('admin.toggle.automationRuleHint')} value={s.automation_rule_enabled} onChange={(v) => save({ automationRuleEnabled: v })} />
      <Toggle label={t('admin.toggle.urgencyGlow')} hint={t('admin.toggle.urgencyGlowHint')} value={s.urgency_glow_enabled} onChange={(v) => save({ urgencyGlowEnabled: v })} />
      <Toggle label={t('admin.toggle.reactionTray')} hint={t('admin.toggle.reactionTrayHint')} value={s.reaction_tray_enabled} onChange={(v) => save({ reactionTrayEnabled: v })} />
      <Toggle label={t('admin.toggle.memberTown')} hint={t('admin.toggle.memberTownHint')} value={s.member_town_enabled} onChange={(v) => save({ memberTownEnabled: v })} />
      <Toggle label={t('admin.toggle.prizeChoice')} hint={t('admin.toggle.prizeChoiceHint')} value={s.prize_choice_enabled} onChange={(v) => save({ prizeChoiceEnabled: v })} />
      <Toggle label={t('admin.toggle.waitlist')} hint={t('admin.toggle.waitlistHint')} value={s.waitlist_enabled} onChange={(v) => save({ waitlistEnabled: v })} />
      <Toggle label={t('admin.toggle.crossCommunity')} hint={t('admin.toggle.crossCommunityHint')} value={s.cross_community_enabled} onChange={(v) => save({ crossCommunityEnabled: v })} />
      <Toggle label={t('admin.toggle.postLines')} hint={t('admin.toggle.postLinesHint')} value={s.post_lines_enabled} onChange={(v) => save({ postLinesEnabled: v })} />
      <Toggle label={t('admin.toggle.tierUpkeep')} hint={t('admin.toggle.tierUpkeepHint')} value={s.tier_upkeep_enabled} onChange={(v) => save({ tierUpkeepEnabled: v })} />
      <Field label={t('admin.field.tierUpkeepDays')} keyboardType="number-pad" value={upkeepDays} onChangeText={setUpkeepDays} />
      <Toggle label={t('admin.toggle.checkinAffirmation')} hint={t('admin.toggle.checkinAffirmationHint')} value={s.checkin_affirmation_enabled} onChange={(v) => save({ checkinAffirmationEnabled: v })} />
      <Toggle label={t('admin.toggle.whyGifts')} hint={t('admin.toggle.whyGiftsHint')} value={s.why_gifts_enabled} onChange={(v) => save({ whyGiftsEnabled: v })} />
      <Toggle label={t('admin.toggle.poolMatching')} hint={t('admin.toggle.poolMatchingHint')} value={s.pool_matching_enabled} onChange={(v) => save({ poolMatchingEnabled: v })} />
      <Toggle label={t('admin.toggle.kindCloud')} hint={t('admin.toggle.kindCloudHint')} value={s.kind_cloud_enabled} onChange={(v) => save({ kindCloudEnabled: v })} />
      <Toggle label={t('admin.toggle.meaningReactions')} hint={t('admin.toggle.meaningReactionsHint')} value={s.meaning_reactions_enabled} onChange={(v) => save({ meaningReactionsEnabled: v })} />
      <Toggle label={t('admin.toggle.lamps')} hint={t('admin.toggle.lampsHint')} value={s.lamps_enabled} onChange={(v) => save({ lampsEnabled: v })} />
      <Toggle label={t('admin.toggle.poolLedger')} hint={t('admin.toggle.poolLedgerHint')} value={s.pool_ledger_enabled} onChange={(v) => save({ poolLedgerEnabled: v })} />
      <Toggle label={t('admin.toggle.circleGoals')} hint={t('admin.toggle.circleGoalsHint')} value={s.circle_goals_enabled} onChange={(v) => save({ circleGoalsEnabled: v })} />
      <Toggle label={t('admin.toggle.givingAsk')} hint={t('admin.toggle.givingAskHint')} value={s.giving_ask_enabled} onChange={(v) => save({ givingAskEnabled: v })} />
      <Toggle label={t('admin.toggle.supportLinks')} hint={t('admin.toggle.supportLinksHint')} value={s.support_links_enabled} onChange={(v) => save({ supportLinksEnabled: v })} />
      <Toggle label={t('admin.toggle.squireBoard')} hint={t('admin.toggle.squireBoardHint')} value={s.squire_board_enabled} onChange={(v) => save({ squireBoardEnabled: v })} />
      <Toggle label={t('admin.toggle.groupGifts')} hint={t('admin.toggle.groupGiftsHint')} value={s.group_gifts_enabled} onChange={(v) => save({ groupGiftsEnabled: v })} />
      <Toggle label={t('admin.toggle.prayerList')} hint={t('admin.toggle.prayerListHint')} value={s.prayer_list_enabled} onChange={(v) => save({ prayerListEnabled: v })} />
      <Toggle label={t('admin.toggle.readingPlan')} hint={t('admin.toggle.readingPlanHint')} value={s.reading_plan_enabled} onChange={(v) => save({ readingPlanEnabled: v })} />
      <Toggle label={t('admin.toggle.promisePage')} hint={t('admin.toggle.promisePageHint')} value={s.promise_page_enabled} onChange={(v) => save({ promisePageEnabled: v })} />
      <Toggle label={t('admin.toggle.podcasts')} hint={t('admin.toggle.podcastsHint')} value={s.podcasts_enabled} onChange={(v) => save({ podcastsEnabled: v })} />
      <Toggle label={t('admin.toggle.crosspost')} hint={t('admin.toggle.crosspostHint')} value={s.crosspost_enabled} onChange={(v) => save({ crosspostEnabled: v })} />
      <Button label={t('admin.btn.saveNotebook')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Messages (Features Set 2): switches and limits. Defaults are placeholders until Steve decides. */
function MessagingSettingsSection() {
  const t = useT();
  const [s, setS] = useState<AdminMessagingSettings | null>(null);
  const [draft, setDraft] = useState({ requests: '', perDay: '', groupMax: '' });
  const [note, setNote] = useState<string | null>(null);

  const show = (x: AdminMessagingSettings) => {
    setS(x);
    setDraft({ requests: String(x.request_message_limit), perDay: String(x.new_member_messages_per_day), groupMax: String(x.group_max_members) });
  };

  useFocusEffect(
    useCallback(() => {
      api.admin.messagingSettings().then((r) => show(r.settings)).catch((e) => setNote((e as Error).message));
    }, []),
  );

  const save = (patch: Parameters<typeof api.admin.updateMessagingSettings>[0] = {}) =>
    api.admin
      .updateMessagingSettings({
        requestMessageLimit: toInt(draft.requests) ?? undefined,
        newMemberMessagesPerDay: toInt(draft.perDay) ?? undefined,
        groupMaxMembers: toInt(draft.groupMax) ?? undefined,
        ...patch,
      })
      .then((r) => {
        show(r.settings);
        setNote(t('admin.saved.messages'));
      })
      .catch((e) => setNote((e as Error).message));

  if (!s) return null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.messages')}</Text>
      <Toggle label={t('admin.toggle.prayerMessages')} value={s.prayer_messages_enabled} onChange={(v) => save({ prayerMessagesEnabled: v })} />
      <Toggle
        label={t('admin.toggle.anyPrayer')}
        hint={t('admin.toggle.anyPrayerHint')}
        value={s.prayer_messages_any_prayer}
        onChange={(v) => save({ prayerMessagesAnyPrayer: v })}
      />
      <Toggle label={t('admin.toggle.direct')} value={s.direct_messages_enabled} onChange={(v) => save({ directMessagesEnabled: v })} />
      <Toggle
        label={t('admin.toggle.mutual')}
        hint={t('admin.toggle.mutualHint')}
        value={s.direct_requires_mutual_follow}
        onChange={(v) => save({ directRequiresMutualFollow: v })}
      />
      <Toggle label={t('admin.toggle.groups')} value={s.groups_enabled} onChange={(v) => save({ groupsEnabled: v })} />
      <Toggle label={t('admin.toggle.newStart')} value={s.new_members_can_start} onChange={(v) => save({ newMembersCanStart: v })} />
      <Field label={t('admin.field.requests')} keyboardType="number-pad" value={draft.requests} onChangeText={(requests) => setDraft((d) => ({ ...d, requests }))} />
      <Field label={t('admin.field.perDay')} keyboardType="number-pad" value={draft.perDay} onChangeText={(perDay) => setDraft((d) => ({ ...d, perDay }))} />
      <Field label={t('admin.field.groupMax')} keyboardType="number-pad" value={draft.groupMax} onChangeText={(groupMax) => setDraft((d) => ({ ...d, groupMax }))} />
      <Button label={t('admin.btn.saveMessages')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  group: { gap: space.xs, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  groupTitle: { ...type.body, fontWeight: '700' },
  stat: { flexDirection: 'row', justifyContent: 'space-between' },
  value: { ...type.body, fontWeight: '600' },
  trendRow: { flexDirection: 'row', gap: space.xs },
  trendCell: { ...type.body, flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  trendWeek: { flex: 1.2, textAlign: 'left' },
  trendHead: { ...type.small, fontWeight: '700' },
});

// Private standings for the Annual Prayer Warrior Award. Not shown to members.
function PrayerWarriorsSection() {
  const t = useT();
  const [days, setDays] = useState(365);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.admin.prayerWarriors>>['standings']>([]);
  const load = useCallback(() => {
    api.admin
      .prayerWarriors(days)
      .then((r) => setRows(r.standings.slice(0, 10)))
      .catch(() => undefined);
  }, [days]);
  useFocusEffect(load);
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.warriors')}</Text>
      <Text style={type.small}>{t('admin.warriorsHint')}</Text>
      <View style={styles.row}>
        {[30, 90, 365].map((d) => (
          <Button key={d} small variant={d === days ? 'primary' : 'ghost'} label={d === 365 ? t('admin.year') : t('admin.days', { count: d })} onPress={() => setDays(d)} />
        ))}
      </View>
      {rows.length ? (
        rows.map((r) => (
          <Text key={r.userId} style={type.body}>
            {r.rank}. {r.name}: {t('admin.standing', { prayers: r.prayers, checkins: r.checkins, people: r.peoplePrayedFor })}
          </Text>
        ))
      ) : (
        <Text style={type.small}>{t('admin.noWarriors')}</Text>
      )}
    </View>
  );
}

// Pilot feedback from members: how many are open, and a way into triage.
function FeedbackSection() {
  const { t } = useLocale();
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(() => {
    api.admin
      .feedback({ status: 'open' })
      .then((r) => setOpen(r.feedback.length))
      .catch(() => undefined);
  }, []);
  useFocusEffect(load);
  if (open === null) return null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.feedback', { count: open })}</Text>
      <Button variant="secondary" label={t('admin.feedbackTriage')} onPress={() => router.push('/feedback-triage')} />
    </View>
  );
}

export default staffOnly(Admin, ['admin']);

// Admin console for the pilot (Epic 9): pilot metrics, token settings
// (including whether radio prayers spend Priestly tokens or are free), tier
// thresholds and weekly allotments, and finding people to grant or revoke
// roles. The server checks the admin role on every call.
import { COMMUNITY_FEATURES, POST_TYPE_LABELS, POST_TYPES, type Role } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { HarmSettingsSection } from '@/components/harm-admin';
import { staffOnly } from '@/components/staff-only';
import { JobsPanel } from '@/components/jobs-panel';
import { LedgerCheckPanel } from '@/components/ledger-check';
import { Button, Chip, Field, ErrorText, Screen, Toggle } from '@/components/ui';
import { api, type AdminMessagingSettings, type Award, type AwardSettings, type Community, type SpokenPrayerSettings, type AdminPerson, type AdminRadioSettings, type AdminSafetySettings, type AdminTier, type AdminTokenSettings, type MilestoneRule, type NotebookSettings, type GrowthSettings, type PilotWeek, type AiSettings, type LiveSettings, type AdminDonationSettings, type AdminGift, type SkinSettings, type ThemeProposal, type TokenPool, type StationBurst, type StationAlerts } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { useLocale, useT, type T } from '@/lib/i18n';
import { saveText } from '@/lib/save-file';
import { colors, radius, space, type } from '@/lib/theme';

const PERIODS = [7, 30, 90];
const REPORT_WEEKS = 12;
const TREND: (keyof PilotWeek)[] = ['requests_posted', 'praying_now_taps', 'commitments_made', 'commitment_checkins'];
const ROLES: Role[] = ['admin', 'moderator', 'pastor_counselor', 'witness', 'prayer_partner'];

// Metric names come from the server; known ones are translated, the rest are prettified.
const LABELS: Record<string, string> = { ai_flags: 'AI flags', active_pray_ers: 'Active pray-ers', checkins: 'Check-ins' };
const label = (t: T, key: string) =>
  t(`admin.metric.${key}`, { defaultValue: LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) });
const toInt = (s: string) => (s.trim() === '' ? null : Number.parseInt(s, 10));

function Admin() {
  const { t, language } = useLocale();
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
            <Text style={type.small}>{t('admin.radioBurst')}</Text>
            <View style={styles.row}>
              {[1, 10, 50, 100, 500].map((n) => (
                <Chip key={n} label={n === 1 ? t('admin.radioBurstOne') : String(n)} selected={radio.radio_batch_max === n} onPress={() => saveRadio({ batchMax: n })} />
              ))}
            </View>
            {radio.radio_batch_max > 1 ? <Text style={type.small}>{t('admin.radioBurstHint')}</Text> : null}
            {radio.radio_transmitter === 'station' ? <StationAlertsSection /> : null}
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
  const [on, setOn] = useState<boolean | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.securitySettings().then((r) => setOn(r.settings.two_step_enabled), (e) => setNote((e as Error).message));
    }, []),
  );
  const save = (v: boolean) =>
    api.admin
      .updateSecuritySettings({ twoStepEnabled: v })
      .then((r) => (setOn(r.settings.two_step_enabled), resetFeatures(), setNote(t('admin.saved.security'))))
      .catch((e) => setNote((e as Error).message));
  if (on === null) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('admin.security')}</Text>
      <Toggle label={t('admin.toggle.twoStep')} hint={t('admin.toggle.twoStepHint')} value={on} onChange={save} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Giving instead of ads: the switch, how people give, and gifts that came in. Off by default. */
function GivingSection() {
  const t = useT();
  const [s, setS] = useState<AdminDonationSettings | null>(null);
  const [keys, setKeys] = useState({ stripe: false, webhook: false, zeffy: false, zeffyWebhook: false });
  const [gifts, setGifts] = useState<AdminGift[]>([]);
  const [pools, setPools] = useState<TokenPool[]>([]);
  const [draft, setDraft] = useState({ url: '', paypal: '', monthly: '', max: '', amount: '', reference: '' });
  const [via, setVia] = useState<'manual' | 'zeffy' | 'paypal'>('manual');
  const [poolId, setPoolId] = useState<string | null>(null);
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
      .recordGift({ amountCents: cents, reference: draft.reference.trim(), via, target: poolId ? { kind: 'pool', poolId } : { kind: 'everyone' } })
      .then(() => (setDraft((d) => ({ ...d, amount: '', reference: '' })), setNote(t('admin.giftRecorded')), loadGifts()))
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
        <Chip label={t('give.everyone')} selected={!poolId} onPress={() => setPoolId(null)} />
        {pools.map((p) => (
          <Chip key={p.id} label={p.name} selected={poolId === p.id} onPress={() => setPoolId(p.id)} />
        ))}
      </View>
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
            {i.name} · {i.layout === 'wall' ? t('skinIdea.wall') : t('skinIdea.vine')} · {i.from?.name}
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
      <Button label={t('growth.adminSave')} onPress={() => save()} />
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
      <Toggle label={t('admin.toggle.promisePage')} hint={t('admin.toggle.promisePageHint')} value={s.promise_page_enabled} onChange={(v) => save({ promisePageEnabled: v })} />
      <Toggle label={t('admin.toggle.podcasts')} hint={t('admin.toggle.podcastsHint')} value={s.podcasts_enabled} onChange={(v) => save({ podcastsEnabled: v })} />
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

// Admin console for the pilot (Epic 9): pilot metrics, token settings
// (including whether radio prayers spend Priestly tokens or are free), tier
// thresholds and weekly allotments, and finding people to grant or revoke
// roles. The server checks the admin role on every call.
import type { Role } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Field, ErrorText, Screen, Toggle } from '@/components/ui';
import { api, type AdminPerson, type AdminRadioSettings, type AdminSafetySettings, type AdminTier, type AdminTokenSettings, type MilestoneRule, type PilotWeek } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

const PERIODS = [7, 30, 90];
const REPORT_WEEKS = 12;
const TREND: { key: keyof PilotWeek; label: string }[] = [
  { key: 'requests_posted', label: 'Requests' },
  { key: 'praying_now_taps', label: 'Prayers' },
  { key: 'commitments_made', label: 'Promises' },
  { key: 'commitment_checkins', label: 'Kept' },
];
const ROLES: { role: Role; label: string }[] = [
  { role: 'admin', label: 'Admin' },
  { role: 'moderator', label: 'Moderator' },
  { role: 'pastor_counselor', label: 'Pastor / counselor' },
  { role: 'prayer_partner', label: 'Prayer partner' },
];

const LABELS: Record<string, string> = { ai_flags: 'AI flags', active_pray_ers: 'Active pray-ers', checkins: 'Check-ins' };
const label = (key: string) => LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const toInt = (s: string) => (s.trim() === '' ? null : Number.parseInt(s, 10));

export default function Admin() {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [metrics, setMetrics] = useState<Record<string, Record<string, number | string | null>> | null>(null);
  const [weeks, setWeeks] = useState<PilotWeek[]>([]);
  const [radio, setRadio] = useState<AdminRadioSettings | null>(null);
  const [tokens, setTokens] = useState<AdminTokenSettings | null>(null);
  const [tokenDraft, setTokenDraft] = useState({ perToken: '', gap: '', cost: '' });
  const [safety, setSafety] = useState<AdminSafetySettings | null>(null);
  const [safetyDraft, setSafetyDraft] = useState({ hours: '', prayers: '', posts: '', comments: '' });
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
    setTokenDraft({ perToken: String(s.priestly_prayers_per_token), gap: String(s.verified_prayer_min_gap_seconds), cost: String(s.radio_prayer_cost) });
  };
  const showSafety = (s: AdminSafetySettings) => {
    setSafety(s);
    setSafetyDraft({
      hours: String(s.new_member_hours),
      prayers: String(s.new_member_min_prayers),
      posts: String(s.new_member_posts_per_day),
      comments: String(s.new_member_comments_per_day),
    });
  };
  const showTiers = (t: AdminTier[]) => {
    setTiers(t);
    setTierDraft(Object.fromEntries(t.map((x) => [x.tier, { min: x.min_prayer_events?.toString() ?? '', weekly: x.weekly_allotment?.toString() ?? '' }])));
  };

  const load = useCallback(
    () =>
      run(async () => {
        const [m, s, t, sf, w, rs, ms] = await Promise.all([
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
        showTiers(t.tiers);
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
        await Share.share({ title: 'Prayer Tower pilot report', message: csv });
      }
    });

  const saveRadio = (patch: Parameters<typeof api.admin.updateRadioSettings>[0]) =>
    run(async () => setRadio((await api.admin.updateRadioSettings(patch)).settings), 'Radio settings saved.');

  const saveTokens = () =>
    run(async () => {
      const r = await api.admin.updateTokenSettings({
        priestlyPrayersPerToken: toInt(tokenDraft.perToken) ?? undefined,
        verifiedPrayerMinGapSeconds: toInt(tokenDraft.gap) ?? undefined,
        radioPrayerCost: toInt(tokenDraft.cost) ?? undefined,
      });
      showTokens(r.settings);
    }, 'Token settings saved.');

  const setFunding = (free: boolean) =>
    run(async () => showTokens((await api.admin.updateTokenSettings({ radioFunding: free ? 'free' : 'tokens' })).settings), 'Radio funding saved.');

  const saveSafety = (patch: Parameters<typeof api.admin.updateSafetySettings>[0] = {}) =>
    run(async () => {
      const r = await api.admin.updateSafetySettings({
        newMemberHours: toInt(safetyDraft.hours) ?? undefined,
        newMemberMinPrayers: toInt(safetyDraft.prayers) ?? undefined,
        newMemberPostsPerDay: toInt(safetyDraft.posts) ?? undefined,
        newMemberCommentsPerDay: toInt(safetyDraft.comments) ?? undefined,
        ...patch,
      });
      showSafety(r.settings);
    }, 'New-member limits saved.');

  const saveTiers = () =>
    run(async () => {
      for (const t of tiers) {
        const d = tierDraft[t.tier];
        if (!d) continue;
        const min = toInt(d.min);
        const weekly = toInt(d.weekly);
        if (min !== t.min_prayer_events || weekly !== t.weekly_allotment) {
          await api.admin.updateTier(t.tier, { minPrayerEvents: min, weeklyAllotment: weekly });
        }
      }
      showTiers((await api.admin.tiers()).tiers);
    }, 'Tiers saved.');

  const search = () => run(async () => setPeople((await api.admin.people(query)).people));

  const toggleRole = (p: AdminPerson, role: Role) =>
    run(async () => {
      const r = p.roles.includes(role) ? await api.admin.revoke(p.id, role) : await api.admin.grant(p.id, role);
      setPeople((list) => list?.map((x) => (x.id === p.id ? { ...x, roles: r.roles } : x)) ?? null);
    });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>Admin</Text>
        <ErrorText error={error} />
        {saved ? <Text style={[type.small, { color: colors.primary }]}>{saved}</Text> : null}

        <View style={styles.section}>
          <Text style={type.heading}>Pilot metrics</Text>
          <View style={styles.row}>
            {PERIODS.map((d) => (
              <Chip key={d} label={`${d} days`} selected={days === d} onPress={() => setDays(d)} />
            ))}
          </View>
          {metrics
            ? Object.entries(metrics)
                .filter(([, v]) => v && typeof v === 'object')
                .map(([group, values]) => (
                  <View key={group} style={styles.group}>
                    <Text style={styles.groupTitle}>{label(group)}</Text>
                    {Object.entries(values).map(([k, v]) => (
                      <View key={k} style={styles.stat}>
                        <Text style={type.body}>{label(k)}</Text>
                        <Text style={styles.value}>{v ?? '—'}</Text>
                      </View>
                    ))}
                  </View>
                ))
            : null}
        </View>

        {weeks.length ? (
          <View style={styles.section}>
            <Text style={type.heading}>Pilot results by week</Text>
            <View style={styles.trendRow}>
              <Text style={[styles.trendCell, styles.trendWeek, styles.trendHead]}>Week of</Text>
              {TREND.map((c) => (
                <Text key={c.key} style={[styles.trendCell, styles.trendHead]}>
                  {c.label}
                </Text>
              ))}
            </View>
            {[...weeks].reverse().map((w) => (
              <View key={w.week_start} style={styles.trendRow}>
                <Text style={[styles.trendCell, styles.trendWeek]}>{w.week_start.slice(5)}</Text>
                {TREND.map((c) => (
                  <Text key={c.key} style={styles.trendCell}>
                    {w[c.key]}
                  </Text>
                ))}
              </View>
            ))}
            <Button variant="secondary" label={`Download ${REPORT_WEEKS}-week report (CSV)`} onPress={downloadCsv} />
          </View>
        ) : null}

        {tokens ? (
          <View style={styles.section}>
            <Text style={type.heading}>Tokens</Text>
            <Toggle
              label="Radio prayers are free"
              hint="On: radio prayers cost nothing and Priestly tokens are donations only. Off: each radio prayer spends Priestly tokens."
              value={tokens.radio_funding === 'free'}
              onChange={setFunding}
            />
            <Field label="Verified prayers per Priestly token" keyboardType="number-pad" value={tokenDraft.perToken} onChangeText={(perToken) => setTokenDraft((d) => ({ ...d, perToken }))} />
            <Field label="Minimum seconds between verified prayers" keyboardType="number-pad" value={tokenDraft.gap} onChangeText={(gap) => setTokenDraft((d) => ({ ...d, gap }))} />
            <Field label="Priestly tokens per radio prayer" keyboardType="number-pad" value={tokenDraft.cost} onChangeText={(cost) => setTokenDraft((d) => ({ ...d, cost }))} />
            <Button label="Save token settings" onPress={saveTokens} />
          </View>
        ) : null}

        {safety ? (
          <View style={styles.section}>
            <Text style={type.heading}>New members</Text>
            <Toggle
              label="Limit new members"
              hint="New until they have been here long enough and prayed for others enough times. Admins and moderators are exempt."
              value={safety.new_member_limits_enabled}
              onChange={(v) => saveSafety({ newMemberLimitsEnabled: v })}
            />
            <Toggle label="New members can post links" value={safety.new_member_links_allowed} onChange={(v) => saveSafety({ newMemberLinksAllowed: v })} />
            <Toggle label="Prayer messages are on" value={safety.messages_enabled} onChange={(v) => saveSafety({ messagesEnabled: v })} />
            <Field label="Hours as a new member" keyboardType="number-pad" value={safetyDraft.hours} onChangeText={(hours) => setSafetyDraft((d) => ({ ...d, hours }))} />
            <Field label="Prayers for others to lift limits" keyboardType="number-pad" value={safetyDraft.prayers} onChangeText={(prayers) => setSafetyDraft((d) => ({ ...d, prayers }))} />
            <Field label="Requests a day" keyboardType="number-pad" value={safetyDraft.posts} onChangeText={(posts) => setSafetyDraft((d) => ({ ...d, posts }))} />
            <Field label="Comments a day" keyboardType="number-pad" value={safetyDraft.comments} onChangeText={(comments) => setSafetyDraft((d) => ({ ...d, comments }))} />
            <Button label="Save new-member limits" onPress={() => saveSafety()} />
          </View>
        ) : null}

        {radio ? (
          <View style={styles.section}>
            <Text style={type.heading}>Radio</Text>
            <View style={styles.row}>
              <Chip label="Log only (no radio)" selected={radio.radio_transmitter === 'log'} onPress={() => saveRadio({ transmitter: 'log' })} />
              <Chip label="Radio station" selected={radio.radio_transmitter === 'station'} onPress={() => saveRadio({ transmitter: 'station' })} />
            </View>
            <Toggle
              label="Station sends only while radio prayers are free"
              hint="Amateur radio rules (47 CFR 97.113) forbid tying a transmission to payment. Keep this on for an amateur station."
              value={radio.radio_station_requires_free}
              onChange={(v) => saveRadio({ stationRequiresFree: v })}
            />
            <Text style={type.small}>
              Amplify sends a prayer {radio.radio_amplify_repeats} times (free only). “1,000x a second” is not possible on PSK31, about one prayer a
              minute.
            </Text>
            <View style={styles.row}>
              {[2, 3, 5, 10].map((n) => (
                <Chip key={n} label={`${n}x`} selected={radio.radio_amplify_repeats === n} onPress={() => saveRadio({ amplifyRepeats: n })} />
              ))}
            </View>
            {radio.radio_transmitter === 'station' && radio.radio_station_requires_free && tokens?.radio_funding !== 'free' ? (
              <Text style={[type.small, { color: colors.danger }]}>The station is paused: turn on “Radio prayers are free” above.</Text>
            ) : null}
          </View>
        ) : null}

        {tiers.length ? (
          <View style={styles.section}>
            <Text style={type.heading}>Tiers</Text>
            <Text style={type.small}>Leave a box empty to keep it undecided.</Text>
            {tiers.map((t) => (
              <View key={t.tier} style={styles.group}>
                <Text style={styles.groupTitle}>{t.label}</Text>
                <Field
                  label="Prayers to reach this tier"
                  keyboardType="number-pad"
                  value={tierDraft[t.tier]?.min ?? ''}
                  onChangeText={(min) => setTierDraft((d) => ({ ...d, [t.tier]: { weekly: d[t.tier]?.weekly ?? '', min } }))}
                />
                <Field
                  label="Weekly token allotment"
                  keyboardType="number-pad"
                  value={tierDraft[t.tier]?.weekly ?? ''}
                  onChangeText={(weekly) => setTierDraft((d) => ({ ...d, [t.tier]: { min: d[t.tier]?.min ?? '', weekly } }))}
                />
              </View>
            ))}
            <Button label="Save tiers" onPress={saveTiers} />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={type.heading}>Milestone bonuses</Text>
          <Text style={type.small}>Bonus tokens for reaching a milestone, given once per member. Every rule is off until you turn it on.</Text>
          {rules.map((r) => (
            <View key={r.id} style={styles.group}>
              <Toggle
                label={r.label}
                hint={`${METRIC_LABELS[r.metric]}: ${r.threshold} → ${r.amount} ${r.currency === 'priestly' ? 'Priestly ' : ''}token${r.amount === 1 ? '' : 's'} · given ${r.awarded} time${r.awarded === 1 ? '' : 's'}`}
                value={r.enabled}
                onChange={(enabled) =>
                  run(async () => {
                    const { rule } = await api.admin.updateMilestone(r.id, { enabled });
                    setRules((all) => all.map((x) => (x.id === r.id ? { ...x, ...rule } : x)));
                  }, enabled ? 'Milestone on.' : 'Milestone off.')
                }
              />
            </View>
          ))}
          <View style={styles.group}>
            <Text style={styles.groupTitle}>Add a milestone (starts off)</Text>
            <View style={styles.row}>
              {(Object.keys(METRIC_LABELS) as MilestoneRule['metric'][]).map((m) => (
                <Chip key={m} label={METRIC_LABELS[m]} selected={ruleDraft.metric === m} onPress={() => setRuleDraft((d) => ({ ...d, metric: m }))} />
              ))}
            </View>
            <Field label="Name" value={ruleDraft.label} onChangeText={(label) => setRuleDraft((d) => ({ ...d, label }))} maxLength={80} />
            <Field label="Reached at" keyboardType="number-pad" value={ruleDraft.threshold} onChangeText={(threshold) => setRuleDraft((d) => ({ ...d, threshold }))} />
            <Field label="Bonus tokens" keyboardType="number-pad" value={ruleDraft.amount} onChangeText={(amount) => setRuleDraft((d) => ({ ...d, amount }))} />
            <Button
              label="Add milestone"
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
                }, 'Milestone added. Turn it on when ready.')
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={type.heading}>People and roles</Text>
          <Field placeholder="Name or email" value={query} onChangeText={setQuery} onSubmitEditing={search} autoCapitalize="none" />
          <Button variant="secondary" label="Find" disabled={!query.trim()} onPress={search} />
          {people?.length === 0 ? <Text style={type.small}>No one matches.</Text> : null}
          {people?.map((p) => (
            <View key={p.id} style={styles.group}>
              <Text style={styles.groupTitle}>{p.display_name}</Text>
              {p.email ? <Text style={type.small}>{p.email}</Text> : null}
              <View style={styles.row}>
                {ROLES.map((r) => (
                  <Chip key={r.role} label={r.label} selected={p.roles.includes(r.role)} onPress={() => toggleRole(p, r.role)} />
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const METRIC_LABELS: Record<MilestoneRule['metric'], string> = {
  prayers_for_others: 'Prayers for others',
  commitment_checkins: 'Commitment check-ins',
  answered_requests: 'Answered requests',
};

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

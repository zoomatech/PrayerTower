// Admin console for the pilot (Epic 9): pilot metrics, token settings
// (including whether radio prayers spend Priestly tokens or are free), tier
// thresholds and weekly allotments, and finding people to grant or revoke
// roles. The server checks the admin role on every call.
import type { Role } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Field, ErrorText, Screen, Toggle } from '@/components/ui';
import { api, type AdminPerson, type AdminTier, type AdminTokenSettings } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

const PERIODS = [7, 30, 90];
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
  const [tokens, setTokens] = useState<AdminTokenSettings | null>(null);
  const [tokenDraft, setTokenDraft] = useState({ perToken: '', gap: '', cost: '' });
  const [tiers, setTiers] = useState<AdminTier[]>([]);
  const [tierDraft, setTierDraft] = useState<Record<string, { min: string; weekly: string }>>({});
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
  const showTiers = (t: AdminTier[]) => {
    setTiers(t);
    setTierDraft(Object.fromEntries(t.map((x) => [x.tier, { min: x.min_prayer_events?.toString() ?? '', weekly: x.weekly_allotment?.toString() ?? '' }])));
  };

  const load = useCallback(
    () =>
      run(async () => {
        const [m, s, t] = await Promise.all([api.admin.metrics(days), api.admin.tokenSettings(), api.admin.tiers()]);
        setMetrics(m);
        showTokens(s.settings);
        showTiers(t.tiers);
      }),
    [days],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

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

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  group: { gap: space.xs, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  groupTitle: { ...type.body, fontWeight: '700' },
  stat: { flexDirection: 'row', justifyContent: 'space-between' },
  value: { ...type.body, fontWeight: '600' },
});

// Admin → Radio: listener requests (server radio/listener-signup.ts), thank-you cards
// (radio/qsl.ts) and the weekly station report (radio/station-report.ts), which the
// operator console also shows. Each is off by default; docs/STATION_OPERATOR_GUIDE.md
// has the listener's side.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { Button, Chip } from '@/components/ui';
import { api, type ListenerSignup, type ListenerSignups, type QslCard, type StationReport, type StationReportOverview } from '@/lib/api';
import { env } from '@/lib/env';
import { errorText } from '@/lib/error-report';
import { useT } from '@/lib/i18n';
import { colors, space, type } from '@/lib/theme';

/** People asking to run a listener node: approve (a one-use setup link), decline or remove. */
export function ListenerSignupSection() {
  const t = useT();
  const [data, setData] = useState<ListenerSignups | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.listenerSignups().then(setData).catch((e) => setNote(errorText(e)));
    }, []),
  );
  if (!data) return note ? <Text style={[type.small, { color: colors.danger }]}>{note}</Text> : null;
  const reload = () => api.admin.listenerSignups().then(setData).catch((e) => setNote(errorText(e)));
  const set = (enabled: boolean) => api.admin.setListenerSignups(enabled).then(setData).catch((e) => setNote(errorText(e)));
  const approve = async (s: ListenerSignup) => {
    try {
      const r = await api.admin.approveListener(s.id);
      setNote(r.emailed ? t('listeners.emailed', { email: s.email }) : t('listeners.sendLink', { email: s.email }));
      if (!r.emailed) await Share.share({ message: t('listeners.shareMessage', { url: r.setupUrl }) });
      await reload();
    } catch (e) {
      setNote(errorText(e));
    }
  };
  const act = (p: Promise<unknown>) => p.then(reload).catch((e) => setNote(errorText(e)));
  const pending = data.signups.filter((s) => s.status === 'pending');
  const rest = data.signups.filter((s) => s.status !== 'pending').slice(0, 20);
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.row}>
        <Chip label={t('listeners.off')} selected={!data.enabled} onPress={() => set(false)} />
        <Chip label={t('listeners.on')} selected={data.enabled} onPress={() => set(true)} />
      </View>
      <Text style={type.small}>{t('listeners.hint', { url: `${env.apiUrl}/listeners` })}</Text>
      {data.enabled ? (
        <>
          <Text style={type.body}>{pending.length ? t('listeners.waiting', { count: pending.length }) : t('listeners.none')}</Text>
          {pending.map((s) => (
            <View key={s.id} style={styles.item}>
              <Text style={[type.body, { fontWeight: '600' }]}>{[s.name, s.place].filter(Boolean).join(', ')}</Text>
              <Text style={type.small}>
                {t('listeners.detail', { email: s.email, receiver: t(`listeners.receiver.${s.receiver}`), platform: t(`listeners.platform.${s.platform}`) })}
                {s.callSign ? ` · ${s.callSign}` : ''}
                {s.edition === 'open-circle' ? ` · ${t('listeners.openCircle')}` : ''}
              </Text>
              {s.note ? <Text style={type.small}>{s.note}</Text> : null}
              <View style={styles.row}>
                <Button label={t('listeners.approve')} variant="secondary" onPress={() => void approve(s)} />
                <Button label={t('listeners.decline')} variant="ghost" onPress={() => act(api.admin.declineListener(s.id))} />
              </View>
            </View>
          ))}
          {rest.map((s) => (
            <View key={s.id} style={styles.row}>
              <Text style={[type.small, { flex: 1 }]}>
                {s.name}: {t(`listeners.status.${s.status}`)}
              </Text>
              {s.status === 'approved' ? <Button label={t('listeners.newLink')} variant="ghost" onPress={() => void approve(s)} /> : null}
              {s.status !== 'joined' ? <Button label={t('listeners.remove')} variant="ghost" onPress={() => act(api.admin.removeListenerSignup(s.id))} /> : null}
            </View>
          ))}
        </>
      ) : null}
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Thank-you cards for confirmed reception: the switch and the newest cards. */
export function QslCardsSection() {
  const t = useT();
  const [data, setData] = useState<{ enabled: boolean; cards: QslCard[] } | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.qslCards().then(setData).catch(() => undefined);
    }, []),
  );
  if (!data) return null;
  const set = (enabled: boolean) => api.admin.setQslCards(enabled).then(setData).catch(() => undefined);
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.row}>
        <Chip label={t('qsl.off')} selected={!data.enabled} onPress={() => set(false)} />
        <Chip label={t('qsl.on')} selected={data.enabled} onPress={() => set(true)} />
      </View>
      <Text style={type.small}>{t('qsl.hint')}</Text>
      {data.enabled
        ? data.cards.slice(0, 10).map((c) => (
            <Text key={c.token} style={type.small} accessibilityLabel={t('qsl.rowLabel', { node: c.node, call: c.callSign, day: c.day, count: c.prayers })}>
              {t('qsl.row', { serial: c.serial, node: c.node, call: c.callSign, day: c.day, count: c.prayers, snr: c.bestSnrDb.toFixed(1) })}
            </Text>
          ))
        : null}
    </View>
  );
}

const minutes = (s: number) => (s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);

/** One week's numbers, shared by Admin → Radio and the operator console. */
export function StationReportWeek({ report, title }: { report: StationReport; title: string }) {
  const t = useT();
  const r = report;
  const line = (label: string, value: string | number) => (
    <View style={styles.tableRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[type.small, styles.cell, styles.first]}>{label}</Text>
      <Text style={[type.small, styles.cell]}>{value}</Text>
    </View>
  );
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[type.body, { fontWeight: '600' }]}>{title}</Text>
      {line(t('stationReport.bursts'), r.bursts.sent)}
      {line(t('stationReport.airTime'), minutes(r.bursts.airSeconds))}
      {line(t('stationReport.delivered'), r.prayers.delivered)}
      {line(t('stationReport.heard'), r.prayers.heard)}
      {line(t('stationReport.waiting'), r.prayers.waiting)}
      {line(t('stationReport.listeners'), t('stationReport.reportingOf', { reporting: r.listeners.reporting, nodes: r.listeners.nodes }))}
      {line(t('stationReport.newListeners'), r.listeners.joined)}
      {line(t('stationReport.cards'), r.listeners.cards)}
      {line(t('stationReport.problems'), r.problems.total)}
      {r.listeners.quiet.length ? <Text style={type.small}>{t('stationReport.quiet', { names: r.listeners.quiet.join(', ') })}</Text> : null}
      {r.problems.burstErrors.map((e) => (
        <Text key={e.error} style={type.small}>
          {t('stationReport.burstError', { count: e.count, error: e.error })}
        </Text>
      ))}
    </View>
  );
}

/** The switch, email, and last week next to this week so far. `operator`: read only (the console). */
export function StationReportSection({ operator = false }: { operator?: boolean }) {
  const t = useT();
  const [data, setData] = useState<StationReportOverview | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.stationReport().then(setData).catch(() => undefined);
    }, []),
  );
  if (!data || (operator && !data.enabled)) return null;
  const set = (patch: { enabled?: boolean; email?: boolean }) => api.admin.updateStationReport(patch).then(setData).catch(() => undefined);
  return (
    <View style={{ gap: space.sm }}>
      {operator ? (
        <Text style={type.heading}>{t('stationReport.title')}</Text>
      ) : (
        <>
          <View style={styles.row}>
            <Chip label={t('stationReport.off')} selected={!data.enabled} onPress={() => set({ enabled: false })} />
            <Chip label={t('stationReport.on')} selected={data.enabled} onPress={() => set({ enabled: true })} />
          </View>
          <Text style={type.small}>{t('stationReport.hint')}</Text>
          {data.enabled ? (
            <View style={styles.row}>
              <Chip label={t('stationReport.emailOff')} selected={!data.email} onPress={() => set({ email: false })} />
              <Chip label={t('stationReport.emailOn')} selected={data.email} onPress={() => set({ email: true })} />
            </View>
          ) : null}
        </>
      )}
      {data.lastWeek ? <StationReportWeek report={data.lastWeek} title={t('stationReport.lastWeek', { week: data.lastWeek.weekStart })} /> : null}
      {data.thisWeek ? <StationReportWeek report={data.thisWeek} title={t('stationReport.thisWeek')} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  item: { gap: space.xs, paddingVertical: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tableRow: { flexDirection: 'row', gap: space.sm },
  cell: { flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  first: { flex: 2, textAlign: 'left' },
});

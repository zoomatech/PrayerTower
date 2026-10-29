// Operator console (docs/STATION_OPERATOR_GUIDE.md, "Operator console"): one
// screen for the station's control operator. What is waiting, whether the
// station may transmit now (and why not), when each station last identified
// and must again, the latest transmissions, and two manual overrides: hold
// everything, or send outside the transmission windows for a while. Off until
// an admin turns it on in Admin → Radio; admins and radio operators use it.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { staffOnly } from '@/components/staff-only';
import { Button, Chip, Empty, ErrorText, Loading, Screen } from '@/components/ui';
import { api, ApiError, type RadioConsole } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const OVERRIDE_MINUTES = [15, 30, 60];

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const minutesFrom = (iso: string, now: number) => Math.round((Date.parse(iso) - now) / 60_000);

function OperatorConsole() {
  const { t } = useLocale();
  const [data, setData] = useState<RadioConsole | null>(null);
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setData(await api.radioConsole());
      setNow(Date.now());
      setOff(false);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setOff(true);
      else setError((e as Error).message);
    }
  }, []);
  // Refresh every 15 seconds while the screen is open, so the ID timer and queue stay current.
  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(load, 15_000);
      return () => clearInterval(id);
    }, [load]),
  );

  const change = async (patch: { paused?: boolean; windowOverrideMinutes?: number }) => {
    setBusy(true);
    setError(null);
    try {
      setData(await api.updateRadioConsole(patch));
      setNow(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (off) {
    return (
      <Screen>
        <View style={styles.content}>
          <Text style={type.title}>{t('operatorConsole.title')}</Text>
          <Empty text={t('operatorConsole.off')} />
        </View>
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        {error ? <ErrorText error={error} onRetry={load} /> : <Loading />}
      </Screen>
    );
  }

  const status = data.paused
    ? t('operatorConsole.statusHeld')
    : data.windowOverrideUntil
      ? t('operatorConsole.statusOverride', { time: clock(data.windowOverrideUntil) })
      : data.onAirNow
        ? t('operatorConsole.statusOnAir')
        : t('operatorConsole.statusOutside');

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={type.title}>{t('operatorConsole.title')}</Text>

        <View style={[styles.card, data.onAirNow ? styles.onAir : styles.offAir]} accessibilityRole="summary">
          <Text style={type.heading}>{data.onAirNow ? t('operatorConsole.mayTransmit') : t('operatorConsole.mayNotTransmit')}</Text>
          <Text style={type.body}>{status}</Text>
          <Text style={type.small}>
            {!data.schedule.enabled
              ? t('operatorConsole.noWindows')
              : data.schedule.inWindow
                ? t('operatorConsole.inWindow', { zone: data.schedule.timeZone })
                : t('operatorConsole.outsideWindow', { zone: data.schedule.timeZone })}
          </Text>
        </View>

        <Text style={type.heading}>{t('operatorConsole.override')}</Text>
        <View style={styles.row}>
          {data.paused ? (
            <Button disabled={busy} label={t('operatorConsole.resume')} onPress={() => change({ paused: false })} />
          ) : (
            <Button disabled={busy} variant="secondary" label={t('operatorConsole.hold')} onPress={() => change({ paused: true })} />
          )}
        </View>
        <Text style={type.small}>{t('operatorConsole.holdHint')}</Text>
        {data.schedule.enabled ? (
          <>
            <View style={styles.row}>
              {OVERRIDE_MINUTES.map((m) => (
                <Chip key={m} label={t('operatorConsole.sendFor', { minutes: m })} selected={false} onPress={() => change({ windowOverrideMinutes: m })} />
              ))}
              {data.windowOverrideUntil ? <Chip label={t('operatorConsole.endOverride')} selected onPress={() => change({ windowOverrideMinutes: 0 })} /> : null}
            </View>
            <Text style={type.small}>{t('operatorConsole.overrideHint')}</Text>
          </>
        ) : null}

        {data.sky ? (
          <View style={[styles.card, data.sky.aboveMinimum ? null : styles.offAir]}>
            <Text style={type.heading}>{t('operatorConsole.sky')}</Text>
            <Text style={type.body}>
              {t('operatorConsole.skyPoint', { target: data.sky.name ?? t(`operatorConsole.skyTarget.${data.sky.target}`), az: data.sky.az.toFixed(1), el: data.sky.el.toFixed(1) })}
            </Text>
            <Text style={type.small}>
              {data.sky.target === 'zenith'
                ? t('operatorConsole.skyZenith')
                : data.sky.next
                  ? t(data.sky.next.rising ? 'operatorConsole.skyRises' : 'operatorConsole.skySets', { time: clock(data.sky.next.at), min: data.sky.minElevation })
                  : t(data.sky.aboveMinimum ? 'operatorConsole.skyAlwaysUp' : 'operatorConsole.skyNeverUp', { min: data.sky.minElevation })}
              {!data.sky.aboveMinimum && data.sky.holdBelow ? ` ${t('operatorConsole.skyHeld')}` : ''}
            </Text>
          </View>
        ) : null}

        <Text style={type.heading}>{t('operatorConsole.idTimer')}</Text>
        {data.stations.length === 0 ? <Empty text={t('operatorConsole.noStations')} /> : null}
        {data.stations.map((s) => {
          const due = s.nextIdAt ? minutesFrom(s.nextIdAt, now) : null;
          return (
            <View key={s.callSign} style={styles.card}>
              <Text style={styles.strong}>{s.callSign}</Text>
              <Text style={type.body}>
                {s.lastIdAt ? t('operatorConsole.lastId', { time: clock(s.lastIdAt) }) : t('operatorConsole.neverId')}
                {due !== null ? ` · ${due > 0 ? t('operatorConsole.nextIdIn', { minutes: due }) : t('operatorConsole.idDue')}` : ''}
              </Text>
              <Text style={type.small}>{t('operatorConsole.heartbeat', { time: clock(s.lastHeartbeat) })}</Text>
            </View>
          );
        })}

        <Text style={type.heading}>{t('operatorConsole.queue')}</Text>
        <Text style={type.body}>
          {t('operatorConsole.queueCounts', { queued: data.queue.queued, sending: data.queue.sending })}
          {data.queue.oldestMinutes !== null ? ` · ${t('operatorConsole.oldest', { minutes: data.queue.oldestMinutes })}` : ''}
        </Text>
        {data.queue.next.length === 0 ? <Empty text={t('operatorConsole.queueEmpty')} /> : null}
        {data.queue.next.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={type.body} numberOfLines={3}>
              {r.text}
            </Text>
            <Text style={type.small}>
              {t('operatorConsole.waiting', { minutes: r.waitingMinutes })}
              {r.urgency > 0 ? ` · ${t('operatorConsole.urgency', { level: r.urgency })}` : ''}
              {r.repeats > 1 ? ` · ${t('operatorConsole.repeats', { count: r.repeats })}` : ''}
            </Text>
          </View>
        ))}

        {data.relays.length ? (
          <>
            <Text style={type.heading}>{t('operatorConsole.relays')}</Text>
            {data.relays.map((r) => (
              <View key={r.node} style={styles.card}>
                <Text style={styles.strong}>
                  {r.callSign} · {r.node}
                </Text>
                <Text style={type.body}>{t('operatorConsole.relayHour', { count: r.relayedLastHour, seconds: r.secondsLastHour, budget: r.budgetSeconds })}</Text>
                {Object.keys(r.skipped).length ? (
                  <Text style={type.small}>
                    {t('operatorConsole.relaySkipped', {
                      list: Object.entries(r.skipped)
                        .map(([reason, n]) => `${t(`operatorConsole.relayReason.${reason}`)} ${n}`)
                        .join(', '),
                    })}
                  </Text>
                ) : null}
              </View>
            ))}
          </>
        ) : null}

        {data.beacon.enabled ? (
          <>
            <Text style={type.heading}>{t('operatorConsole.beacon')}</Text>
            <Text style={type.small}>{t('operatorConsole.beaconHint', { minutes: data.beacon.minutes })}</Text>
            {data.beacon.recent.length === 0 ? <Empty text={t('operatorConsole.beaconNone')} /> : null}
            {data.beacon.recent.map((b) => (
              <View key={b.id} style={styles.logRow}>
                <Text style={type.small}>
                  {b.sentAt ? clock(b.sentAt) : t('operatorConsole.beaconWaiting')}
                  {b.preset ? ` · ${b.preset}` : ''}
                </Text>
                <Text style={type.body}>
                  {b.heard.length
                    ? b.heard.map((h) => t('operatorConsole.beaconHeardBy', { by: h.by, snr: Math.round(h.snrDb) })).join(', ')
                    : b.status === 'failed'
                      ? t('operatorConsole.beaconUnheard')
                      : t('operatorConsole.beaconListening')}
                </Text>
              </View>
            ))}
          </>
        ) : null}

        <Text style={type.heading}>{t('operatorConsole.log')}</Text>
        {data.log.length === 0 ? <Empty text={t('operatorConsole.logEmpty')} /> : null}
        {data.log.map((l, i) => (
          <View key={`${l.at}-${i}`} style={styles.logRow}>
            <Text style={type.small}>
              {clock(l.at)} · {l.callSign} · {l.preset} · {t(`operatorConsole.status.${l.status === 'transmitted' || l.status === 'failed' || l.status === 'sending' ? l.status : 'other'}`)}
              {l.heard ? ` · ${t('operatorConsole.heard')}` : ''}
            </Text>
            <Text style={type.body} numberOfLines={2}>
              {l.text}
            </Text>
            {l.error ? <Text style={styles.error}>{l.error}</Text> : null}
          </View>
        ))}
        <ErrorText error={error} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.xs },
  onAir: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  offAir: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  strong: { ...type.body, fontWeight: '700' },
  logRow: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: space.xs, gap: 2 },
  error: { ...type.small, color: colors.danger },
});

export default staffOnly(OperatorConsole, ['radio_operator', 'admin']);

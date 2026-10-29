// "Where it was heard" (docs/STATION_OPERATOR_GUIDE.md): for the member who sent a
// radio prayer and the person who asked, each time it went out and the
// receivers that really decoded it. Listener nodes are named; phones and
// listening pages are only counted. Nothing is estimated. Off with the admin's switch.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api, type RadioTrailEntry } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function RadioTrail({ postId }: { postId: string }) {
  const t = useT();
  const [trail, setTrail] = useState<RadioTrailEntry[] | null>(null);
  useEffect(() => {
    api.radioTrail(postId).then((r) => setTrail(r.trail), () => setTrail(null));
  }, [postId]);
  if (!trail?.length) return null;
  return (
    <View style={styles.box} testID="radio-trail">
      <Text style={type.heading}>{t('radioTrail.title')}</Text>
      {trail.map((e) => (
        <View key={e.sentAt} style={styles.entry}>
          <Text style={type.small}>
            {t(e.amplified ? 'radioTrail.sentAmplified' : 'radioTrail.sent', { time: when(e.sentAt) })}
            {e.callSign ? ` · ${e.callSign}` : ''}
          </Text>
          {e.nodes.map((n) => (
            <Text key={n.name} style={type.body}>
              {t('radioTrail.node', { name: n.name, snr: n.snrDb })}
            </Text>
          ))}
          {e.phones ? <Text style={type.body}>{t('radioTrail.phones', { count: e.phones })}</Text> : null}
          {!e.nodes.length && !e.phones ? <Text style={type.small}>{t('radioTrail.none')}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.xs },
  entry: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.sm, gap: 2 },
});

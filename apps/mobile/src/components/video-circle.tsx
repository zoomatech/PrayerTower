// Video circles (docs/VIDEO_CIRCLES.md), shown on the Mend screen and in Moderation →
// Sorries to read. A moderator offers a short, private video circle; the hurt person is
// asked first and the author only if they say yes. The room's address comes only once
// both said yes. Off until Admin → Live video turns it on.
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field } from '@/components/ui';
import { api, type VideoCircle } from '@/lib/api';
import { errorText } from '@/lib/error-report';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

/** The circle about this Mend for whoever is looking. `staff` lets a moderator offer one when none is open. */
export function VideoCircleCard({ mendId, staff = false }: { mendId: string; staff?: boolean }) {
  const { videoCircles } = useFeatures();
  const t = useT();
  const [circle, setCircle] = useState<VideoCircle | null | undefined>(undefined);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.videoCircle(mendId).then(
      (r) => setCircle(r.circle),
      (e) => setError(errorText(e)),
    );
  }, [mendId]);
  useEffect(() => {
    if (videoCircles) load();
  }, [videoCircles, load]);

  const run = async (fn: () => Promise<{ circle: VideoCircle }>) => {
    setBusy(true);
    setError(null);
    try {
      setCircle((await fn()).circle);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!videoCircles || circle === undefined) return error ? <ErrorText error={error} onRetry={load} /> : null;
  const closed = !circle || circle.status === 'declined' || circle.status === 'ended';
  if (closed && !staff) return circle ? <Text style={type.small}>{t(circle.status === 'ended' ? 'videoCircle.ended' : 'videoCircle.declined')}</Text> : null;

  if (closed)
    return (
      <View style={styles.card} testID="video-circle-offer">
        <Text style={type.heading}>{t('videoCircle.offerTitle')}</Text>
        {circle ? <Text style={type.small}>{t(circle.status === 'ended' ? 'videoCircle.ended' : 'videoCircle.declined')}</Text> : null}
        <Text style={type.small}>{t('videoCircle.offerHint')}</Text>
        <Field placeholder={t('videoCircle.notePlaceholder')} value={note} onChangeText={setNote} maxLength={400} multiline />
        <Button small label={t('videoCircle.offer')} busy={busy} onPress={() => run(() => api.offerVideoCircle(mendId, note.trim() || undefined))} />
        <ErrorText error={error} />
      </View>
    );

  const c = circle!;
  return (
    <View style={styles.card} testID="video-circle">
      <Text style={type.heading}>{t('videoCircle.title')}</Text>
      {c.canAnswer ? (
        <>
          <Text style={type.body}>{t(c.role === 'hurt' ? 'videoCircle.askHurt' : 'videoCircle.askAuthor')}</Text>
          {c.note ? <Text style={[type.body, styles.note]}>{t('videoCircle.moderatorSays', { note: c.note })}</Text> : null}
          <Text style={type.small}>{t('videoCircle.upToYou')}</Text>
        </>
      ) : null}
      {c.canAnswer || c.status === 'ready' ? (
        <View style={styles.questions}>
          <Text style={type.small}>{t('videoCircle.thinkAbout')}</Text>
          {c.questions.map((q) => (
            <Text key={q} style={type.body}>
              {'• '}
              {q}
            </Text>
          ))}
        </View>
      ) : null}
      {c.canAnswer ? (
        <View style={styles.row}>
          <Button small label={t('videoCircle.yes')} busy={busy} onPress={() => run(() => api.answerVideoCircle(c.id, true))} />
          <Button small variant="secondary" label={t('videoCircle.no')} onPress={() => run(() => api.answerVideoCircle(c.id, false))} />
        </View>
      ) : c.status === 'ready' ? (
        <>
          <Text style={type.body}>{t('videoCircle.ready')}</Text>
          <View style={styles.row}>
            {c.roomUrl ? <Button small label={t('videoCircle.open')} onPress={() => WebBrowser.openBrowserAsync(c.roomUrl!).catch(() => undefined)} /> : null}
            {c.role === 'moderator' ? <Button small variant="secondary" label={t('videoCircle.end')} onPress={() => run(() => api.endVideoCircle(c.id))} /> : null}
          </View>
        </>
      ) : (
        <Text style={type.small}>{c.role === 'moderator' ? t(c.status === 'asked_hurt' ? 'videoCircle.waitingHurtStaff' : 'videoCircle.waitingAuthorStaff') : t('videoCircle.waitingAuthor')}</Text>
      )}
      <ErrorText error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  note: { fontStyle: 'italic' },
  questions: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

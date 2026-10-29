// Kindness highlights (docs/GROWTH_PRACTICES.md): "This lifted me up" under a comment on
// your own request, a link to the week's highlights on Me, and the admin's picking queue.
// Highlights show only the words, never who wrote them or whom they lifted up.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { api, type HighlightQueueItem } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';
import { errorText } from '@/lib/error-report';

/** Under someone else's comment on your request: ask its author if it may be shared. */
export function LiftedMeUp({ commentId }: { commentId: string }) {
  const { kindnessHighlights } = useFeatures();
  const t = useT();
  const [state, setState] = useState<'idle' | 'asked' | 'error'>('idle');
  if (!kindnessHighlights) return null;
  if (state === 'asked')
    return (
      <Text style={type.small} aria-live="polite">
        {t('highlightsKind.asked')}
      </Text>
    );
  return (
    <Text
      style={styles.link}
      role="button"
      testID={`lifted-${commentId}`}
      accessibilityHint={t('highlightsKind.liftedHint')}
      onPress={() => api.liftedMeUp(commentId).then(() => setState('asked'), () => setState('error'))}>
      {state === 'error' ? t('highlightsKind.tryAgain') : t('highlightsKind.lifted')}
    </Text>
  );
}

/** On Me: a way into this week's highlights. */
export function HighlightsLink() {
  const { kindnessHighlights } = useFeatures();
  const t = useT();
  if (!kindnessHighlights) return null;
  return <Button small variant="secondary" label={t('highlightsKind.title')} onPress={() => router.push('/highlights')} />;
}

/** Admin: consented examples to pick from, with the words trimmed to keep them anonymous. */
export function HighlightsAdmin() {
  const t = useT();
  const [items, setItems] = useState<HighlightQueueItem[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.highlightQueue().then((r) => setItems(r.items), (e) => setNote(errorText(e)));
    }, []),
  );
  if (!items) return note ? <Text style={type.small}>{note}</Text> : null;
  const run = (p: Promise<{ items: HighlightQueueItem[] }>) => p.then((r) => setItems(r.items), (e) => setNote(errorText(e)));
  return (
    <View style={styles.admin} testID="highlights-admin">
      <Text style={type.body}>{t('highlightsKind.adminQueue')}</Text>
      {!items.length ? <Text style={type.small}>{t('highlightsKind.adminEmpty')}</Text> : null}
      {items.map((i) => (
        <View key={i.id} style={styles.item}>
          {i.community ? <Text style={type.small}>{i.community}</Text> : null}
          <Field
            label={t('highlightsKind.adminWords')}
            value={edits[i.id] ?? i.shownText ?? i.body}
            multiline
            maxLength={600}
            onChangeText={(v) => setEdits((e) => ({ ...e, [i.id]: v }))}
          />
          {i.status === 'picked' ? (
            <Button small variant="ghost" label={t('highlightsKind.adminUnpick')} onPress={() => run(api.admin.pickHighlight(i.id, false))} />
          ) : (
            <Button small label={t('highlightsKind.adminPick')} onPress={() => run(api.admin.pickHighlight(i.id, true, (edits[i.id] ?? i.body).trim()))} />
          )}
        </View>
      ))}
      {items.some((i) => i.status === 'picked') ? (
        <Button
          small
          variant="secondary"
          label={t('highlightsKind.adminSend')}
          onPress={() => api.admin.sendHighlights().then((r) => setNote(t('highlightsKind.adminSent', { count: r.sent })), (e) => setNote(errorText(e)))}
        />
      ) : null}
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  link: { ...type.small, color: colors.primary, minHeight: 44, textAlignVertical: 'center' },
  admin: { gap: space.sm },
  item: { gap: space.xs, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
});

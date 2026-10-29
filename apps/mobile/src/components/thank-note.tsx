// Thank the pray-ers on a post: the asker writes one warm note to everyone who prayed,
// with starters to help; pray-ers read it and can answer "Glad to".
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KindCloud } from '@/components/kind-cloud';
import { Button, Field } from '@/components/ui';
import { api, type ThankNote } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { announce } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

const STARTERS = ['thankNote.starter1', 'thankNote.starter2', 'thankNote.starter3'] as const;

export function ThankNoteCard({ postId, asker }: { postId: string; asker: string }) {
  const { thankNote } = useFeatures();
  const t = useT();
  const [state, setState] = useState<{ note: ThankNote | null; canWrite: boolean } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!thankNote) return;
    let live = true;
    api.thankNote(postId).then((r) => live && r.enabled && setState({ note: r.note, canWrite: r.canWrite }), () => undefined);
    return () => {
      live = false;
    };
  }, [thankNote, postId]);

  if (!thankNote || !state || (!state.note && !state.canWrite)) return null;

  const send = () =>
    api.sendThankNote(postId, draft!.trim()).then(
      (r) => {
        setState({ note: { body: draft!.trim(), createdAt: new Date().toISOString(), gladByMe: false, glad: 0 }, canWrite: false });
        setDraft(null);
        announce(t('thankNote.sent', { count: r.sent }));
      },
      (e) => setError((e as Error).message),
    );

  if (state.note) {
    const n = state.note;
    return (
      <View style={styles.card} testID="thank-note">
        <Text style={type.heading} accessibilityRole="header">
          {n.glad !== undefined ? t('thankNote.yours') : t('thankNote.from', { name: asker })}
        </Text>
        <Text style={type.body}>{n.body}</Text>
        {n.glad !== undefined ? (
          n.glad > 0 ? <Text style={type.small}>{t('thankNote.gladCount', { count: n.glad })}</Text> : null
        ) : n.gladByMe ? (
          <Text style={type.small}>❤️ {t('thankNote.gladSent')}</Text>
        ) : (
          <Button
            small
            variant="secondary"
            label={`❤️ ${t('thankNote.glad')}`}
            onPress={() => api.gladThankNote(postId).then(() => setState({ ...state, note: { ...n, gladByMe: true } }), () => undefined)}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.card} testID="thank-note">
      <Text style={type.heading} accessibilityRole="header">
        {t('thankNote.title')}
      </Text>
      {draft === null ? (
        <>
          <Text style={type.small}>{t('thankNote.hint')}</Text>
          <Button small variant="secondary" label={t('thankNote.write')} onPress={() => setDraft('')} />
        </>
      ) : (
        <>
          <View style={styles.row} role="group" aria-label={t('thankNote.starters')}>
            {STARTERS.map((k) => (
              <Pressable key={k} role="button" accessibilityHint={t('talk.suggestionHint')} style={styles.chip} onPress={() => setDraft(t(k))}>
                <Text style={styles.chipText}>{t(k)}</Text>
              </Pressable>
            ))}
          </View>
          <Field label={t('thankNote.label')} value={draft} onChangeText={setDraft} maxLength={600} multiline />
          <KindCloud text={draft} />
          <View style={styles.row}>
            <Button small label={t('thankNote.send')} disabled={!draft.trim()} onPress={send} />
            <Button small variant="ghost" label={t('common.cancel')} onPress={() => setDraft(null)} />
          </View>
          {error ? <Text style={[type.small, { color: colors.danger }]}>{error}</Text> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipText: { color: colors.text, fontSize: 14 },
});

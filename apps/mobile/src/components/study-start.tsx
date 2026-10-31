// Start a circle study (docs/LIBRARY_SEARCH.md): from any passage or reading-plan day, pick one of your circles
// and write a question or thought to open the talk. Off unless an admin turns on Admin → Text search → Study
// rooms, with prayer circles on.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { KindCloud } from '@/components/kind-cloud';
import { Button, Chip, Field } from '@/components/ui';
import { api, type LibraryCollectionId } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, space, type } from '@/lib/theme';

export type StudyOf = { collection: LibraryCollectionId; key: string } | { planId: string; day: number };

export function StudyStart({ of, citation }: { of: StudyOf; citation: string }) {
  const t = useT();
  const features = useFeatures();
  const on = features.libraryStudies && features.prayerCircles;
  const [open, setOpen] = useState(false);
  const [circles, setCircles] = useState<{ id: string; name: string }[] | null>(null);
  const [circleId, setCircleId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || circles) return;
    api.myCircles().then(
      (r) => {
        setCircles(r.circles.map((c) => ({ id: c.id, name: c.name })));
        setCircleId((x) => x ?? r.circles[0]?.id ?? null);
      },
      (e) => setError((e as Error).message),
    );
  }, [open, circles]);
  if (!on) return null;
  if (!open) return <Button small variant="ghost" label={t('library.studyStart')} a11yLabel={t('library.studyStartOne', { citation })} onPress={() => setOpen(true)} />;

  const start = () => {
    if (!circleId) return;
    setBusy(true);
    setError(null);
    return api
      .startStudy({ circleId, prompt: prompt.trim(), ...of })
      .then(
        (r) => {
          setOpen(false);
          setPrompt('');
          router.push(`/study-rooms?study=${r.id}`);
        },
        (e) => setError((e as Error).message),
      )
      .finally(() => setBusy(false));
  };
  return (
    <View style={styles.box}>
      {circles?.length === 0 ? <Text style={type.small}>{t('library.studyNoCircles')}</Text> : null}
      {circles?.length ? (
        <>
          <Text style={type.small}>{t('library.studyWhich')}</Text>
          <View style={styles.row} role="radiogroup">
            {circles.map((c) => (
              <Chip key={c.id} radio label={c.name} selected={circleId === c.id} onPress={() => setCircleId(c.id)} />
            ))}
          </View>
          <Field label={t('library.studyPrompt')} placeholder={t('library.studyPromptHint')} value={prompt} onChangeText={setPrompt} maxLength={2000} multiline />
          <KindCloud text={prompt} />
        </>
      ) : null}
      {error ? <Text style={[type.small, { color: colors.danger }]}>{error}</Text> : null}
      <View style={styles.row}>
        {circles?.length ? <Button small label={t('library.studyBegin')} busy={busy} disabled={busy || !prompt.trim() || !circleId} onPress={start} /> : null}
        <Button small variant="ghost" label={t('common.cancel')} onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

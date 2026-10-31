// Highlights and notes on library passages (docs/LIBRARY_SEARCH.md): a colour, a note, or both, on any passage in
// any collection. Private by default; a note can be shared with one of the member's circles. Off unless an admin
// turns it on under Admin → Bible Reference Text Search.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Field } from '@/components/ui';
import { api, type LibraryCollectionId, type LibraryNote, type NoteColor } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export const NOTE_COLORS: NoteColor[] = ['yellow', 'green', 'blue', 'pink'];
/** Soft fills, each at least 4.5:1 under the body text colour. */
export const noteFill: Record<NoteColor, string> = { yellow: '#FFF3B0', green: '#DDF2D8', blue: '#DCEBFA', pink: '#FBE0EA' };

/** The member's marks, by passage, and the circles a note can be shared with. */
export function useLibraryNotes() {
  const features = useFeatures();
  const [marks, setMarks] = useState<Record<string, LibraryNote>>({});
  const [circles, setCircles] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!features.libraryNotes) return;
    api.libraryNotes().then((r) => setMarks(Object.fromEntries(r.notes.map((n) => [n.key, n]))), () => undefined);
    if (features.prayerCircles) api.myCircles().then((r) => setCircles(r.circles.map((c) => ({ id: c.id, name: c.name }))), () => undefined);
  }, [features.libraryNotes, features.prayerCircles]);
  const saved = useCallback((key: string, note: LibraryNote | null) => {
    setMarks((m) => {
      const next = { ...m };
      if (note) next[key] = note;
      else delete next[key];
      return next;
    });
  }, []);
  return { enabled: features.libraryNotes, marks, circles, saved };
}

/** The mark on one passage, and the editor for it. */
export function PassageMark({
  collection,
  passageKey,
  citation,
  mark,
  circles,
  onSaved,
}: {
  collection: LibraryCollectionId;
  passageKey: string;
  citation: string;
  mark: LibraryNote | undefined;
  circles: { id: string; name: string }[];
  onSaved: (key: string, note: LibraryNote | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState<NoteColor | null>(mark?.color ?? null);
  const [note, setNote] = useState(mark?.note ?? '');
  const [circleId, setCircleId] = useState<string | null>(mark?.circle?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setColor(mark?.color ?? null);
    setNote(mark?.note ?? '');
    setCircleId(mark?.circle?.id ?? null);
    setError(null);
    setOpen(true);
  };
  const save = (clear = false) => {
    setBusy(true);
    setError(null);
    return api
      .saveLibraryNote(clear ? { collection, key: passageKey, color: null, note: null } : { collection, key: passageKey, color, note: note.trim() || null, circleId: note.trim() ? circleId : null })
      .then(
        (r) => {
          onSaved(passageKey, r.note);
          setOpen(false);
        },
        (e) => setError((e as Error).message),
      )
      .finally(() => setBusy(false));
  };

  if (!open) {
    return (
      <View style={styles.gap}>
        {mark?.note ? (
          <View style={[styles.note, mark.color ? { backgroundColor: noteFill[mark.color] } : null]}>
            <Text style={type.small}>{mark.circle ? t('library.noteSharedWith', { circle: mark.circle.name }) : t('library.notePrivate')}</Text>
            <Text style={type.body}>{mark.note}</Text>
          </View>
        ) : null}
        <Button small variant="ghost" label={mark ? t('library.noteEdit') : t('library.noteAdd')} a11yLabel={t(mark ? 'library.noteEditOne' : 'library.noteAddOne', { citation })} onPress={start} />
      </View>
    );
  }
  return (
    <View style={[styles.gap, styles.editor]}>
      <Text style={type.small}>{t('library.noteColor')}</Text>
      <View style={styles.row} role="radiogroup">
        <Chip radio label={t('library.noteColorNone')} selected={color === null} onPress={() => setColor(null)} />
        {NOTE_COLORS.map((c) => (
          <Chip key={c} radio label={t(`library.noteColors.${c}`)} selected={color === c} onPress={() => setColor(c)} />
        ))}
      </View>
      <Field label={t('library.noteLabel')} value={note} onChangeText={setNote} maxLength={2000} multiline />
      {note.trim() && circles.length ? (
        <>
          <Text style={type.small}>{t('library.noteWho')}</Text>
          <View style={styles.row} role="radiogroup">
            <Chip radio label={t('library.noteOnlyMe')} selected={circleId === null} onPress={() => setCircleId(null)} />
            {circles.map((c) => (
              <Chip key={c.id} radio label={c.name} selected={circleId === c.id} onPress={() => setCircleId(c.id)} />
            ))}
          </View>
        </>
      ) : null}
      {error ? <Text style={[type.small, { color: colors.danger }]}>{error}</Text> : null}
      <View style={styles.row}>
        <Button small label={t('library.noteSave')} busy={busy} disabled={busy} onPress={() => save()} />
        {mark ? <Button small variant="secondary" label={t('library.noteRemove')} disabled={busy} onPress={() => save(true)} /> : null}
        <Button small variant="ghost" label={t('common.cancel')} disabled={busy} onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  editor: { paddingTop: space.xs },
  note: { gap: space.xs, padding: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
});

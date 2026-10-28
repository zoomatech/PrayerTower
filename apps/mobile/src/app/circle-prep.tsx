// Prepare for a restorative circle: an AI asks the IIRP restorative questions one
// at a time. Nothing is saved unless the member sends a summary to a moderator.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AiThread } from '@/components/ai-thread';
import { CrisisSupport } from '@/components/crisis';
import { Button, Chip, ErrorText, Field, Screen } from '@/components/ui';
import { api, type AiTurn, type CircleRole } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

const ROLES: CircleRole[] = ['harmed', 'caused', 'unsure'];

/** The AI ends with a line starting "Summary:"; that becomes the draft the member can edit. */
const summaryFrom = (text: string) => /(?:^|\n)Summary:\s*([\s\S]+?)(?:\n\n|$)/.exec(text)?.[1]?.trim() ?? null;

export default function CirclePrep() {
  const { t } = useLocale();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.facilitatorInfo>> | null>(null);
  const [role, setRole] = useState<CircleRole | null>(null);
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [summary, setSummary] = useState('');
  const [aiOn, setAiOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [crisis, setCrisis] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.facilitatorInfo().then(setInfo).catch((e) => setError((e as Error).message));
    }, []),
  );

  const choose = (r: CircleRole) => {
    setRole(r);
    // The first question comes from the card itself, so the member can begin answering.
    setTurns(info ? [{ role: 'assistant', content: info.questions[r][0]! }] : []);
  };

  const send = async () => {
    const message = draft.trim();
    if (!message || !role) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.facilitate(role, message, turns);
      setAiOn(r.ai);
      setTurns((prev) => [...prev, { role: 'user', content: message }, { role: 'assistant', content: r.reply }]);
      const s = summaryFrom(r.reply);
      if (s) setSummary(s);
      if (r.crisis) setCrisis(true);
      setDraft('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    if (!role || !summary.trim()) return;
    try {
      await api.askForCircle(role, summary.trim());
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
        <Text style={type.title}>{t('ai.facTitle')}</Text>
        <Text style={type.body}>{t('ai.facIntro')}</Text>
        {!aiOn ? <Text style={type.small}>{t('ai.facNoAi')}</Text> : null}
        {info?.enabled ? (
          <>
            <Text style={type.heading}>{t('ai.facRole')}</Text>
            <View style={styles.row}>
              {ROLES.map((r) => (
                <Chip key={r} radio label={t(`ai.role.${r}`)} selected={role === r} onPress={() => choose(r)} />
              ))}
            </View>
          </>
        ) : null}
        {crisis ? <CrisisSupport /> : null}
        <AiThread turns={turns} you={t('ai.you')} ai="AI" />
        {busy ? <Text style={type.small}>{t('ai.writing')}</Text> : null}
        <ErrorText error={error} />
        {role && !sent ? (
          <>
            <Field placeholder={t('ai.answer')} value={draft} onChangeText={setDraft} multiline maxLength={2000} />
            <Button label={t('ai.send')} onPress={send} busy={busy} disabled={!draft.trim()} />
            <Field label={t('ai.summary')} value={summary} onChangeText={setSummary} multiline maxLength={2000} />
            <Button variant="secondary" label={t('ai.askCircle')} onPress={ask} disabled={!summary.trim()} />
            <Button small variant="ghost" label={t('ai.startOver')} onPress={() => { setRole(null); setTurns([]); setSummary(''); }} />
          </>
        ) : null}
        {sent ? <Text style={type.body}>{t('ai.asked')}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 80 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

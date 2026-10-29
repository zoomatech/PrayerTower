// Me → Conversation helpers (docs/CONVERSATION_HELPERS.md): the member's own choices
// for each helper an admin has switched on.
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useConversationPrefs } from '@/components/reply-helpers';
import { Button, Chip, Toggle } from '@/components/ui';
import { api, type ConversationPrefs } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { PACKS, type Pack } from '@/lib/talk';
import { colors, radius, space, type } from '@/lib/theme';

export function ConversationPrefsCard() {
  const f = useFeatures();
  const t = useT();
  const [prefs, setPrefs] = useConversationPrefs();
  const any = f.replySuggestions || f.troubleNudge || f.kindClosings || f.greetingPacks || f.talkCounts || (f.meaningPrefs && f.meaningReactions);
  if (!any || !prefs) return null;
  const save = (patch: Partial<ConversationPrefs>) =>
    api
      .updateConversationPrefs(patch)
      .then((r) => setPrefs(r.prefs))
      .catch(() => undefined);
  return (
    <View style={styles.card} testID="conversation-prefs">
      <Text style={type.heading}>{t('talk.prefsTitle')}</Text>
      <Text style={type.small}>{t('talk.prefsIntro')}</Text>
      {f.replySuggestions ? <Toggle label={t('talk.prefSuggestions')} hint={t('talk.prefSuggestionsHint')} value={prefs.replySuggestions} onChange={(v) => save({ replySuggestions: v })} /> : null}
      {f.troubleNudge ? <Toggle label={t('talk.prefCare')} hint={t('talk.prefCareHint')} value={prefs.troubleNudge} onChange={(v) => save({ troubleNudge: v })} /> : null}
      {f.kindClosings ? <Toggle label={t('talk.prefClosings')} hint={t('talk.prefClosingsHint')} value={prefs.kindClosings} onChange={(v) => save({ kindClosings: v })} /> : null}
      {f.talkCounts ? <Toggle label={t('talk.prefShareCounts')} hint={t('talk.prefShareCountsHint')} value={prefs.shareCounts} onChange={(v) => save({ shareCounts: v })} /> : null}
      {f.greetingPacks ? (
        <>
          <Text style={type.small}>{t('talk.prefPack')}</Text>
          <View style={styles.row} role="radiogroup">
            <Chip radio label={t('talk.prefPackNone')} selected={prefs.greetingPack === null} onPress={() => save({ greetingPack: null })} />
            {PACKS.map((p: Pack) => (
              <Chip key={p} radio label={t(`talk.packs.${p}.name`)} selected={prefs.greetingPack === p} onPress={() => save({ greetingPack: p })} />
            ))}
          </View>
        </>
      ) : null}
      {f.meaningPrefs && f.meaningReactions ? <Button small variant="secondary" label={t('talk.meaningWords')} onPress={() => router.push('/meaning-words')} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

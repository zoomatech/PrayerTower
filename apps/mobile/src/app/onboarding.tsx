import { PRAY_FOR_SCOPE, WHY_HERE, WHY_HERE_LABELS } from '@prayer-tower/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Screen, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

// Stored as these English words; only the labels are translated.
const SUPPORT = ['Health', 'Family', 'Grief', 'Provision', 'Guidance', 'Addiction', 'Faith', 'Relationships'];

function toggle<T>(list: T[], item: T) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export default function Onboarding() {
  const { profile, refreshProfile } = useAuth();
  const { t, label } = useLocale();
  const [whyHere, setWhyHere] = useState<string[]>(profile?.why_here ?? []);
  const [wanted, setWanted] = useState<string[]>(profile?.support_wanted ?? []);
  const [offered, setOffered] = useState<string[]>(profile?.support_offered ?? []);
  const [scope, setScope] = useState<string[]>(profile?.pray_for_scope ?? []);
  const [traumaOptOut, setTraumaOptOut] = useState(profile?.trauma_content_opt_out ?? false);
  const [anonymous, setAnonymous] = useState(profile?.anonymous_by_default ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.updateMe({
        whyHere,
        supportWanted: wanted,
        supportOffered: offered,
        prayForScope: scope,
        traumaContentOptOut: traumaOptOut,
        anonymousByDefault: anonymous,
        completeOnboarding: true,
      });
      await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={type.title}>{profile?.display_name ? t('onboarding.welcomeName', { name: profile.display_name }) : t('onboarding.welcome')}</Text>
        <Text style={type.body}>{t('onboarding.intro')}</Text>

        <Section title={t('onboarding.whyHere')}>
          {WHY_HERE.map((w) => (
            <Chip key={w} label={label('whyHere', w, WHY_HERE_LABELS[w])} selected={whyHere.includes(w)} onPress={() => setWhyHere(toggle(whyHere, w))} />
          ))}
        </Section>
        <Section title={t('onboarding.supportWanted')}>
          {SUPPORT.map((s) => (
            <Chip key={s} label={t(`onboarding.support.${s}`)} selected={wanted.includes(s)} onPress={() => setWanted(toggle(wanted, s))} />
          ))}
        </Section>
        <Section title={t('onboarding.supportOffered')}>
          {SUPPORT.map((s) => (
            <Chip key={s} label={t(`onboarding.support.${s}`)} selected={offered.includes(s)} onPress={() => setOffered(toggle(offered, s))} />
          ))}
        </Section>
        <Section title={t('onboarding.scope')}>
          {PRAY_FOR_SCOPE.map((s) => (
            <Chip key={s} label={t(`onboarding.scopes.${s}`)} selected={scope.includes(s)} onPress={() => setScope(toggle(scope, s))} />
          ))}
        </Section>

        <Toggle
          label={t('settings.traumaOptOut')}
          hint={t('settings.traumaOptOutHint')}
          value={traumaOptOut}
          onChange={setTraumaOptOut}
        />
        <Toggle
          label={t('settings.anonymous')}
          hint={t('settings.anonymousHint')}
          value={anonymous}
          onChange={setAnonymous}
        />
        <ErrorText error={error} />
        <Button label={t('onboarding.start')} onPress={save} busy={busy} />
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={type.heading}>{title}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.xl, paddingBottom: 80 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

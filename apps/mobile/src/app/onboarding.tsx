import { PRAY_FOR_SCOPE, WHY_HERE, WHY_HERE_LABELS } from '@prayer-tower/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Screen, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { space, type } from '@/lib/theme';

const SUPPORT = ['Health', 'Family', 'Grief', 'Provision', 'Guidance', 'Addiction', 'Faith', 'Relationships'];
const SCOPE_LABELS: Record<(typeof PRAY_FOR_SCOPE)[number], string> = {
  family: 'My family',
  friends: 'Friends',
  church: 'My church',
  community: 'My community',
  nation: 'My nation',
  world: 'The world',
};

function toggle<T>(list: T[], item: T) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export default function Onboarding() {
  const { profile, refreshProfile } = useAuth();
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
        <Text style={type.title}>Welcome{profile?.display_name ? `, ${profile.display_name}` : ''}</Text>
        <Text style={type.body}>A few questions so your prayers and requests fit you. You can change these any time.</Text>

        <Section title="Why are you here?">
          {WHY_HERE.map((w) => (
            <Chip key={w} label={WHY_HERE_LABELS[w]} selected={whyHere.includes(w)} onPress={() => setWhyHere(toggle(whyHere, w))} />
          ))}
        </Section>
        <Section title="What prayer support would you like?">
          {SUPPORT.map((s) => (
            <Chip key={s} label={s} selected={wanted.includes(s)} onPress={() => setWanted(toggle(wanted, s))} />
          ))}
        </Section>
        <Section title="What can you pray for others about?">
          {SUPPORT.map((s) => (
            <Chip key={s} label={s} selected={offered.includes(s)} onPress={() => setOffered(toggle(offered, s))} />
          ))}
        </Section>
        <Section title="Who will you pray for?">
          {PRAY_FOR_SCOPE.map((s) => (
            <Chip key={s} label={SCOPE_LABELS[s]} selected={scope.includes(s)} onPress={() => setScope(toggle(scope, s))} />
          ))}
        </Section>

        <Toggle
          label="Hide graphic or trauma-related requests"
          hint="Posts marked sensitive will not appear in your feed."
          value={traumaOptOut}
          onChange={setTraumaOptOut}
        />
        <Toggle
          label="Pray and post anonymously by default"
          hint="Others see “Anonymous.” Your prayers still count toward your tier, privately."
          value={anonymous}
          onChange={setAnonymous}
        />
        <ErrorText error={error} />
        <Button label="Start praying" onPress={save} busy={busy} />
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

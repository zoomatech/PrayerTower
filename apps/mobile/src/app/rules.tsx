// Community rules, from Steve's policy notes (Donor Influence page, chat 10).
// Pilot draft; the full terms and privacy policy drafts are in docs/legal/ (lawyer review pending).
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { LegalLinks } from '@/components/legal-links';
import { Button, Screen } from '@/components/ui';
import { colors, radius, space, type } from '@/lib/theme';

const RULES: { title: string; body: string }[] = [
  {
    title: 'We do not judge',
    body: 'Bring any need, in any state. Desperate prayers, small prayers and prayers you are not sure how to say are all welcome here.',
  },
  {
    title: 'Pray for good, never for harm',
    body: '“Keep my son safe” and “Let this war end” are prayers. Prayers that call for harm to anyone, such as “I pray we kill them all,” are forbidden and will be removed.',
  },
  {
    title: 'No flooding for a side',
    body: 'Tokens can help a request reach more people, but no one may flood the feed to push one side of a conflict. Coordinated pile-ons are removed.',
  },
  {
    title: 'No harassment or abuse',
    body: 'Disagree in love. Insults, threats, mockery and pile-ons against anyone, in requests, comments or encouragements, are removed.',
  },
  {
    title: 'No details of suicide or self-harm methods',
    body: 'If you are struggling, please post: you will see a crisis line you can reach any time, and people will pray with you. Details of methods are removed to keep others safe, and you are welcome to post again without them.',
  },
  {
    title: 'No ads',
    body: 'Prayer Tower has no ads. A prayer request used to sell something or promote a business is an ad, and is penalized.',
  },
  {
    title: 'Anonymous is always allowed',
    body: 'You can post and pray anonymously. Others see “Anonymous”; your prayers still count toward your own record.',
  },
  {
    title: 'Tokens',
    body: 'Tokens pay for the infrastructure and extend a request’s reach. They never cash out, and a lack of tokens never stops a request from being seen.',
  },
  {
    title: 'How moderation works',
    body: 'Anyone can report a request or comment. Automated checks only flag content; they hide it right away only in the most severe cases, until a person reviews it. A human moderator decides every penalty: removing the post, forfeiting tokens, suspension or reversing token transfers. Every decision is logged, you are told which rule applied, and you can appeal once from your notices.',
  },
];

export default function Rules() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>Community rules</Text>
        {RULES.map((r) => (
          <View key={r.title} style={styles.rule}>
            <Text style={type.heading}>{r.title}</Text>
            <Text style={type.body}>{r.body}</Text>
          </View>
        ))}
        <Text style={type.body}>
          To report something, tap Report on the request, comment, message or event. To stop someone reaching you, open their profile and tap Block.
        </Text>
        <LegalLinks prefix="These rules are part of our" contact />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  rule: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.xs },
});

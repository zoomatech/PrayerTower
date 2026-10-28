// Admin → Announcements: post a banner (one line) or a notice (title and text)
// to every member, at the top of their feed until they dismiss it. Spanish text
// is optional; members using the app in Spanish see it when it is there.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { localized } from '@/components/announcements';
import { Button, Chip, Empty, ErrorText, Field, Screen } from '@/components/ui';
import { api, type Announcement } from '@/lib/api';
import { env } from '@/lib/env';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

type Listed = Announcement & { active: boolean; dismissals: number };

export default function Announcements() {
  const { t, language } = useLocale();
  const [items, setItems] = useState<Listed[]>([]);
  const [kind, setKind] = useState<'banner' | 'notice'>('banner');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [titleEs, setTitleEs] = useState('');
  const [bodyEs, setBodyEs] = useState('');
  const [hours, setHours] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api.admin.announcements()).announcements);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (fn: () => Promise<unknown>, done: string, after?: () => void) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      after?.();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Blank: stays up until an admin ends it.
  const duration = hours.trim() === '' ? null : /^\d+$/.test(hours.trim()) ? Number(hours.trim()) : NaN;
  const valid = title.trim().length > 0 && (duration === null || (duration >= 1 && duration <= 2160)) && (!bodyEs.trim() || titleEs.trim().length > 0);

  const post = () =>
    run(
      () =>
        api.admin.createAnnouncement({
          kind,
          title: title.trim(),
          body: kind === 'notice' ? body.trim() : '',
          titleEs: titleEs.trim() || undefined,
          bodyEs: kind === 'notice' ? bodyEs.trim() || undefined : undefined,
          durationHours: duration,
        }),
      t('announcementsAdmin.posted'),
      () => {
        setTitle('');
        setBody('');
        setTitleEs('');
        setBodyEs('');
        setHours('');
      },
    );

  const when = (iso: string) => new Date(iso).toLocaleString(language === 'es' ? 'es' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))} />
        <Text style={type.title}>{t('announcementsAdmin.title')}</Text>
        <Text style={type.body}>{t('announcementsAdmin.intro')}</Text>
        <ErrorText error={error} />
        {notice ? <Text style={type.small}>{notice}</Text> : null}

        <View style={styles.section}>
          <Text style={type.heading}>{t('announcementsAdmin.new')}</Text>
          <View style={styles.row}>
            <Chip label={t('announcementsAdmin.kind.banner')} selected={kind === 'banner'} onPress={() => setKind('banner')} />
            <Chip label={t('announcementsAdmin.kind.notice')} selected={kind === 'notice'} onPress={() => setKind('notice')} />
          </View>
          <Text style={type.small}>{t(`announcementsAdmin.kindHint.${kind}`)}</Text>
          <Field label={t('announcementsAdmin.titleEn')} value={title} onChangeText={setTitle} maxLength={120} />
          {kind === 'notice' ? <Field label={t('announcementsAdmin.bodyEn')} value={body} onChangeText={setBody} maxLength={1000} multiline /> : null}
          {env.spanish ? <Field label={t('announcementsAdmin.titleEs')} value={titleEs} onChangeText={setTitleEs} maxLength={120} /> : null}
          {env.spanish && kind === 'notice' ? <Field label={t('announcementsAdmin.bodyEs')} value={bodyEs} onChangeText={setBodyEs} maxLength={1000} multiline /> : null}
          <Field label={t('announcementsAdmin.hours')} value={hours} onChangeText={setHours} keyboardType="number-pad" placeholder={t('announcementsAdmin.untilEnded')} />
          {bodyEs.trim() && !titleEs.trim() ? <Text style={type.small}>{t('announcementsAdmin.needTitleEs')}</Text> : null}
          <Button label={t('announcementsAdmin.post')} onPress={post} busy={busy} disabled={!valid} />
        </View>

        <Text style={type.heading}>{t('announcementsAdmin.posts')}</Text>
        {items.length === 0 && !error ? <Empty text={t('announcementsAdmin.empty')} /> : null}
        {items.map((a) => {
          const shown = localized(a, language);
          return (
            <View key={a.id} style={styles.card}>
              <Text style={type.small}>
                {t(`announcementsAdmin.kind.${a.kind}`)} · {a.active ? t('announcementsAdmin.live') : t('announcementsAdmin.ended')} ·{' '}
                {t('announcementsAdmin.dismissals', { count: a.dismissals })}
              </Text>
              <Text style={styles.cardTitle}>{shown.title}</Text>
              {shown.body ? <Text style={type.body}>{shown.body}</Text> : null}
              <Text style={type.small}>
                {when(a.createdAt)}
                {a.endsAt ? ` · ${t(a.active ? 'announcementsAdmin.endsAt' : 'announcementsAdmin.endedAt', { date: when(a.endsAt) })}` : ''}
                {a.titleEs ? '' : ` · ${t('announcementsAdmin.englishOnly')}`}
              </Text>
              {a.active ? (
                <Button small variant="ghost" label={t('announcementsAdmin.end', { title: a.title })} onPress={() => run(() => api.admin.endAnnouncement(a.id), t('announcementsAdmin.endedNotice'))} />
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  section: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 4 },
  cardTitle: { ...type.body, fontWeight: '700' },
});

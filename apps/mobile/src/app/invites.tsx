// Admin → Invites: while the pilot is invite-only (the default), new members
// need a code to create an account. Admins turn the mode on or off, create
// codes (one or many, single- or multi-use) and revoke them. docs/INVITES.md.
import * as Linking from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Empty, ErrorText, Field, Screen, Toggle } from '@/components/ui';
import { api, type Invite } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const whole = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : NaN);

export default function Invites() {
  const { t, language } = useLocale();
  const [inviteOnly, setInviteOnly] = useState<boolean | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [note, setNote] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [days, setDays] = useState('30');
  const [count, setCount] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The code being emailed, and the form for it.
  const [emailing, setEmailing] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [emailLang, setEmailLang] = useState<'en' | 'es'>(language === 'es' ? 'es' : 'en');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.admin.invites();
      setInviteOnly(r.inviteOnly);
      setInvites(r.invites);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const uses = whole(maxUses);
  const n = whole(count);
  // Blank means the codes never expire.
  const expires = days.trim() === '' ? null : whole(days);
  const valid = uses >= 1 && uses <= 1000 && n >= 1 && n <= 50 && (expires === null || (expires >= 1 && expires <= 365));

  const create = () =>
    run(
      () => api.admin.createInvites({ note: note.trim(), maxUses: uses, expiresInDays: expires, count: n }),
      t('invites.created', { count: n }),
    ).then(() => setNote(''));

  const share = (code: string) =>
    Share.share({ message: t('invites.shareMessage', { code, url: Linking.createURL('/sign-in', { queryParams: { invite: code } }) }) }).catch(() => undefined);

  const sendEmail = (code: string) => {
    const email = to.trim();
    return run(async () => {
      try {
        await api.admin.emailInvite(code, { email, language: emailLang, ...(message.trim() ? { message: message.trim() } : {}) });
      } catch (e) {
        throw /email_off|503/.test((e as Error).message) ? new Error(t('invites.emailOff')) : e;
      }
    }, t('invites.sent', { email })).then(() => {
      setEmailing(null);
      setTo('');
      setMessage('');
    });
  };
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

  const date = (iso: string) => new Date(iso).toLocaleDateString(language === 'es' ? 'es' : 'en-US', { dateStyle: 'medium' });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))} />
        <Text style={type.title}>{t('invites.title')}</Text>
        <Text style={type.body}>{t('invites.intro')}</Text>
        <ErrorText error={error} />
        {notice ? <Text style={type.small}>{notice}</Text> : null}

        {inviteOnly !== null ? (
          <Toggle
            label={t('invites.inviteOnly')}
            hint={t('invites.inviteOnlyHint')}
            value={inviteOnly}
            onChange={(v) => run(() => api.admin.setInviteOnly(v), v ? t('invites.nowOn') : t('invites.nowOff'))}
          />
        ) : null}

        <Button variant="secondary" label={t('invites.import')} onPress={() => router.push('/import')} />

        <View style={styles.section}>
          <Text style={type.heading}>{t('invites.new')}</Text>
          <Field label={t('invites.note')} value={note} onChangeText={setNote} maxLength={200} placeholder={t('invites.notePlaceholder')} />
          <Field label={t('invites.maxUses')} value={maxUses} onChangeText={setMaxUses} keyboardType="number-pad" />
          <Field label={t('invites.expiresInDays')} value={days} onChangeText={setDays} keyboardType="number-pad" placeholder={t('invites.never')} />
          <Field label={t('invites.count')} value={count} onChangeText={setCount} keyboardType="number-pad" />
          {!valid ? <Text style={type.small}>{t('invites.limits')}</Text> : null}
          <Button label={t('invites.create')} onPress={create} busy={busy} disabled={!valid} />
        </View>

        <Text style={type.heading}>{t('invites.codes')}</Text>
        {invites.length === 0 && !error ? <Empty text={t('invites.empty')} /> : null}
        {invites.map((i) => (
          <View key={i.code} style={styles.card}>
            <Text style={styles.code} selectable>
              {i.code}
            </Text>
            {i.note ? <Text style={type.body}>{i.note}</Text> : null}
            <Text style={type.small}>
              {t(`invites.status.${i.status}`)} · {t('invites.used', { uses: i.uses, max: i.maxUses })}
              {i.expiresAt ? ` · ${t('invites.expires', { date: date(i.expiresAt) })}` : ''}
            </Text>
            {i.status === 'active' ? (
              <View style={styles.row}>
                <Button small variant="secondary" label={t('invites.share')} onPress={() => share(i.code)} />
                <Button small variant="secondary" label={t('invites.emailCode', { code: i.code })} onPress={() => setEmailing(emailing === i.code ? null : i.code)} />
                <Button
                  small
                  variant="ghost"
                  label={t('invites.revokeCode', { code: i.code })}
                  onPress={() => run(() => api.admin.revokeInvite(i.code), t('invites.revoked'))}
                />
              </View>
            ) : null}
            {i.status === 'active' && emailing === i.code ? (
              <View style={styles.section}>
                <Field label={t('invites.emailTo')} value={to} onChangeText={setTo} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
                <Text style={type.small}>{t('invites.emailLanguage')}</Text>
                <View style={styles.row}>
                  <Chip label="English" selected={emailLang === 'en'} onPress={() => setEmailLang('en')} />
                  <Chip label="Español" selected={emailLang === 'es'} onPress={() => setEmailLang('es')} />
                </View>
                <Field label={t('invites.emailMessage')} value={message} onChangeText={setMessage} maxLength={500} multiline />
                <Button label={t('invites.send')} onPress={() => sendEmail(i.code)} busy={busy} disabled={!emailValid} />
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  section: { gap: space.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 4 },
  code: { ...type.heading, fontFamily: 'monospace', letterSpacing: 2 },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});

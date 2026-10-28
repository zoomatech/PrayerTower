// Weekly email digest (off by default; members turn it on under Me): prayers
// answered this week on requests they prayed for, and how their promises went.
// Sent Sunday evening by the worker, once per member per ISO week.
import type { Task } from 'graphile-worker';
import type { Locale } from '@prayer-tower/shared';
import type { Queryable } from '../../db.js';
import { memberLang } from '../../language.js';
import { weeklyReview } from '../commitments/index.js';
import type { Mail, Mailer } from './mailer.js';

export interface Digest {
  name: string;
  answered: { body: string; mine: boolean }[];
  prayers: number;
  people: number;
  active: number;
  kept: number;
}

const short = (s: string) => (s.length > 140 ? `${s.slice(0, 137).trimEnd()}…` : s);

export async function buildDigest(q: Queryable, userId: string): Promise<Digest> {
  const { rows: who } = await q.query<{ display_name: string }>('select display_name from public.profiles where id = $1', [userId]);
  const { rows: answered } = await q.query<{ body: string; mine: boolean }>(
    `select p.body, p.user_id = $1 as mine from public.posts p
      where p.answered_at > now() - interval '7 days' and p.moderation_status = 'visible'
        and (p.user_id = $1
             or exists (select 1 from public.prayer_events e where e.post_id = p.id and e.user_id = $1)
             or exists (select 1 from public.commitments c where c.post_id = p.id and c.user_id = $1))
      order by p.answered_at desc limit 5`,
    [userId],
  );
  const r = await weeklyReview(q, userId);
  return {
    name: who[0]?.display_name ?? '',
    answered: answered.map((a) => ({ body: short(a.body), mine: a.mine })),
    prayers: r.prayers,
    people: r.people,
    active: r.active,
    kept: r.kept,
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const TEXT = {
  en: {
    subject: 'Your week in prayer',
    hello: (n: string) => (n ? `Dear ${n},` : 'Hello,'),
    answered: 'Prayers answered this week',
    mine: '(your request)',
    week: (d: Digest) =>
      d.prayers > 0
        ? `You prayed ${d.prayers} ${d.prayers === 1 ? 'time' : 'times'} for ${d.people} ${d.people === 1 ? 'request' : 'requests'}.`
        : 'There are people waiting for prayer whenever you are ready.',
    promises: (d: Digest) => (d.active > 0 ? `You kept ${d.kept} of your ${d.active} active promises to pray.` : ''),
    off: 'You get this email because you turned on the weekly email. Turn it off in the app under Me → Weekly email.',
  },
  es: {
    subject: 'Tu semana en oración',
    hello: (n: string) => (n ? `Querido(a) ${n}:` : 'Hola:'),
    answered: 'Oraciones respondidas esta semana',
    mine: '(tu petición)',
    week: (d: Digest) =>
      d.prayers > 0
        ? `Oraste ${d.prayers} ${d.prayers === 1 ? 'vez' : 'veces'} por ${d.people} ${d.people === 1 ? 'petición' : 'peticiones'}.`
        : 'Hay personas esperando oración cuando estés listo(a).',
    promises: (d: Digest) => (d.active > 0 ? `Cumpliste ${d.kept} de tus ${d.active} compromisos de oración activos.` : ''),
    off: 'Recibes este correo porque activaste el correo semanal. Desactívalo en la app en Yo → Correo semanal.',
  },
} satisfies Record<Locale, unknown>;

export function renderDigest(d: Digest, saved: Locale, to: string): Mail {
  const locale = memberLang(saved);
  const t = TEXT[locale] ?? TEXT.en;
  const lines = [t.hello(d.name), '', t.week(d), t.promises(d)].filter((l, i) => i < 2 || l);
  const answered = d.answered.map((a) => `• ${a.body}${a.mine ? ` ${t.mine}` : ''}`);
  const text = [...lines, ...(answered.length ? ['', t.answered, ...answered] : []), '', '—', t.off].join('\n');
  const html = `<!doctype html><html lang="${locale === 'es' ? 'es' : 'en'}"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#2a2438;max-width:560px">
<p>${esc(t.hello(d.name))}</p><p>${esc(t.week(d))}${t.promises(d) ? `<br>${esc(t.promises(d))}` : ''}</p>
${d.answered.length ? `<h3>${esc(t.answered)}</h3><ul>${d.answered.map((a) => `<li>${esc(a.body)}${a.mine ? ` <em>${esc(t.mine)}</em>` : ''}</li>`).join('')}</ul>` : ''}
<hr><p style="font-size:13px;color:#6b6478">${esc(t.off)}</p></body></html>`;
  return { to, subject: t.subject, text, html };
}

/** ISO week label, e.g. 2026-W44: one digest per member per week. */
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - start.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Sends the digest to every member who turned it on. Without a mailer it does nothing. */
export async function sendDigests(q: Queryable, mailer: Mailer | null, week = isoWeek()) {
  if (!mailer) return { sent: 0, skipped: 0 };
  const { rows } = await q.query<{ id: string; email: string; locale: Locale }>(
    `select p.id, u.email, p.locale from public.profiles p join auth.users u on u.id = p.id
      where p.digest_enabled and p.deleted_at is null and u.email is not null
        and (p.digest_sent_week is distinct from $1)
        and (p.suspended_until is null or p.suspended_until < now())`,
    [week],
  );
  let sent = 0;
  let skipped = 0;
  for (const m of rows) {
    const d = await buildDigest(q, m.id);
    // Nothing to say this week: no email.
    if (d.prayers === 0 && d.active === 0 && d.answered.length === 0) {
      skipped++;
      continue;
    }
    await mailer(renderDigest(d, m.locale, m.email));
    await q.query('update public.profiles set digest_sent_week = $2 where id = $1', [m.id, week]);
    sent++;
  }
  return { sent, skipped };
}

export function weeklyDigestTask(q: Queryable, mailer: Mailer | null): Task {
  return async (_payload, helpers) => {
    const r = await sendDigests(q, mailer);
    helpers.logger.info(mailer ? `weekly digest: ${r.sent} sent, ${r.skipped} with nothing to say` : 'weekly digest: SMTP_URL not set, skipped');
  };
}

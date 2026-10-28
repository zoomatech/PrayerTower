// Notification text in the member's language (profiles.locale). Call sites keep
// writing English title/body, and add `t: { key, params }`; notify() swaps in the
// translation when the recipient reads another language and the key exists here.
// Spanish drafted 2026-10-28; have a native speaker review before release.

import { memberLang } from '../../language.js';

export type Params = Record<string, string | number | boolean | null | undefined>;
type Template = (p: Params) => { title: string; body: string };

const s = (v: Params[string], fallback = '') => (v === null || v === undefined || v === '' ? fallback : String(v));

const ES_NOUN: Record<string, string> = { post: 'petición', comment: 'comentario', reaction: 'ánimo', message: 'mensaje', event: 'evento', spoken_prayer: 'oración hablada' };
const ES_RULES: Record<string, string> = {
  harm: 'Ora por el bien, nunca por el mal',
  flooding: 'No inundar a favor de un bando',
  ads: 'Sin anuncios',
  abuse: 'Sin acoso ni abuso',
  safe_messaging: 'Sin detalles de métodos de suicidio o autolesión',
  other: 'Normas de la comunidad',
};
const ES_FREQUENCY: Record<string, string> = { weekly: 'cada semana', daily: 'cada día', three_daily: 'tres veces al día' };

const es: Record<string, Template> = {
  praying_now: (p) => ({
    title: `${s(p.who, 'Alguien')} está orando por ti${p.poster ? `, ${p.poster},` : ''} ahora mismo`,
    body: 'Alguien se detuvo a presentar tu petición ante el Señor.',
  }),
  encouragement: (p) => ({ title: `${s(p.who, 'Alguien')} te envió ánimo`, body: s(p.body) }),
  thanks: (p) => ({ title: 'Gracias por orar', body: s(p.body, 'Alguien por quien oraste te envió su agradecimiento.') }),
  pray_request: (p) => ({ title: `${s(p.who, 'Alguien')} quisiera que ores por esto`, body: s(p.body) }),
  commitment_made: (p) => ({
    title: `${s(p.who, 'Alguien')} se comprometió a orar por ti`,
    body: `${s(p.who, 'Alguien')} orará ${ES_FREQUENCY[s(p.frequency)] ?? ''}.`,
  }),
  commitment_reminder: (p) => ({ title: 'Hora de orar', body: `Prometiste orar: "${s(p.excerpt)}"` }),
  power_prayer: (p) => ({ title: '¿Orarías por esta petición?', body: s(p.body) }),
  moderation_removed: (p) => {
    const noun = ES_NOUN[s(p.target)] ?? 'publicación';
    const body =
      p.rule === 'safe_messaging'
        ? `Quitamos tu ${noun} porque describía formas de autolesión, lo cual puede poner a otros en riesgo. Tu oración importa y puedes publicarla de nuevo sin esos detalles. Si estás pasando por un momento difícil: ${s(p.reach)}.`
        : `Quitamos tu ${noun} porque no cumplía una norma de la comunidad: ${ES_RULES[s(p.rule)] ?? ES_RULES.other}.` +
          (p.until ? ` Tu cuenta no puede publicar hasta el ${s(p.until)}.` : '') +
          ' Si crees que nos equivocamos, puedes apelar.';
    return { title: `Quitamos tu ${noun}`, body };
  },
  appeal_decision: (p) => {
    const noun = ES_NOUN[s(p.target)] ?? 'publicación';
    return p.overturned
      ? { title: 'Aceptamos tu apelación', body: `Un moderador lo revisó de nuevo y restauró tu ${noun}. Gracias por tu paciencia.` }
      : { title: 'Revisamos tu apelación', body: `Un moderador lo revisó de nuevo y la decisión se mantiene.${p.note ? ` ${s(p.note)}` : ''}` };
  },
  event_new: (p) => ({ title: 'Nuevo evento en tu grupo', body: s(p.body) }),
  event_cancelled: (p) => ({ title: 'Se canceló un evento', body: `${s(p.title)} no se realizará como estaba previsto.` }),
  event_reminder: (p) => ({ title: 'Comienza pronto', body: `${s(p.title)} comienza pronto. Toca para unirte.` }),
  milestone: (p) => {
    const n = Number(p.amount ?? 0);
    const kind = p.priestly ? (n === 1 ? ' sacerdotal' : ' sacerdotales') : '';
    return {
      title: `Logro: ${s(p.label)}`,
      body: `Recibiste ${n} ${n === 1 ? 'ficha' : 'fichas'} de bonificación${kind}. Gracias por orar.`,
    };
  },
  care_request: (p) => ({
    title: p.crisis ? 'Alguien podría estar en peligro y pidió oración' : p.confession ? 'Alguien pidió hacer una confesión' : 'Alguien pidió un compañero de oración',
    body: 'Abre la cola de cuidado para comunicarte.',
  }),
  care_claimed: (p) => ({ title: `${s(p.who, 'Un compañero de oración')} está aquí para orar contigo`, body: 'Abre la conversación para hablar y orar juntos.' }),
  group_invite: (p) => ({ title: 'Te invitaron a un grupo', body: `Únete a "${s(p.title)}" para orar y conversar juntos.` }),
  message: (p) => ({
    title: p.prayer ? `${s(p.who)} oró por ti y te envió un mensaje` : `Nuevo mensaje de ${s(p.who)}`,
    body: s(p.body),
  }),
  radio_prayer: () => ({
    title: 'Tu petición salió como oración por radio',
    body: 'Alguien la envió para que más personas puedan orar contigo.',
  }),
  radio_not_sent: (p) => ({
    title: 'Una oración por radio que enviaste no salió',
    body: p.refunded ? 'Tu ficha sacerdotal volvió a tu saldo.' : 'Todavía puedes orar por la petición.',
  }),
  scheduled_spend_failed: (p) => ({ title: 'Un regalo programado no se envió', body: s(p.body) }),
  weekly_review: (p) => ({ title: 'Tu semana en oración', body: s(p.body) }),
  answered: (p) => ({ title: 'Una oración que hiciste fue contestada', body: `${s(p.who, 'Alguien')} marcó su petición como contestada. Gracias por orar.` }),
  award: (p) => ({ title: `Eres Guerrero de Oración ${s(p.year)}`, body: `Oraste por otros ${s(p.count)} veces este año. Abre Yo para aceptar el premio.` }),
  spoken_prayer: (p) => ({ title: `${s(p.who, 'Alguien')} grabó una oración por ti`, body: 'Abre tu petición para escucharla.' }),
  witness_story: () => ({ title: '¿Podemos contar cómo recibiste ayuda?', body: 'El equipo de Testigos escribió una breve historia sobre la ayuda que recibiste. No se comparte nada a menos que digas que sí, y nunca muestra tu nombre.' }),
  testimony: (p) => ({ title: 'Una oración que hiciste fue contestada', body: `${s(p.who, 'Alguien')} contó lo que Dios hizo: "${s(p.excerpt)}"` }),
  church_verified: (p) => ({
    title: `${s(p.church, 'Tu iglesia')} está verificada`,
    body: 'Tu insignia de pastor ahora aparece en las peticiones que publicas con tu nombre. Gracias por pastorear con nosotros.',
  }),
  church_declined: (p) => ({ title: `Aún no pudimos verificar ${s(p.church, 'tu iglesia')}`, body: s(p.note) }),
  church_revoked: (p) => ({ title: `${s(p.church, 'Tu iglesia')} ya no está verificada`, body: s(p.note) }),
  crisis_flag: () => ({
    title: 'Alguien podría estar en peligro',
    body: 'Una publicación o un mensaje menciona el suicidio o la autolesión. Abre la cola de moderación; está arriba de todo.',
  }),
  job_alert: (p) => ({
    title: 'Hay tareas en segundo plano que fallan',
    body: `${p.count ? `${s(p.count, '1')} ${p.count === 1 ? 'tarea agotó' : 'tareas agotaron'} sus intentos. ` : ''}Fallan: ${s(p.tasks)}. Abre Administración → Tareas en segundo plano para reintentar o descartar.`,
  }),
  ledger_alert: (p) => ({
    title: 'La revisión del registro de fichas encontró un problema',
    body: `${s(p.count, '1')} ${p.count === 1 ? 'problema' : 'problemas'} en el registro de fichas. Abre Administración → Fichas para ver los detalles.`,
  }),
};

// Open Circle, the non-religious community (migration 20261029002200): the same
// notices in plain, warm English with no religious words. Keys left out here
// (moderation, events, admin alerts) are already neutral and keep their text.
const FREQUENCY: Record<string, string> = { weekly: 'every week', daily: 'every day', three_daily: 'three times a day' };
const neutral: Record<string, Template> = {
  praying_now: (p) => ({
    title: `${s(p.who, 'Someone')} is thinking of you${p.poster ? `, ${p.poster},` : ''} right now`,
    body: 'Someone stopped what they were doing to hold your request in their thoughts.',
  }),
  thanks: (p) => ({ title: 'Thank you for being there', body: s(p.body, 'Someone you supported sent thanks.') }),
  pray_request: (p) => ({ title: `${s(p.who, 'Someone')} would like your support on this`, body: s(p.body) }),
  commitment_made: (p) => ({ title: `${s(p.who, 'Someone')} promised to support you`, body: `${s(p.who, 'Someone')} will check in ${FREQUENCY[s(p.frequency)] ?? 'regularly'}.` }),
  commitment_reminder: (p) => ({ title: 'Time to check in', body: `You promised to keep someone in mind: "${s(p.excerpt)}"` }),
  power_prayer: (p) => ({ title: 'Will you send support to this request?', body: s(p.body) }),
  answered: (p) => ({ title: 'Good news on a request you supported', body: `${s(p.who, 'Someone')} says things worked out. Thank you for being there.` }),
  testimony: (p) => ({ title: 'Good news on a request you supported', body: `${s(p.who, 'Someone')} shared what happened: "${s(p.excerpt)}"` }),
  weekly_review: (p) => ({ title: 'Your week of kindness', body: s(p.body) }),
  milestone: (p) => {
    const n = Number(p.amount ?? 0);
    return { title: `Milestone: ${s(p.label)}`, body: `You received ${n} bonus ${p.priestly ? 'Lighthouse ' : ''}token${n === 1 ? '' : 's'}. Thank you for showing up for people.` };
  },
  care_request: (p) => ({ title: p.crisis ? 'Someone may be in danger and asked for support' : 'Someone asked for a listening partner', body: 'Open the care queue to reach out.' }),
  care_claimed: (p) => ({ title: `${s(p.who, 'A listening partner')} is here for you`, body: 'Open the conversation to talk.' }),
  group_invite: (p) => ({ title: 'You were invited to a group', body: `Join "${s(p.title)}" to cheer each other on.` }),
  message: (p) => ({ title: p.prayer ? `${s(p.who)} thought of you and sent a message` : `New message from ${s(p.who)}`, body: s(p.body) }),
  radio_prayer: () => ({ title: 'Your request went out by radio', body: 'Someone sent your words out on the air so more people could cheer you on.' }),
  radio_not_sent: (p) => ({ title: "A radio message you sent didn't go out", body: p.refunded ? 'Your Lighthouse token is back in your balance.' : 'You can still support the request.' }),
  award: (p) => ({ title: `You are a ${s(p.year)} Kindness Champion`, body: `You supported others ${s(p.count)} times this year. Open Me to accept the award.` }),
  spoken_prayer: (p) => ({ title: `${s(p.who, 'Someone')} recorded a message for you`, body: 'Open your request to listen.' }),
  witness_story: () => ({
    title: 'May we share how you were helped?',
    body: 'The Helpers team wrote a short story about the help you received. Nothing is shared unless you say yes, and it never shows your name.',
  }),
};

const catalogs: Record<string, Record<string, Template>> = { es };

/** The Open Circle wording for this notice, or null to keep the English text. */
export function neutralize(key: string, params: Params = {}) {
  const template = neutral[key];
  return template ? template(params) : null;
}

/** The notification in `locale`, or null to keep the English text. */
export function localize(locale: string | null | undefined, key: string, params: Params = {}) {
  const lang = memberLang(locale);
  const template = lang !== 'en' ? catalogs[lang]?.[key] : undefined;
  return template ? template(params) : null;
}

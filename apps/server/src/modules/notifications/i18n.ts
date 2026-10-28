// Notification text in the member's language (profiles.locale). Call sites keep
// writing English title/body, and add `t: { key, params }`; notify() swaps in the
// translation when the recipient reads another language and the key exists here.
// Spanish drafted 2026-10-28; have a native speaker review before release.

export type Params = Record<string, string | number | boolean | null | undefined>;
type Template = (p: Params) => { title: string; body: string };

const s = (v: Params[string], fallback = '') => (v === null || v === undefined || v === '' ? fallback : String(v));

const ES_NOUN: Record<string, string> = { post: 'petición', comment: 'comentario', reaction: 'ánimo', message: 'mensaje', event: 'evento' };
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
    title: p.crisis ? 'Alguien podría estar en peligro y pidió oración' : 'Alguien pidió un compañero de oración',
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
  scheduled_spend_failed: (p) => ({ title: 'Un regalo programado no se envió', body: s(p.body) }),
  weekly_review: (p) => ({ title: 'Tu semana en oración', body: s(p.body) }),
  church_verified: (p) => ({
    title: `${s(p.church, 'Tu iglesia')} está verificada`,
    body: 'Tu insignia de pastor ahora aparece en las peticiones que publicas con tu nombre. Gracias por pastorear con nosotros.',
  }),
  church_declined: (p) => ({ title: `Aún no pudimos verificar ${s(p.church, 'tu iglesia')}`, body: s(p.note) }),
  church_revoked: (p) => ({ title: `${s(p.church, 'Tu iglesia')} ya no está verificada`, body: s(p.note) }),
};

const catalogs: Record<string, Record<string, Template>> = { es };

/** The notification in `locale`, or null to keep the English text. */
export function localize(locale: string | null | undefined, key: string, params: Params = {}) {
  const template = locale ? catalogs[locale]?.[key] : undefined;
  return template ? template(params) : null;
}

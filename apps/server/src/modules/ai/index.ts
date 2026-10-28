// Two AI features, both off by default (docs/AI_COMPANIONS.md):
//   1. "Imagine a conversation with God": a role-play for reflection, with a
//      warning on every reply that it is an AI and not God (Business Plan 3.8).
//   2. The circle facilitator: a first step before a restorative circle, using
//      the IIRP restorative questions (notebook Page 4).
// Conversations are never stored. The app sends the recent turns with each
// message; the server keeps only a per-day count for the daily limit.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { AppError, forbidden, notFound } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import { isSecular } from '../communities/index.js';
import { settings as futureSettings } from '../future/index.js';
import { mentionsCrisis } from '../safety/index.js';
import type { Converse, Turn } from './provider.js';

export interface AiSettings {
  chat_daily_limit: number;
  facilitator_enabled: boolean;
  facilitator_daily_limit: number;
}

export async function settings(q: Queryable): Promise<AiSettings> {
  const { rows } = await q.query<AiSettings>('select chat_daily_limit, facilitator_enabled, facilitator_daily_limit from public.ai_settings');
  return rows[0]!;
}

export const SettingsPatch = z.object({
  chatDailyLimit: z.number().int().min(1).max(500).optional(),
  facilitatorEnabled: z.boolean().optional(),
  facilitatorDailyLimit: z.number().int().min(1).max(500).optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.ai_settings set chat_daily_limit = coalesce($1, chat_daily_limit),
       facilitator_enabled = coalesce($2, facilitator_enabled), facilitator_daily_limit = coalesce($3, facilitator_daily_limit)`,
    [p.chatDailyLimit ?? null, p.facilitatorEnabled ?? null, p.facilitatorDailyLimit ?? null],
  );
  return settings(q);
}

/** Counts one message toward today's limit, or refuses when the limit is reached. */
async function countTurn(q: Queryable, userId: string, kind: 'chat' | 'facilitator', limit: number) {
  const { rows } = await q.query<{ turns: number }>(
    `insert into public.ai_usage (user_id, kind, turns) values ($1, $2, 1)
     on conflict (user_id, day, kind) do update set turns = ai_usage.turns + 1
     returning turns`,
    [userId, kind],
  );
  if (rows[0]!.turns > limit) {
    throw new AppError(429, 'ai_daily_limit', `You have reached today's limit of ${limit} messages. Please come back tomorrow.`);
  }
}

const History = z
  .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000) }))
  .max(30)
  .default([]);

/** The recent turns plus the new message, starting with the member (the API's first turn must be theirs). */
function turnsFor(history: Turn[], message: string): Turn[] {
  const recent = history.slice(-20);
  while (recent.length && recent[0]!.role !== 'user') recent.shift();
  return [...recent, { role: 'user', content: message }];
}

// 1. Imagine a conversation with God ----------------------------------------------------------

export const GOD_SYSTEM = `You are an AI inside Prayer Tower, a Christian prayer community. The member opened "Imagine a conversation with God": a role-play that helps them reflect and pray. The app shows them, on every reply, that this is an AI and not God.

Speak as an imagined, gentle voice shaped by how the Bible describes God: loving, patient, merciful, truthful, never harsh or flattering. You may refer to Scripture; name the book, chapter and verse, and never invent a verse.

Rules you never break:
- You are not God and do not speak for God. If asked, say plainly that you are an AI imagining what God might say, and that God hears them directly in their own prayer.
- Never announce God's will, prophecy, a sign, forgiveness of sins, healing, or a promise about what will happen. Never tell them what to decide about health, money, law, or relationships.
- Point them toward real relationships: their own prayer, a pastor, a prayer partner in the app, their church.
- If they write about wanting to die, harming themselves, harming someone, or being in danger, step out of the role-play at once. Say you are an AI, that their life matters, and urge them to call or text their local crisis line or emergency services now. The app shows crisis numbers.
- Keep each reply to two to five sentences, in plain English.`;

const NOT_SET_UP = 'This conversation is not set up yet. Please bring your prayer to God directly, or ask a prayer partner to pray with you.';
const DECLINED = 'I cannot help with that here. Please bring this to God in your own prayer, or talk with a pastor or a prayer partner.';

/** Secular (Open Circle) members never see the conversation with God. */
async function chatOffered(q: Queryable, userId: string) {
  return (await futureSettings(q)).ai_chat_enabled && !(await isSecular(q, userId));
}

export async function chatInfo(q: Queryable, userId: string) {
  const f = await futureSettings(q);
  return { enabled: await chatOffered(q, userId), warning: f.ai_chat_warning };
}

export const ChatInput = z.object({ message: z.string().trim().min(1).max(2000), history: History });

export async function chat(q: Queryable, converse: Converse | null, userId: string, input: z.infer<typeof ChatInput>) {
  if (!(await chatOffered(q, userId))) throw forbidden('This feature is not available');
  const { ai_chat_warning: warning } = await futureSettings(q);
  const crisis = mentionsCrisis(input.message);
  if (!converse) return { warning, reply: NOT_SET_UP, crisis };
  await countTurn(q, userId, 'chat', (await settings(q)).chat_daily_limit);
  const res = await converse(GOD_SYSTEM, turnsFor(input.history, input.message));
  return { warning, reply: 'refused' in res ? DECLINED : res.text, crisis };
}

// 2. The circle facilitator ---------------------------------------------------------------------

export const ROLES = ['harmed', 'caused', 'unsure'] as const;

/** IIRP restorative questions (iirp.edu, "IIRP Restorative Questions" card). */
export const QUESTIONS: Record<(typeof ROLES)[number], string[]> = {
  harmed: [
    'What did you think when you realized what had happened?',
    'What impact has this incident had on you and others?',
    'What has been the hardest thing for you?',
    'What do you think needs to happen to make things right?',
  ],
  caused: [
    'What happened?',
    'What were you thinking of at the time?',
    'What have you thought about since?',
    'Who has been affected by what you have done, and how were they affected?',
    'What do you think you need to do to make things right?',
  ],
  unsure: [
    'What happened?',
    'What were you thinking of at the time?',
    'What have you thought about since?',
    'Who has been affected, and how?',
    'What do you think needs to happen to make things right?',
  ],
};

const ROLE_LINE: Record<(typeof ROLES)[number], string> = {
  harmed: 'The member says they were hurt by someone else.',
  caused: 'The member says they may have hurt someone.',
  unsure: 'The member is not sure who was hurt, or thinks both sides were.',
};

export function facilitatorSystem(role: (typeof ROLES)[number]) {
  return `You are an AI first-step facilitator in an online community. A member is preparing for a restorative circle: a moderated video meeting where the people in a dispute talk face to face. ${ROLE_LINE[role]}

Guide them through these restorative questions, one at a time, in this order:
${QUESTIONS[role].map((x, i) => `${i + 1}. ${x}`).join('\n')}

How to help:
- Ask one question per reply. Before the next question, reflect back in one sentence what you heard, without judging.
- Never decide who is right, never assign blame, and never give legal, medical or therapy advice.
- Don't ask for full names, addresses or contact details.
- If they describe abuse, violence, threats, or wanting to harm themselves or someone else, stop the questions. Say plainly you are an AI, urge them to contact emergency services or a crisis line now, and tell them a moderator can help them stay safe. Do not suggest meeting the other person.
- When every question is answered, write a short summary in their own words, three to five sentences, on a new line that starts with "Summary:". Then tell them they can send it to a moderator with "Ask for a circle", or keep it to themselves.
- Keep replies short and warm, in plain English.`;
}

export async function facilitatorInfo(q: Queryable) {
  return { enabled: (await settings(q)).facilitator_enabled, questions: QUESTIONS };
}

export const FacilitateInput = z.object({ role: z.enum(ROLES), message: z.string().trim().min(1).max(2000), history: History });

export async function facilitate(q: Queryable, converse: Converse | null, userId: string, input: z.infer<typeof FacilitateInput>) {
  const s = await settings(q);
  if (!s.facilitator_enabled) throw forbidden('This feature is not available');
  const crisis = mentionsCrisis(input.message);
  // Without an AI, the member still gets the questions, one at a time.
  if (!converse) {
    const asked = input.history.filter((t) => t.role === 'assistant').length;
    const next = QUESTIONS[input.role][asked];
    return { reply: next ?? 'Thank you. You can write a short summary and send it to a moderator with "Ask for a circle".', crisis, ai: false };
  }
  await countTurn(q, userId, 'facilitator', s.facilitator_daily_limit);
  const res = await converse(facilitatorSystem(input.role), turnsFor(input.history, input.message));
  return { reply: 'refused' in res ? 'I cannot help with this here. A moderator can: tap "Ask for a circle" and describe what happened.' : res.text, crisis, ai: true };
}

export const CircleRequest = z.object({ role: z.enum(ROLES), summary: z.string().trim().min(1).max(2000) });

export async function requestCircle(q: Queryable, userId: string, input: z.infer<typeof CircleRequest>) {
  if (!(await settings(q)).facilitator_enabled) throw forbidden('This feature is not available');
  const { rows: open } = await q.query(`select 1 from public.circle_requests where user_id = $1 and status = 'open'`, [userId]);
  if (open.length) throw new AppError(429, 'circle_request_open', 'You already asked for a circle. A moderator will contact you.');
  const { rows } = await q.query<{ id: string }>(
    `insert into public.circle_requests (user_id, role, summary) values ($1, $2, $3) returning id`,
    [userId, input.role, input.summary],
  );
  return { id: rows[0]!.id };
}

async function requireCircleStaff(q: Queryable, userId: string) {
  if (!(await hasRole(q, userId, 'moderator', 'admin', 'pastor_counselor'))) throw forbidden('Moderators and pastors only');
}

export async function circleRequests(q: Queryable, staffId: string, status: 'open' | 'closed') {
  await requireCircleStaff(q, staffId);
  const { rows } = await q.query(
    `select r.id, r.user_id as "userId", p.display_name as "displayName", r.role, r.summary, r.status, r.created_at as "createdAt"
       from public.circle_requests r join public.profiles p on p.id = r.user_id
      where r.status = $1 order by r.created_at ${status === 'open' ? 'asc' : 'desc'} limit 100`,
    [status],
  );
  return rows;
}

export async function closeCircleRequest(q: Queryable, staffId: string, id: string) {
  await requireCircleStaff(q, staffId);
  const { rowCount } = await q.query(
    `update public.circle_requests set status = 'closed', closed_by = $2, closed_at = now() where id = $1 and status = 'open'`,
    [id, staffId],
  );
  if (!rowCount) throw notFound('Open circle request');
  return { closed: true };
}

// Member surveys (migration 20261029004600_surveys.sql; docs/SURVEYS.md).
// Admins write a survey as a draft and open it when it's ready; members see
// only open surveys for their community, and answer each once. A survey for
// "everyone" skips neutral-wording communities (Open Circle), which see only
// surveys made for them, so no religious wording reaches them. On an anonymous
// survey the answers carry no member id, and the record of who answered is
// kept apart. Results are totals only, and are held back until enough people
// have answered that no one can be picked out.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, notFound } from '../../errors.js';
import { featureOn, requireFeature } from '../communities/index.js';

/** Fewer answers than this, and an anonymous survey's results stay hidden (one person's answers could be guessed). */
export const MIN_RESPONSES = 5;
/** A scale question runs from 1 to this. */
export const SCALE_MAX = 5;

export interface Question {
  id: string;
  position: number;
  kind: 'single' | 'multi' | 'scale' | 'text';
  prompt: string;
  options: string[];
  required: boolean;
}

export interface Survey {
  id: string;
  title: string;
  intro: string | null;
  status: 'draft' | 'open' | 'closed';
  anonymous: boolean;
  community: string | null;
  closesAt: string | null;
  questions: Question[];
}

const SURVEY = `s.id, s.title, s.intro, s.status, s.anonymous, c.slug as community, s.closes_at as "closesAt",
  coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'position', q.position, 'kind', q.kind, 'prompt', q.prompt,
                                                 'options', q.options, 'required', q.required) order by q.position)
              from public.survey_questions q where q.survey_id = s.id), '[]') as questions`;
const FROM = 'from public.surveys s left join public.communities c on c.id = s.community_id';

/** Open for answers now: opened, not past its closing time. */
const OPEN = `s.status = 'open' and (s.closes_at is null or s.closes_at > now())`;

// Members ------------------------------------------------------------------------

/** Open surveys for the member's community that they haven't answered yet. */
export async function forMember(q: Queryable, userId: string): Promise<Survey[]> {
  if (!(await featureOn(q, userId, 'surveys'))) return [];
  const { rows } = await q.query<Survey>(
    `select ${SURVEY} ${FROM}
      where ${OPEN} and (s.community_id = public.member_community_id($1) or (s.community_id is null and not exists (
          select 1 from public.communities mc where mc.id = public.member_community_id($1)
             and coalesce(mc.vocabulary->>'wording', case when mc.tradition = 'secular' then 'neutral' else 'faith' end) = 'neutral')))
        and not exists (select 1 from public.survey_respondents r where r.survey_id = s.id and r.user_id = $1)
      order by s.opened_at desc nulls last limit 20`,
    [userId],
  );
  return rows;
}

export const Answers = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.uuid(),
        choices: z.array(z.string().max(200)).max(20).optional(),
        value: z.number().int().optional(),
        text: z.string().trim().max(2000).optional(),
      }),
    )
    .max(50),
});

/** Record a member's answers, once per survey. */
export async function answer(q: Queryable, userId: string, surveyId: string, input: z.infer<typeof Answers>): Promise<{ ok: true }> {
  const { rows } = await q.query<Survey>(
    `select ${SURVEY} ${FROM} where s.id = $1 and ${OPEN} and (s.community_id = public.member_community_id($2) or (s.community_id is null and not exists (
          select 1 from public.communities mc where mc.id = public.member_community_id($2)
             and coalesce(mc.vocabulary->>'wording', case when mc.tradition = 'secular' then 'neutral' else 'faith' end) = 'neutral')))`,
    [surveyId, userId],
  );
  const survey = rows[0];
  if (!survey) throw notFound('Survey');
  await requireFeature(q, userId, 'surveys');
  const given = new Map(input.answers.map((a) => [a.questionId, a]));
  const clean: { questionId: string; choices: string[]; value: number | null; text: string | null }[] = [];
  for (const question of survey.questions) {
    const a = given.get(question.id);
    given.delete(question.id);
    let choices: string[] = [];
    let value: number | null = null;
    let text: string | null = null;
    if (question.kind === 'single' || question.kind === 'multi') {
      choices = [...new Set(a?.choices ?? [])];
      if (choices.some((c) => !question.options.includes(c))) throw badRequest(`"${question.prompt}" has no such choice`);
      if (question.kind === 'single' && choices.length > 1) throw badRequest(`Choose one answer to "${question.prompt}"`);
    } else if (question.kind === 'scale') {
      value = a?.value ?? null;
      if (value !== null && (value < 1 || value > SCALE_MAX)) throw badRequest(`Answer "${question.prompt}" from 1 to ${SCALE_MAX}`);
    } else text = a?.text || null;
    const empty = !choices.length && value === null && !text;
    if (empty && question.required) throw badRequest(`Please answer "${question.prompt}"`);
    if (!empty) clean.push({ questionId: question.id, choices, value, text });
  }
  if (given.size) throw badRequest('An answer is for a question that is not in this survey');

  const { rowCount } = await q.query('insert into public.survey_respondents (survey_id, user_id) values ($1, $2) on conflict do nothing', [surveyId, userId]);
  if (!rowCount) throw conflict('You already answered this survey');
  const { rows: r } = await q.query<{ id: string }>('insert into public.survey_responses (survey_id, user_id) values ($1, $2) returning id', [
    surveyId,
    survey.anonymous ? null : userId,
  ]);
  for (const a of clean) {
    await q.query('insert into public.survey_answers (response_id, question_id, choices, value, text_answer) values ($1, $2, $3, $4, $5)', [
      r[0]!.id,
      a.questionId,
      a.choices,
      a.value,
      a.text,
    ]);
  }
  return { ok: true };
}

// Admins -------------------------------------------------------------------------

export async function list(q: Queryable): Promise<(Survey & { responses: number })[]> {
  const { rows } = await q.query<Survey & { responses: number }>(
    `select ${SURVEY}, (select count(*)::int from public.survey_responses x where x.survey_id = s.id) as responses
       ${FROM} order by s.created_at desc`,
  );
  return rows;
}

async function get(q: Queryable, id: string): Promise<Survey> {
  const { rows } = await q.query<Survey>(`select ${SURVEY} ${FROM} where s.id = $1`, [id]);
  if (!rows[0]) throw notFound('Survey');
  return rows[0];
}

const QuestionInput = z
  .object({
    kind: z.enum(['single', 'multi', 'scale', 'text']),
    prompt: z.string().trim().min(1).max(300),
    options: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    required: z.boolean().default(false),
  })
  .refine((x) => (x.kind === 'single' || x.kind === 'multi' ? x.options.length >= 2 : true), { message: 'A choice question needs at least two choices' })
  .refine((x) => (x.kind === 'scale' ? x.options.length === 0 || x.options.length === 2 : true), { message: 'A scale has two end labels, or none' });

export const NewSurvey = z.object({
  title: z.string().trim().min(1).max(120),
  intro: z.string().trim().max(1000).nullable().optional(),
  anonymous: z.boolean().default(true),
  /** A community's short name, or null for everyone. */
  community: z.string().regex(/^[a-z0-9-]{3,40}$/).nullable().optional(),
  closesAt: z.iso.datetime().nullable().optional(),
  questions: z.array(QuestionInput).min(1).max(30),
});

async function communityId(q: Queryable, slug: string | null | undefined): Promise<string | null> {
  if (!slug) return null;
  const { rows } = await q.query<{ id: string }>('select id from public.communities where slug = $1', [slug]);
  if (!rows[0]) throw notFound('Community');
  return rows[0].id;
}

async function writeQuestions(q: Queryable, id: string, questions: z.infer<typeof QuestionInput>[]) {
  await q.query('delete from public.survey_questions where survey_id = $1', [id]);
  for (const [i, x] of questions.entries()) {
    await q.query('insert into public.survey_questions (survey_id, position, kind, prompt, options, required) values ($1, $2, $3, $4, $5, $6)', [
      id,
      i + 1,
      x.kind,
      x.prompt,
      [...new Set(x.options)],
      x.required,
    ]);
  }
}

/** A new survey, as a draft. */
export async function create(q: Queryable, adminId: string, input: z.infer<typeof NewSurvey>): Promise<Survey> {
  const { rows } = await q.query<{ id: string }>(
    `insert into public.surveys (title, intro, anonymous, community_id, closes_at, created_by) values ($1, $2, $3, $4, $5, $6) returning id`,
    [input.title, input.intro ?? null, input.anonymous, await communityId(q, input.community), input.closesAt ?? null, adminId],
  );
  await writeQuestions(q, rows[0]!.id, input.questions);
  return get(q, rows[0]!.id);
}

// No defaults here, so a field left out stays as it is.
export const SurveyPatch = NewSurvey.partial().extend({ anonymous: z.boolean().optional(), status: z.enum(['draft', 'open', 'closed']).optional() });

/**
 * Edit a survey. Its questions and anonymity can change only while nobody has
 * answered, so every answer means what the member saw.
 */
export async function update(q: Queryable, id: string, input: z.infer<typeof SurveyPatch>): Promise<Survey> {
  const survey = await get(q, id);
  const { rows: n } = await q.query<{ n: number }>('select count(*)::int as n from public.survey_responses where survey_id = $1', [id]);
  const answered = n[0]!.n > 0;
  if (answered && (input.questions || input.anonymous !== undefined)) throw conflict('People have already answered; copy the survey to change its questions');
  if (input.status === 'open' && !survey.questions.length && !input.questions?.length) throw badRequest('Add a question first');
  await q.query(
    `update public.surveys set title = coalesce($2, title),
            intro = case when $3 then $4 else intro end,
            anonymous = coalesce($5, anonymous),
            community_id = case when $6 then $7::uuid else community_id end,
            closes_at = case when $8 then $9::timestamptz else closes_at end,
            status = coalesce($10::public.survey_status, status),
            opened_at = case when $10 = 'open' and opened_at is null then now() else opened_at end
      where id = $1`,
    [
      id,
      input.title ?? null,
      input.intro !== undefined,
      input.intro ?? null,
      input.anonymous ?? null,
      input.community !== undefined,
      input.community !== undefined ? await communityId(q, input.community) : null,
      input.closesAt !== undefined,
      input.closesAt ?? null,
      input.status ?? null,
    ],
  );
  if (input.questions) await writeQuestions(q, id, input.questions);
  return get(q, id);
}

/** Delete a survey that nobody has answered (a draft, or one opened by mistake). */
export async function remove(q: Queryable, id: string): Promise<void> {
  await get(q, id);
  const { rows } = await q.query<{ n: number }>('select count(*)::int as n from public.survey_responses where survey_id = $1', [id]);
  if (rows[0]!.n > 0) throw conflict('People have answered this survey; close it instead');
  await q.query('delete from public.surveys where id = $1', [id]);
}

export interface Results {
  survey: Survey;
  responses: number;
  /** False while an anonymous survey has fewer than MIN_RESPONSES answers. */
  shown: boolean;
  questions: { id: string; prompt: string; kind: Question['kind']; answered: number; counts?: Record<string, number>; average?: number | null; texts?: string[] }[];
}

/** Totals for each question. Written answers are listed without names, in random order. */
export async function results(q: Queryable, id: string): Promise<Results> {
  const survey = await get(q, id);
  const { rows: n } = await q.query<{ n: number }>('select count(*)::int as n from public.survey_responses where survey_id = $1', [id]);
  const responses = n[0]!.n;
  const shown = !survey.anonymous || responses >= MIN_RESPONSES;
  if (!shown) return { survey, responses, shown, questions: survey.questions.map((x) => ({ id: x.id, prompt: x.prompt, kind: x.kind, answered: 0 })) };
  const { rows } = await q.query<{ question_id: string; choices: string[]; value: number | null; text_answer: string | null }>(
    `select a.question_id, a.choices, a.value, a.text_answer from public.survey_answers a
       join public.survey_responses r on r.id = a.response_id where r.survey_id = $1 order by random()`,
    [id],
  );
  return {
    survey,
    responses,
    shown,
    questions: survey.questions.map((x) => {
      const mine = rows.filter((r) => r.question_id === x.id);
      if (x.kind === 'text') return { id: x.id, prompt: x.prompt, kind: x.kind, answered: mine.length, texts: mine.map((r) => r.text_answer!).filter(Boolean) };
      if (x.kind === 'scale') {
        const values = mine.map((r) => r.value!).filter((v) => v !== null);
        const counts = Object.fromEntries(Array.from({ length: SCALE_MAX }, (_, i) => [String(i + 1), values.filter((v) => v === i + 1).length]));
        return { id: x.id, prompt: x.prompt, kind: x.kind, answered: values.length, counts, average: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null };
      }
      const counts = Object.fromEntries(x.options.map((o) => [o, mine.filter((r) => r.choices.includes(o)).length]));
      return { id: x.id, prompt: x.prompt, kind: x.kind, answered: mine.length, counts };
    }),
  };
}

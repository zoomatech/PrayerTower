import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(() => db.end());

const questions = [
  { kind: 'single', prompt: 'Do you feel welcome?', options: ['Yes', 'No'], required: true },
  { kind: 'multi', prompt: 'Which do you use?', options: ['Feed', 'Radio', 'Notebook'] },
  { kind: 'scale', prompt: 'How safe do you feel?', options: ['Not safe', 'Very safe'] },
  { kind: 'text', prompt: 'Anything else?' },
];

describe('Surveys', () => {
  it('ships the notebook survey as a draft that no member sees', async () => {
    const { rows } = await db.query(`select status from public.surveys where title = 'Praying for everyone'`);
    expect(rows[0].status).toBe('draft');
    const member = await createUser('Survey Sue');
    expect((await as(member).get('/surveys')).json().surveys.map((s: { title: string }) => s.title)).not.toContain('Praying for everyone');
  });

  it('lets admins write and open a survey, members answer once, and shows only totals', async () => {
    const admin = await createUser('Survey Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Survey Member');
    expect((await as(member).post('/admin/surveys', { title: 'x', questions })).statusCode).toBe(403);
    expect((await as(admin).post('/admin/surveys', { title: 'Bad', questions: [{ kind: 'single', prompt: 'One?', options: ['Only'] }] })).statusCode).toBe(400);

    const made = await as(admin).post('/admin/surveys', { title: 'How are we doing?', questions });
    expect(made.statusCode).toBe(201);
    const survey = made.json().survey;
    expect(survey).toMatchObject({ status: 'draft', anonymous: true });
    expect((await as(member).get('/surveys')).json().surveys.map((s: { id: string }) => s.id)).not.toContain(survey.id);
    const [single, multi, scale, text] = survey.questions.map((q: { id: string }) => q.id);
    expect((await as(member).post(`/surveys/${survey.id}/responses`, { answers: [] })).statusCode).toBe(404);

    expect((await as(admin).patch(`/admin/surveys/${survey.id}`, { status: 'open' })).json().survey.status).toBe('open');
    expect((await as(member).get('/surveys')).json().surveys.map((s: { id: string }) => s.id)).toContain(survey.id);

    const post = (userId: string, answers: unknown[]) => as(userId).post(`/surveys/${survey.id}/responses`, { answers });
    expect((await post(member, [])).statusCode).toBe(400);
    expect((await post(member, [{ questionId: single, choices: ['Maybe'] }])).statusCode).toBe(400);
    expect((await post(member, [{ questionId: single, choices: ['Yes'] }, { questionId: scale, value: 9 }])).statusCode).toBe(400);
    const ok = await post(member, [
      { questionId: single, choices: ['Yes'] },
      { questionId: multi, choices: ['Feed', 'Radio'] },
      { questionId: scale, value: 4 },
      { questionId: text, text: 'Thank you' },
    ]);
    expect(ok.statusCode).toBe(201);
    expect((await post(member, [{ questionId: single, choices: ['No'] }])).statusCode).toBe(409);
    expect((await as(member).get('/surveys')).json().surveys.map((s: { id: string }) => s.id)).not.toContain(survey.id);

    // Anonymous: the answer has no member id.
    const { rows } = await db.query('select user_id from public.survey_responses where survey_id = $1', [survey.id]);
    expect(rows).toEqual([{ user_id: null }]);

    // Too few answers to show anything.
    const early = (await as(admin).get(`/admin/surveys/${survey.id}/results`)).json();
    expect(early).toMatchObject({ responses: 1, shown: false });
    expect(early.questions[0].counts).toBeUndefined();

    for (let i = 0; i < 4; i++) expect((await post(await createUser(`Voter ${i}`), [{ questionId: single, choices: [i % 2 ? 'Yes' : 'No'] }, { questionId: scale, value: 2 }])).statusCode).toBe(201);
    const results = (await as(admin).get(`/admin/surveys/${survey.id}/results`)).json();
    expect(results).toMatchObject({ responses: 5, shown: true });
    expect(results.questions[0].counts).toEqual({ Yes: 3, No: 2 });
    expect(results.questions[1].counts).toEqual({ Feed: 1, Radio: 1, Notebook: 0 });
    expect(results.questions[2]).toMatchObject({ answered: 5, average: 2.4 });
    expect(results.questions[3].texts).toEqual(['Thank you']);

    // Once answered, the questions are fixed and it can't be deleted.
    expect((await as(admin).patch(`/admin/surveys/${survey.id}`, { questions })).statusCode).toBe(409);
    expect((await as(admin).delete(`/admin/surveys/${survey.id}`)).statusCode).toBe(409);
    expect((await as(admin).patch(`/admin/surveys/${survey.id}`, { status: 'closed' })).json().survey.status).toBe('closed');
    expect((await post(await createUser('Late Lou'), [{ questionId: single, choices: ['Yes'] }])).statusCode).toBe(404);
  });

  it('keeps a community survey to that community', async () => {
    const admin = await createUser('Scope Admin');
    await grantRole(db, admin, 'admin', null);
    const survey = (await as(admin).post('/admin/surveys', { title: 'Circle only', community: 'open-circle', questions })).json().survey;
    await as(admin).patch(`/admin/surveys/${survey.id}`, { status: 'open' });
    const member = await createUser('Scope Member');
    expect((await as(member).get('/surveys')).json().surveys.map((s: { id: string }) => s.id)).not.toContain(survey.id);
    expect((await as(admin).delete(`/admin/surveys/${survey.id}`)).statusCode).toBe(200);
  });

  it("keeps surveys for everyone out of Open Circle, which sees only its own", async () => {
    const admin = await createUser('Edition Admin');
    await grantRole(db, admin, 'admin', null);
    const everyone = (await as(admin).post('/admin/surveys', { title: 'For everyone', questions })).json().survey;
    const circle = (await as(admin).post('/admin/surveys', { title: 'For the circle', community: 'open-circle', questions })).json().survey;
    for (const s of [everyone, circle]) await as(admin).patch(`/admin/surveys/${s.id}`, { status: 'open' });
    const member = await createUser('Circle Surveyed');
    const { rows } = await db.query<{ id: string }>(`select id from public.communities where slug = 'open-circle'`);
    await db.query('delete from public.community_memberships where user_id = $1', [member]);
    await db.query('insert into public.community_memberships (community_id, user_id, is_primary) values ($1, $2, true)', [rows[0]!.id, member]);
    const seen = (await as(member).get('/surveys')).json().surveys.map((s: { id: string }) => s.id);
    expect(seen).toContain(circle.id);
    expect(seen).not.toContain(everyone.id);
    expect((await as(member).post(`/surveys/${everyone.id}/responses`, { answers: [] })).statusCode).toBe(404);
    for (const s of [everyone, circle]) await as(admin).delete(`/admin/surveys/${s.id}`);
  });
});

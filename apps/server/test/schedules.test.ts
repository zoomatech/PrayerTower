import { afterAll, describe, expect, it } from 'vitest';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, drainJobs, newRequest } from './helpers.js';

afterAll(() => db.end());

const runDue = async () => {
  await db.query(`select graphile_worker.add_job('schedules_run_due', '{}')`);
  await drainJobs();
};
// Far enough ahead that a slow, busy test run never reaches it before the test moves it to now.
const soon = () => new Date(Date.now() + 10 * 60_000).toISOString();

describe('scheduled token spending', () => {
  it('gives tokens at the set time, weekly for the chosen number of weeks', async () => {
    const member = await createUser('Jonathan');
    await tokens.earn(db, member, 10, `t:${member}:s`, 'test');
    const post = await newRequest(await createUser('David'), 'Pray for the game on Friday.');
    const res = await as(member).post(`/posts/${post.id}/scheduled-spends`, { amount: 3, runAt: soon(), repeatWeeks: 2 });
    expect(res.statusCode).toBe(201);
    const id = res.json().schedule.id;

    await runDue(); // not due yet
    expect(await tokens.reachOf(db, post.id)).toBe(0);
    await db.query(`update public.scheduled_spends set next_run_at = now() - interval '1 second' where id = $1`, [id]);
    await runDue();
    expect(await tokens.reachOf(db, post.id)).toBe(3);
    let [s] = (await as(member).get('/me/scheduled-spends')).json().schedules;
    expect(s).toMatchObject({ runs: 1, status: 'active' });
    expect(new Date(s.next_run_at).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);

    await db.query(`update public.scheduled_spends set next_run_at = now() - interval '1 second' where id = $1`, [id]);
    await runDue();
    [s] = (await as(member).get('/me/scheduled-spends')).json().schedules;
    expect(s).toMatchObject({ runs: 2, status: 'done' });
    expect(await tokens.balanceOf(db, member)).toBe(4);
  });

  it('fails and tells the member when they are short, and can be cancelled', async () => {
    const member = await createUser('Short');
    const post = await newRequest(await createUser('Poster'), 'Pray for Saturday.');
    const a = (await as(member).post(`/posts/${post.id}/scheduled-spends`, { amount: 5, runAt: soon() })).json().schedule.id;
    const b = (await as(member).post(`/posts/${post.id}/scheduled-spends`, { amount: 5, runAt: soon() })).json().schedule.id;
    expect((await as(member).delete(`/scheduled-spends/${b}`)).statusCode).toBe(200);
    await db.query(`update public.scheduled_spends set next_run_at = now() - interval '1 second' where id = any($1)`, [[a, b]]);
    await runDue();
    const rows = (await db.query('select id, status, error from public.scheduled_spends where id = any($1)', [[a, b]])).rows;
    expect(rows.find((r) => r.id === a)).toMatchObject({ status: 'failed', error: "You didn't have 5 tokens when it was time." });
    expect(rows.find((r) => r.id === b)).toMatchObject({ status: 'cancelled' });
    const notes = (await as(member).get('/me/notifications')).json().notifications;
    expect(notes.some((n: { kind: string }) => n.kind === 'scheduled_spend')).toBe(true);
    expect((await as(member).post(`/posts/${post.id}/scheduled-spends`, { amount: 1, runAt: '2020-01-01T00:00:00Z' })).statusCode).toBe(400);
  });
});

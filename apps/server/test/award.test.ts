import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, drainJobs, newRequest } from './helpers.js';

const YEAR = 2030; // far from other tests' prayers

// The test database is shared between runs: start the year clean.
beforeAll(async () => {
  await db.query('delete from public.prayer_warrior_awards where year = $1', [YEAR]);
  await db.query(`delete from public.prayer_events where created_at >= make_timestamptz($1, 1, 1, 0, 0, 0, 'UTC') and created_at < make_timestamptz($1 + 1, 1, 1, 0, 0, 0, 'UTC')`, [YEAR]);
});

afterAll(async () => {
  await db.query(`update public.award_settings set enabled = false, winners = 3, token_prize = 0, priestly_prize = 0, prize_note = '', public_hall = true`);
  await db.end();
});

/** n verified prayers by `who` for someone else's request, dated in YEAR. */
async function prayed(who: string, poster: string, n: number) {
  const { id } = await newRequest(poster, `Please pray for us (${who.slice(0, 6)}).`);
  for (let i = 0; i < n; i++) {
    await db.query(`insert into public.prayer_events (post_id, user_id, kind) values ($1, $2, 'praying_now')`, [id, who]);
  }
  await db.query(`update public.prayer_events set verified = true, created_at = make_timestamptz($3, 6, 1, 12, 0, 0, 'UTC') where post_id = $1 and user_id = $2`, [id, who, YEAR]);
}

describe('Annual Prayer Warrior Award', () => {
  it('is off by default, then offers the year’s top pray-ers an award they accept or decline', async () => {
    const admin = await createUser('Award Admin');
    await grantRole(db, admin, 'admin', null);
    const poster = await createUser('Award Poster');
    const first = await createUser('Award First');
    const second = await createUser('Award Second');
    const third = await createUser('Award Third');
    await prayed(first, poster, 5);
    await prayed(second, poster, 4);
    await prayed(third, poster, 2);

    expect((await as(admin).post(`/admin/awards/${YEAR}/select`)).statusCode).toBe(404); // off
    expect((await as(first).get('/me/awards')).json()).toEqual({ enabled: false, awards: [] });
    expect((await as(first).patch('/admin/award-settings', { enabled: true })).statusCode).toBe(403);
    const set = await as(admin).patch('/admin/award-settings', { enabled: true, winners: 2, tokenPrize: 25, priestlyPrize: 2, prizeNote: 'Plus a framed certificate' });
    expect(set.json().settings).toMatchObject({ enabled: true, winners: 2, token_prize: 25, priestly_prize: 2 });

    const view = (await as(admin).get(`/admin/awards/${YEAR}`)).json();
    expect(view.standings.slice(0, 3).map((s: { userId: string }) => s.userId)).toEqual([first, second, third]);
    const picked = (await as(admin).post(`/admin/awards/${YEAR}/select`)).json().awards;
    expect(picked.map((a: { userId: string; rank: number }) => [a.userId, a.rank])).toEqual([[first, 1], [second, 2]]);
    expect((await as(admin).post(`/admin/awards/${YEAR}/select`)).statusCode).toBe(409); // all offered
    await drainJobs();
    const { rows: notes } = await db.query(`select title from public.notifications where user_id = $1 and kind = 'award'`, [first]);
    expect(notes[0]?.title).toBe(`You are a ${YEAR} Prayer Warrior`);

    const mine = (await as(first).get('/me/awards')).json();
    expect(mine).toMatchObject({ enabled: true, prize: { tokens: 25, priestly: 2, note: 'Plus a framed certificate' } });
    const awardId = mine.awards[0].id;
    expect((await as(second).post(`/me/awards/${awardId}/accept`, { showName: true })).statusCode).toBe(404);
    expect((await as(first).post(`/me/awards/${awardId}/accept`, { showName: true })).json()).toEqual({ accepted: true, prizeChoice: 'keep', tokens: 25, priestly: 2, donated: { tokens: 0, priestly: 0 } });
    expect((await as(first).post(`/me/awards/${awardId}/accept`, { showName: true })).json()).toEqual({ accepted: true, prizeChoice: 'keep', tokens: 0, priestly: 0, donated: { tokens: 0, priestly: 0 } });
    expect(await tokens.balanceOf(db, first, 'priestly')).toBeGreaterThanOrEqual(2);

    // A decline frees a place for the next in line.
    const secondId = (await as(second).get('/me/awards')).json().awards[0].id;
    expect((await as(second).post(`/me/awards/${secondId}/decline`)).json()).toEqual({ declined: true });
    const again = (await as(admin).post(`/admin/awards/${YEAR}/select`)).json().awards;
    expect(again.find((a: { userId: string }) => a.userId === third)).toMatchObject({ rank: 3, status: 'offered' });
    const thirdId = again.find((a: { userId: string }) => a.userId === third).id;
    await as(third).post(`/me/awards/${thirdId}/accept`, { showName: false });

    const hall = (await as(poster).get('/awards')).json();
    const year = hall.years.find((y: { year: number }) => y.year === YEAR);
    expect(year.winners).toEqual([
      { rank: 1, name: 'Award First', prayers: 5, peoplePrayedFor: 1 },
      { rank: 2, name: null, prayers: 2, peoplePrayedFor: 1 },
    ]);
  });
});

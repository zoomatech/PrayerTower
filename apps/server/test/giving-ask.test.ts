// The gentle giving ask: once, after a member has been here a while, never to a giver.
import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.query('update public.notebook_settings set giving_ask_enabled = false, giving_ask_after_days = 28');
  await db.query('update public.donation_settings set enabled = false');
  await db.end();
});

describe('Gentle giving ask', () => {
  it('shows once to a member who has been here long enough, and never again', async () => {
    const member = await createUser('Ask Member');
    expect((await as(member).get('/me/giving-ask')).json()).toEqual({ show: false });
    await db.query('update public.notebook_settings set giving_ask_enabled = true, giving_ask_after_days = 28');
    await db.query('update public.donation_settings set enabled = true');
    // Too new.
    expect((await as(member).get('/me/giving-ask')).json()).toEqual({ show: false });
    await db.query(`update public.profiles set created_at = now() - interval '30 days' where id = $1`, [member]);
    expect((await as(member).get('/me/giving-ask')).json()).toEqual({ show: true });
    await as(member).post('/me/giving-ask/seen', {});
    expect((await as(member).get('/me/giving-ask')).json()).toEqual({ show: false });

    // Never to someone who already gave.
    const giver = await createUser('Ask Giver');
    await db.query(`update public.profiles set created_at = now() - interval '30 days' where id = $1`, [giver]);
    await db.query(`insert into public.donations (donor_id, amount_cents, provider, status) values ($1, 500, 'manual', 'paid')`, [giver]);
    expect((await as(giver).get('/me/giving-ask')).json()).toEqual({ show: false });
  });
});

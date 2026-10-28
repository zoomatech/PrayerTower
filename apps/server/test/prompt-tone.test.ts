import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { question } from '../src/modules/prompts/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.query(`update public.prompt_settings set default_tone = 'gentle'`);
  await db.end();
});

describe('reminder tone', () => {
  it('uses gentle copy by default, firm when chosen, and reports how each does', async () => {
    expect(question('gentle', 'Billy', true)).toBe('When was the last time you prayed for Billy?');
    expect(question('firm', 'Billy', true)).toBe("Remember, you made a commitment before God to pray for Billy. Won't you take just a moment now?");

    const poster = await createUser('Billy');
    const member = await createUser('Tone Member');
    const post = await newRequest(poster);
    await as(member).post(`/posts/${post.id}/commitments`, { frequency: 'daily', vowText: 'I vow to pray daily.' });
    await db.query(`update public.commitments set created_at = now() - interval '2 days' where user_id = $1`, [member]);

    await as(member).patch('/me', { promptTone: 'firm' });
    const prompt = (await as(member).get('/me/prompt')).json().prompt;
    expect(prompt.tone).toBe('firm');
    expect(prompt.question).toMatch(/^Remember, you made a commitment before God/);
    await as(member).post(`/me/prompts/${prompt.id}/response`, { response: 'prayed' });

    const admin = await createUser('Tone Admin');
    await grantRole(db, admin, 'admin', null);
    expect((await as(admin).patch('/admin/prompt-settings', { defaultTone: 'firm' })).json()).toEqual({ defaultTone: 'firm' });
    const s = (await as(admin).get('/admin/prompt-settings')).json();
    expect(s.defaultTone).toBe('firm');
    expect(s.results.find((r: { tone: string }) => r.tone === 'firm').prayed).toBeGreaterThanOrEqual(1);
  });
});

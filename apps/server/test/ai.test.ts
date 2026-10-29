import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { GOD_SYSTEM, QUESTIONS } from '../src/modules/ai/index.js';
import type { Turn } from '../src/modules/ai/provider.js';
import { as, createUser, db, setConverser } from './helpers.js';

afterAll(async () => {
  await db.query('update public.future_settings set ai_chat_enabled = false');
  await db.query('update public.ai_settings set chat_daily_limit = 20, facilitator_enabled = false, facilitator_daily_limit = 30');
  await db.query(`update public.communities set status = 'hidden' where slug = 'open-circle'`);
  await db.end();
});

describe('AI conversation (not God) and the circle facilitator', () => {
  it('sends the recent turns with the not-God rules, shows the warning, and keeps a daily limit', async () => {
    const admin = await createUser('AI Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('AI Member');
    const calls: { system: string; turns: Turn[] }[] = [];
    setConverser(async (system, turns) => {
      calls.push({ system, turns });
      return { text: 'Be still, and know. (Psalm 46:10)' };
    });

    expect((await as(member).get('/ai-chat')).json().enabled).toBe(false);
    expect((await as(member).post('/ai-chat', { message: 'Hello' })).statusCode).toBe(403);
    await as(admin).patch('/admin/future-settings', { aiChatEnabled: true });
    expect((await as(member).patch('/admin/ai-settings', { chatDailyLimit: 2 })).statusCode).toBe(403);
    const set = await as(admin).patch('/admin/ai-settings', { chatDailyLimit: 2 });
    expect(set.json()).toMatchObject({ settings: { chat_daily_limit: 2 }, aiConnected: true });

    const res = await as(member).post('/ai-chat', {
      message: 'I feel far away.',
      history: [
        { role: 'assistant', content: 'Welcome.' },
        { role: 'user', content: 'Are you God?' },
        { role: 'assistant', content: 'No. I am an AI imagining.' },
      ],
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ reply: 'Be still, and know. (Psalm 46:10)', crisis: false });
    expect(res.json().warning).toMatch(/not God/);
    expect(calls[0]!.system).toBe(GOD_SYSTEM);
    // The first turn sent is always the member's, and the new message comes last.
    expect(calls[0]!.turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user']);
    expect(calls[0]!.turns.at(-1)!.content).toBe('I feel far away.');

    const crisis = await as(member).post('/ai-chat', { message: 'I want to die' });
    expect(crisis.json().crisis).toBe(true);
    const over = await as(member).post('/ai-chat', { message: 'One more' });
    expect(over.statusCode).toBe(429);

    // A refusal gets a fixed, kind answer.
    setConverser(async () => ({ refused: true }));
    const other = await createUser('AI Other');
    expect((await as(other).post('/ai-chat', { message: 'Tell me a secret' })).json().reply).toMatch(/own prayer/);
  });

  it('is never offered to Open Circle members', async () => {
    const admin = await createUser('AI Admin 2');
    await grantRole(db, admin, 'admin', null);
    await as(admin).patch('/admin/future-settings', { aiChatEnabled: true });
    await as(admin).patch('/admin/communities/open-circle', { status: 'active' });
    const member = await createUser('AI Secular');
    expect((await as(member).post('/me/community', { slug: 'open-circle' })).statusCode).toBeLessThan(300);
    expect((await as(member).get('/ai-chat')).json()).toEqual({ enabled: false, warning: null });
    expect((await as(member).post('/ai-chat', { message: 'Hello' })).statusCode).toBe(403);
  });

  it('walks through the restorative questions and lets the member ask staff for a circle', async () => {
    const admin = await createUser('Circle Admin');
    await grantRole(db, admin, 'admin', null);
    const mod = await createUser('Circle Moderator');
    await grantRole(db, mod, 'moderator', null);
    const member = await createUser('Circle Member');
    const systems: string[] = [];
    setConverser(async (system) => {
      systems.push(system);
      return { text: 'Thank you. What were you thinking of at the time?' };
    });

    expect((await as(member).post('/ai-facilitator', { role: 'caused', message: 'Hi' })).statusCode).toBe(403);
    await as(admin).patch('/admin/ai-settings', { facilitatorEnabled: true });
    const info = (await as(member).get('/ai-facilitator')).json();
    expect(info.enabled).toBe(true);
    expect(info.questions.harmed[0]).toBe('What did you think when you realized what had happened?');

    const r = await as(member).post('/ai-facilitator', { role: 'caused', message: 'I said something unkind in a thread.' });
    expect(r.json()).toMatchObject({ reply: 'Thank you. What were you thinking of at the time?', ai: true });
    for (const q of QUESTIONS.caused) expect(systems[0]).toContain(q);

    const asked = await as(member).post('/circle-requests', { role: 'caused', summary: 'Summary: I was unkind to a member and want to make it right.' });
    expect(asked.statusCode).toBe(201);
    expect((await as(member).post('/circle-requests', { role: 'caused', summary: 'Again' })).statusCode).toBe(429);

    expect((await as(member).get('/moderation/circle-requests')).statusCode).toBe(403);
    const list = (await as(mod).get('/moderation/circle-requests')).json().requests;
    const mine = list.find((x: { id: string }) => x.id === asked.json().id);
    expect(mine).toMatchObject({ displayName: 'Circle Member', role: 'caused' });
    expect((await as(mod).post(`/moderation/circle-requests/${mine.id}/close`)).json()).toEqual({ closed: true });
    expect((await as(mod).post(`/moderation/circle-requests/${mine.id}/close`)).statusCode).toBe(404);
  });
});

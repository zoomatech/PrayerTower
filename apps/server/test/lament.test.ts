// Lament posts: grief to be heard, not fixed. The author's swearing gets no cloud,
// replies are asked (never forced) to hold back advice, and the post stays off the
// radio unless the author says yes.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const tokenDefaults = await tokens.settings(db);
const on = (v: boolean) => db.query('update public.practice_settings set lament_enabled = $1', [v]);
const card = async (u: string, id: string) => (await as(u).get(`/posts/${id}`)).json().post;

beforeAll(async () => {
  await on(false);
  await tokens.updateSettings(db, { radio_funding: 'free' });
});
afterAll(async () => {
  await on(false);
  await db.query('update public.notebook_settings set kind_cloud_enabled = false');
  await tokens.updateSettings(db, tokenDefaults);
  await db.end();
});

describe('Lament posts', () => {
  it('is not kept while switched off', async () => {
    const u = await createUser('Lament Off');
    const p = await newRequest(u, 'My brother died last night.', { isLament: true });
    expect(await card(u, p.id)).toMatchObject({ lament: false, lamentRadio: false });
    expect((await as(u).put(`/posts/${p.id}/lament`, { lament: true })).statusCode).toBe(400);
  });

  it('stays off the radio until the author says yes', async () => {
    await on(true);
    const [u, sender] = [await createUser('Lament Author'), await createUser('Lament Sender')];
    const p = await newRequest(u, 'Why did this happen to my daughter.', { isLament: true });
    expect(await card(u, p.id)).toMatchObject({ lament: true, lamentRadio: false });
    expect((await as(sender).post(`/posts/${p.id}/radio`, { idempotencyKey: 'lament-1' })).statusCode).toBe(409);
    expect((await as(sender).put(`/posts/${p.id}/lament`, { radio: true })).statusCode).toBe(404);
    expect((await as(u).put(`/posts/${p.id}/lament`, { radio: true })).json()).toEqual({ lament: true, lamentRadio: true });
    expect((await as(sender).post(`/posts/${p.id}/radio`, { idempotencyKey: 'lament-2' })).statusCode).toBe(201);
    // Unmarking a lament takes back the radio yes too.
    expect((await as(u).put(`/posts/${p.id}/lament`, { lament: false })).json()).toEqual({ lament: false, lamentRadio: false });
  });

  it('lets the author swear in grief, and asks repliers to hold back advice', async () => {
    await db.query('update public.notebook_settings set kind_cloud_enabled = true');
    const u = await createUser('Lament Cloud');
    const pre = async (text: string, context?: string) => (await as(u).post('/moderation/precheck', { text, context })).json().cloud;
    const grief = 'This damn shit fucking cancer took her, fuck this, shit, fuck';
    expect((await pre(grief)).level).toBe('strong');
    expect((await pre(grief, 'lament')).level).toBe('ok');
    // A threat always gets the cloud.
    expect((await pre("I'll kill you", 'lament')).level).toBe('strong');
    expect(await pre('At least she is not suffering now.', 'lamentReply')).toEqual({ level: 'nudge', reason: 'advice' });
    expect(await pre('Have you tried grief counseling?', 'lamentReply')).toEqual({ level: 'nudge', reason: 'advice' });
    expect((await pre('I am so sorry. I am here with you.', 'lamentReply')).level).toBe('ok');
    expect((await pre('At least she is not suffering now.')).level).toBe('ok');
  });
});

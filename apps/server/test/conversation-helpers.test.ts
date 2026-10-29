// Conversation helpers: six switches, all off; members opt in for themselves; and
// "My meaning words" puts a member's own first word in front and hides the rest they chose.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as notebook from '../src/modules/notebook/index.js';
import { as, createUser, db } from './helpers.js';

const all = (on: boolean) =>
  db.query(
    `update public.conversation_settings set reply_suggestions_enabled = $1, meaning_prefs_enabled = $1, trouble_nudge_enabled = $1,
       greeting_packs_enabled = $1, own_words_enabled = $1, kind_closings_enabled = $1`,
    [on],
  );
const meaningsOn = (on: boolean) => db.query('update public.notebook_settings set meaning_reactions_enabled = $1', [on]);

beforeAll(() => all(false));
afterAll(async () => {
  await all(false);
  await meaningsOn(false);
  await db.end();
});

describe('Conversation helpers', () => {
  it('are all off by default, and admins switch them on', async () => {
    const f = await notebook.features(db);
    expect([f.replySuggestions, f.meaningPrefs, f.troubleNudge, f.greetingPacks, f.ownWords, f.kindClosings]).toEqual([false, false, false, false, false, false]);
    const admin = await createUser('Talk Admin');
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [admin]);
    const r = (await as(admin).patch('/admin/conversation-settings', { replySuggestionsEnabled: true, kindClosingsEnabled: true })).json().settings;
    expect(r).toMatchObject({ reply_suggestions_enabled: true, kind_closings_enabled: true, trouble_nudge_enabled: false });
    expect((await as(await createUser('Talk Member')).get('/admin/conversation-settings')).statusCode).toBe(403);
    await all(false);
  });

  it('members opt in for themselves and pick a greeting pack', async () => {
    const u = await createUser('Talk Prefs');
    expect((await as(u).get('/me/conversation-prefs')).json().prefs).toEqual({ replySuggestions: false, troubleNudge: false, kindClosings: false, greetingPack: null, shareCounts: false });
    let p = (await as(u).patch('/me/conversation-prefs', { replySuggestions: true, greetingPack: 'korean' })).json().prefs;
    expect(p).toEqual({ replySuggestions: true, troubleNudge: false, kindClosings: false, greetingPack: 'korean', shareCounts: false });
    p = (await as(u).patch('/me/conversation-prefs', { troubleNudge: true })).json().prefs;
    expect(p.greetingPack).toBe('korean');
    p = (await as(u).patch('/me/conversation-prefs', { greetingPack: null })).json().prefs;
    expect(p).toEqual({ replySuggestions: true, troubleNudge: true, kindClosings: false, greetingPack: null, shareCounts: false });
    expect((await as(u).patch('/me/conversation-prefs', { greetingPack: 'klingon' })).statusCode).toBe(400);
  });

  it('"My meaning words" reorders and hides words for that member only, keeping at least one', async () => {
    await meaningsOn(true);
    const [me, other] = [await createUser('Words Me'), await createUser('Words Other')];
    expect((await as(me).put('/me/meaning-words', { emoji: 'love', defaultMeaning: null, hidden: [] })).statusCode).toBe(400);
    await all(true);
    const love = (await as(me).get('/me/meaning-words')).json().emoji.find((e: { key: string }) => e.key === 'love');
    const keys = love.meanings.map((m: { key: string }) => m.key);
    expect(keys.length).toBeGreaterThan(2);
    await as(me).put('/me/meaning-words', { emoji: 'love', defaultMeaning: keys[2], hidden: [keys[1]] });
    const mine = (await as(me).get('/reaction-meanings')).json().emoji.find((e: { key: string }) => e.key === 'love');
    expect(mine.meanings.map((m: { key: string }) => m.key)).toEqual([keys[2], keys[0], ...keys.slice(3)]);
    const theirs = (await as(other).get('/reaction-meanings')).json().emoji.find((e: { key: string }) => e.key === 'love');
    expect(theirs.meanings.map((m: { key: string }) => m.key)).toEqual(keys);
    expect((await as(me).put('/me/meaning-words', { emoji: 'love', defaultMeaning: null, hidden: keys })).statusCode).toBe(400);
    expect((await as(me).put('/me/meaning-words', { emoji: 'love', defaultMeaning: 'nope', hidden: [] })).statusCode).toBe(400);
    await all(false);
    expect((await as(me).get('/reaction-meanings')).json().emoji.find((e: { key: string }) => e.key === 'love').meanings.map((m: { key: string }) => m.key)).toEqual(keys);
  });
});

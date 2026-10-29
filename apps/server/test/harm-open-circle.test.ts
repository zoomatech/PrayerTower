// The harmful-prayer check and its review queue on Open Circle, the secular edition:
// the same holds, reviews and floods, and nothing the member reads has a religious word.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as harm from '../src/modules/harm/index.js';
import { as, createUser, db } from './helpers.js';

const RELIGIOUS = /\b(pray\w*|god|lord|jesus|church|pastors?|priestly|scripture|psalms?|romans|blessed)\b/i;
const harmDefaults = await harm.settings(db);
let admin: string;
let moderator: string;

beforeAll(async () => {
  admin = await createUser('OC Harm Admin');
  moderator = await createUser('OC Harm Moderator');
  await grantRole(db, admin, 'admin', null);
  await grantRole(db, moderator, 'moderator', null);
  await as(admin).patch('/admin/communities/open-circle', { status: 'active' });
  await harm.updateSettings(db, { enabled: true, flood_per_day: 2 });
});
afterAll(async () => {
  await harm.updateSettings(db, harmDefaults);
  await db.query(`update public.communities set status = 'hidden', hidden_features = '{}' where slug = 'open-circle'`);
  await db.end();
});

async function member(name: string) {
  const id = await createUser(name);
  await as(id).post('/me/community', { slug: 'open-circle' });
  return id;
}
const post = (id: string, body: string) => as(id).post('/posts', { postType: 'prayer_request', body });
const item = async (targetId: string) =>
  (await as(moderator).get(`/moderation/queue?targetId=${targetId}`)).json().items.find((i: { source: string }) => i.source === 'harm');

describe('harmful requests on Open Circle', () => {
  it('reviews a wish for harm, with a redirect that has no religious words', async () => {
    const m = await member('OC Wronged');
    const res = await post(m, 'I hope my ex suffers for what she did.');
    expect(res.json().harm).toMatchObject({ category: 'harm_wish', action: 'review' });
    expect(`${res.json().harm.title} ${res.json().harm.message}`).not.toMatch(RELIGIOUS);
    expect((await item(res.json().post.id)).reason).toBe('Prayer for someone to be harmed');
    for (const text of ['Help me get revenge on my brother.', 'I curse my neighbor.', 'All immigrants should be wiped out.']) {
      const pre = (await as(m).post('/moderation/precheck', { text })).json().harm;
      expect(`${pre.title} ${pre.message}`).not.toMatch(RELIGIOUS);
    }
  });

  it('holds a threat for a moderator, and tells the member in secular words', async () => {
    const m = await member('OC Furious');
    const res = await post(m, "I'm going to hurt him.");
    const id = res.json().post.id;
    expect((await db.query('select moderation_status from public.posts where id = $1', [id])).rows[0].moderation_status).toBe('hidden_pending_review');
    expect((await item(id)).auto_hidden).toBe(true);
    const { rows } = await db.query(`select title, body from public.notifications where user_id = $1 and kind = 'held_for_review'`, [m]);
    expect(rows).toHaveLength(1);
    expect(`${rows[0].title} ${rows[0].body}`).not.toMatch(RELIGIOUS);
  });

  it('supports an abuse disclosure and refuses pure junk, in secular words', async () => {
    const m = await member('OC Survivor');
    const res = await post(m, 'My boyfriend hits me and I am scared to go home.');
    expect(res.json().harm).toMatchObject({ category: 'abuse_disclosure', action: 'support' });
    const { rows } = await db.query(`select title, body from public.notifications where user_id = $1 and kind = 'support_resources'`, [m]);
    expect(`${rows[0].title} ${rows[0].body}`).not.toMatch(RELIGIOUS);
    const junk = await post(m, 'fuck shit fuck bitch');
    expect(junk.statusCode).toBe(422);
    expect(junk.json().message).not.toMatch(RELIGIOUS);
  });

  it('bundles a flood the same way', async () => {
    const troll = await member('OC Troll');
    for (const who of ['him', 'her', 'them', 'my boss']) await post(troll, `I hope ${who} dies.`);
    const floods = (await as(moderator).get('/moderation/harm-floods')).json().floods;
    expect(floods.find((f: { user_id: string }) => f.user_id === troll)).toMatchObject({ items: 2 });
  });
});

// Open Circle versions of the kindness and growth features: every notice they send
// reaches an Open Circle member with no religious words ("thinking of you" in place
// of prayer), while faith-community members keep the faith wording.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { notify } from '../src/modules/notifications/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const RELIGIOUS = /\b(pray\w*|god|lord|jesus|church|pastors?|priestly|scripture|bless\w*|amen|faith)\b/i;
const practices = (on: boolean) =>
  db.query('update public.practice_settings set ask_kindly_enabled = $1, mend_enabled = $1, believe_enabled = $1', [on]);

let member = '';
beforeAll(async () => {
  const admin = await createUser('OCK Admin');
  await grantRole(db, admin, 'admin', null);
  await as(admin).patch('/admin/communities/open-circle', { status: 'active' });
  member = await createUser('OCK Member');
  await as(member).post('/me/community', { slug: 'open-circle' });
  await practices(true);
});
afterAll(async () => {
  await practices(false);
  await db.query(`update public.communities set status = 'hidden' where slug = 'open-circle'`);
  await db.end();
});

const notices = async (userId: string) =>
  (await db.query<{ kind: string; title: string; body: string }>('select kind, title, body from public.notifications where user_id = $1 order by created_at', [userId])).rows;

describe('Open Circle kindness and growth notices', () => {
  it('answered, Believe, ask kindly and Mend notices have no religious words', async () => {
    // Both in Open Circle, since comments stay inside a community.
    const poster = await createUser('OCK Poster');
    await as(poster).post('/me/community', { slug: 'open-circle' });
    const post = await newRequest(poster, 'Please keep my mom in mind, her surgery is Friday.');
    await db.query(`insert into public.prayer_events (post_id, user_id, kind) values ($1, $2, 'praying_now')`, [post.id, member]);
    await as(poster).post(`/posts/${post.id}/answered`, {});

    const comment = (await as(member).post(`/posts/${post.id}/comments`, { body: 'You should have prayed harder.' })).json().comment.id;
    await as(poster).post(`/comments/${comment}/ask-kindly`, { reason: 'grief' });
    await as(poster).post(`/comments/${comment}/mend`);

    const got = await notices(member);
    expect(got.map((n) => n.kind)).toEqual(expect.arrayContaining(['answered', 'kind_ask', 'mend_invite']));
    for (const n of got) expect(`${n.title} ${n.body}`).not.toMatch(RELIGIOUS);
  });

  it('follow-up, gratitude and encourager wording is neutral too, and stays faith-worded elsewhere', async () => {
    const faith = await createUser('OCK Faith');
    const sent = [
      { kind: 'followup', title: "Share how it's going?", body: '3 people prayed for your request. If you\'d like, let them know how it\'s going. No pressure at all.' },
      { kind: 'followup_update', title: 'An update on a request you prayed for', body: 'Sam shared how it\'s going: "Much better, thank you."' },
      { kind: 'gratitude', title: 'Three good things', body: 'What went well this week, big or small? A minute to notice it, just for you.' },
      // A member's own quoted words are theirs and stay as written; only our wording changes.
      { kind: 'encourager', title: 'Someone new would welcome encouragement', body: 'Sam is new here and asked for an encourager. A kind word when you can is all it takes.' },
    ];
    const fresh = await createUser('OCK Fresh');
    await as(fresh).post('/me/community', { slug: 'open-circle' });
    for (const n of sent) for (const id of [fresh, faith]) await notify(db, id, n);
    for (const n of await notices(fresh)) expect(`${n.title} ${n.body}`).not.toMatch(RELIGIOUS);
    expect((await notices(faith)).map((n) => n.body).join(' ')).toMatch(/prayed/);
  });
});

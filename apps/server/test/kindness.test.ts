// The kind cloud (modules/kindness): a gentle "Are you sure?" that never stops a post
// (a person reviews anything before it is blocked), and only while the switch is on.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assess } from '../src/modules/kindness/index.js';
import * as notebook from '../src/modules/notebook/index.js';
import { as, createUser, db, newRequest, setClassifier } from './helpers.js';

const setOn = (on: boolean) => db.query('update public.notebook_settings set kind_cloud_enabled = $1', [on]);
beforeAll(() => setOn(false));
afterAll(async () => {
  await setOn(false);
  await db.end();
});

describe('the word rules', () => {
  it.each([
    'Please pray for my father, surgery on Tuesday.',
    "Why God, why? This f***ing cancer took my mom and I'm so scared.",
    "I'm so damn tired of hurting.",
    'Shit. The scan came back bad.',
    'I will find you a church near you.',
    'I f***ing love you, sister. Praying.',
    'AMEN!',
    'Deliver us from evil.',
  ])('lets "%s" through without a cloud', (text) => {
    expect(assess(text)).toEqual({ level: 'ok' });
  });

  it.each([
    ['You are an idiot.', 'aimed'],
    ['Screw you and your prayers', 'aimed'],
    ['f*** you', 'aimed'],
    ['Shut up already', 'aimed'],
    ['WHY WOULD ANYONE EVER BELIEVE THIS NONSENSE', 'shouting'],
  ])('raises the cloud for "%s" (%s)', (text, reason) => {
    expect(assess(text)).toEqual({ level: 'nudge', reason });
  });

  it.each([
    ["I'm going to kill you.", 'threat'],
    ['I know where you live.', 'threat'],
    ['just kys', 'threat'],
    ['I hope you die', 'threat'],
    ['fuck this shit, fucking bitch bastard', 'foul'],
  ])('asks more firmly about "%s" (%s)', (text, reason) => {
    expect(assess(text)).toEqual({ level: 'strong', reason });
  });

  it('never treats a person in crisis as a threat', () => {
    expect(assess('I want to kill myself.').level).not.toBe('strong');
  });
});

describe('the switch', () => {
  it('is off by default: the pre-check has no cloud', async () => {
    expect((await notebook.features(db)).kindCloud).toBe(false);
    const u = await createUser('Kind Off');
    expect((await as(u).post('/moderation/precheck', { text: 'You are an idiot.' })).json()).toEqual({ warn: false });
  });

  it('when on, never refuses a post, a comment, encouragement or a message', async () => {
    await setOn(true);
    const [u, friend] = [await createUser('Kind On'), await createUser('Kind Friend')];
    expect((await as(u).post('/posts', { postType: 'prayer_request', body: "This f***ing cancer. I'm so scared." })).statusCode).toBe(201);
    expect((await as(u).post('/posts', { postType: 'prayer_request', body: 'I know where you live.' })).statusCode).toBe(201);
    const post = await newRequest(friend, 'Please pray for my job interview.');
    expect((await as(u).post(`/posts/${post.id}/comments`, { body: 'fuck fuck shit bitch bastard' })).statusCode).toBe(201);
    expect((await as(u).post(`/posts/${post.id}/reactions`, { kind: 'encouragement', note: 'You are an idiot' })).statusCode).toBe(201);
    await setOn(false);
  });

  it('when on, the pre-check carries the cloud, and an AI flag raises a nudge', async () => {
    await setOn(true);
    const u = await createUser('Kind Precheck');
    expect((await as(u).post('/moderation/precheck', { text: 'Praying for you.' })).json()).toEqual({ warn: false, cloud: { level: 'ok' } });
    expect((await as(u).post('/moderation/precheck', { text: 'You are an idiot.' })).json()).toEqual({ warn: false, cloud: { level: 'nudge', reason: 'aimed' } });
    expect((await as(u).post('/moderation/precheck', { text: 'watch your back' })).json().cloud).toEqual({ level: 'strong', reason: 'threat' });
    setClassifier(async () => ({ flagged: true, categories: { harassment: true }, category_scores: { harassment: 0.9 } }));
    expect((await as(u).post('/moderation/precheck', { text: 'Your church is a joke.' })).json()).toEqual({ warn: true, cloud: { level: 'nudge', reason: 'aimed' } });
    setClassifier(async () => null);
    await setOn(false);
  });
});

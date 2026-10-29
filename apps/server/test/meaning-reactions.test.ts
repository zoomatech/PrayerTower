// Emoji reactions that say something: a tap adds an emoji's first meaning as a leaf,
// a long-press picks one of up to five. One meaning per emoji per member per post.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as notebook from '../src/modules/notebook/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const setOn = (on: boolean) => db.query('update public.notebook_settings set meaning_reactions_enabled = $1', [on]);
beforeAll(() => setOn(false));
afterAll(async () => {
  await setOn(false);
  await db.end();
});

describe('Emoji meanings', () => {
  it('are refused while off', async () => {
    expect((await notebook.features(db)).meaningReactions).toBe(false);
    const u = await createUser('Meaning Off');
    const post = await newRequest(u);
    expect((await as(u).get('/reaction-meanings')).statusCode).toBe(400);
    expect((await as(u).put(`/posts/${post.id}/meanings`, { emoji: 'strength', meaning: 'feel_better' })).statusCode).toBe(400);
  });

  it('offer six emoji with up to five positive meanings each, in faith and neutral wording', async () => {
    await setOn(true);
    const u = await createUser('Meaning Tree');
    const tree = (await as(u).get('/reaction-meanings')).json().emoji;
    expect(tree.map((e: { emoji: string }) => e.emoji)).toEqual(['🙏', '❤️', '🫂', '💪', '🎉', '🕯️']);
    for (const e of tree) expect(e.meanings.length).toBeLessThanOrEqual(5);
    expect(tree[3].meanings[0]).toEqual({ key: 'feel_better', label: 'Feel better', neutralLabel: 'Feel better' });
    expect(tree[0].meanings[0]).toEqual({ key: 'praying_for_you', label: 'Praying for you', neutralLabel: 'Thinking of you' });
  });

  it('add leaves with counts; a second meaning of the same emoji replaces the first; removing takes it off', async () => {
    await setOn(true);
    const [poster, a, b] = [await createUser('Meaning Poster'), await createUser('Meaning A'), await createUser('Meaning B')];
    const post = await newRequest(poster, 'Chemo starts Monday.');
    await as(a).put(`/posts/${post.id}/meanings`, { emoji: 'strength', meaning: 'feel_better' });
    await as(b).put(`/posts/${post.id}/meanings`, { emoji: 'strength', meaning: 'feel_better' });
    let leaves = (await as(a).put(`/posts/${post.id}/meanings`, { emoji: 'support', meaning: 'not_alone' })).json().leaves;
    expect(leaves).toEqual([
      { emoji: 'strength', icon: '💪', meaning: 'feel_better', label: 'Feel better', neutralLabel: 'Feel better', count: 2, mine: true },
      { emoji: 'support', icon: '🫂', meaning: 'not_alone', label: "You're not alone", neutralLabel: "You're not alone", count: 1, mine: true },
    ]);
    leaves = (await as(b).put(`/posts/${post.id}/meanings`, { emoji: 'strength', meaning: 'stay_strong' })).json().leaves;
    expect(leaves.map((l: { meaning: string; count: number }) => [l.meaning, l.count])).toEqual([
      ['feel_better', 1],
      ['stay_strong', 1],
      ['not_alone', 1],
    ]);
    expect((await as(poster).get(`/posts/${post.id}/meanings`)).json().leaves.every((l: { mine: boolean }) => !l.mine)).toBe(true);
    leaves = (await as(a).delete(`/posts/${post.id}/meanings/strength`)).json().leaves;
    expect(leaves.map((l: { meaning: string }) => l.meaning)).toEqual(['stay_strong', 'not_alone']);
    expect((await as(a).put(`/posts/${post.id}/meanings`, { emoji: 'strength', meaning: 'delicious' })).statusCode).toBe(400);
    await setOn(false);
  });
});

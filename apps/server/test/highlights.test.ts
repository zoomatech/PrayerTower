import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

describe('highlights', () => {
  it('shows the most-prayed requests and top warriors, respecting anonymity and never sensitive posts', async () => {
    const poster = await createUser('Highlight Poster');
    const popular = await newRequest(poster, 'Pray for the highlight test family.');
    const sensitive = await newRequest(poster, 'Graphic highlight test.', { isSensitive: true });
    const named = await createUser('Named Warrior');
    const hidden = await createUser('Hidden Warrior');
    await as(hidden).patch('/me', { anonymousByDefault: true });
    // Enough prayers to beat anything else in the shared test database this week.
    const extra = await Promise.all(Array.from({ length: 30 }, (_, i) => createUser(`Extra ${i}`)));
    for (const u of [named, hidden, ...extra]) {
      await as(u).post(`/posts/${popular.id}/praying-now`);
      await as(u).post(`/posts/${sensitive.id}/praying-now`);
    }
    const h = (await as(poster).get('/highlights')).json();
    expect(h.topPrayers[0]).toMatchObject({ prayers: 32, card: { id: popular.id } });
    expect(h.topPrayers.some((t: { card: { id: string } }) => t.card.id === sensitive.id)).toBe(false);
    const names = h.topWarriors.map((w: { displayName: string }) => w.displayName);
    expect(names).not.toContain('Hidden Warrior');
    expect(JSON.stringify(h)).not.toContain(hidden);
  });
});

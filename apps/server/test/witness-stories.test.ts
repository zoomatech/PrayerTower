import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.query('update public.notebook_settings set witness_stories_enabled = false');
  await db.end();
});

const story = 'A family behind on rent got two months covered by a partner church, and their kids stayed in their school.';

describe('witness stories', () => {
  it('shares a story of help only after the person helped says yes, and never with their name', async () => {
    const witness = await createUser('Witness Will');
    const helped = await createUser('Helped Hannah');
    const reader = await createUser('Reader Ray');
    await grantRole(db, witness, 'witness', null);
    const post = await newRequest(helped, 'We are about to lose our apartment. Please pray.');
    const { caseId } = (await as(witness).post(`/posts/${post.id}/witness`, { note: 'Sincere.' })).json();

    // Off by default.
    expect((await as(witness).post(`/witness/cases/${caseId}/story`, { body: story })).statusCode).toBe(403);
    expect((await as(reader).get('/help-stories')).json()).toEqual({ enabled: false, stories: [] });
    await db.query('update public.notebook_settings set witness_stories_enabled = true');

    // Only Witness staff, and only once help is logged.
    expect((await as(reader).post(`/witness/cases/${caseId}/story`, { body: story })).statusCode).toBe(403);
    expect((await as(witness).post(`/witness/cases/${caseId}/story`, { body: story })).statusCode).toBe(400);
    await as(witness).post(`/witness/cases/${caseId}/notes`, { body: 'Rent paid via partner church.', helpKind: 'rent' });
    const drafted = await as(witness).post(`/witness/cases/${caseId}/story`, { body: story });
    expect(drafted.statusCode).toBe(201);
    expect((await as(witness).post(`/witness/cases/${caseId}/story`, { body: story })).statusCode).toBe(409);

    // Nothing shows until Hannah approves.
    expect((await as(reader).get('/help-stories')).json().stories.some((s: { id: string }) => s.id === drafted.json().id)).toBe(false);
    const notice = (await as(helped).get('/me/notifications')).json().notifications.find((n: { kind: string }) => n.kind === 'witness_story');
    expect(notice.title).toBe('May we share how you were helped?');
    const mine = (await as(helped).get('/me/witness-stories')).json().stories;
    expect(mine[0]).toMatchObject({ body: story, status: 'awaiting_consent' });
    expect((await as(reader).post(`/me/witness-stories/${mine[0].id}/decision`, { approve: true })).statusCode).toBe(404);
    await as(helped).post(`/me/witness-stories/${mine[0].id}/decision`, { approve: true });
    const shown = (await as(reader).get('/help-stories')).json();
    const s = shown.stories.find((x: { id: string }) => x.id === mine[0].id);
    expect(s.body).toBe(story);
    expect(JSON.stringify(s)).not.toContain('Hannah');

    // She can take it back at any time.
    await as(helped).post(`/me/witness-stories/${mine[0].id}/decision`, { approve: false });
    expect((await as(reader).get('/help-stories')).json().stories.some((x: { id: string }) => x.id === mine[0].id)).toBe(false);
  });
});

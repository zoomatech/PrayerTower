import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

describe('witness team', () => {
  it('flags a sincere need, keeps notes, and logs help sent', async () => {
    const poster = await createUser('Single Mom');
    const witness = await createUser('Witness Wendy');
    const member = await createUser('Plain Member');
    await grantRole(db, witness, 'witness', null);
    const post = await newRequest(poster, 'Pray for us, the power was shut off and the kids are cold.', { isAnonymous: true });

    expect((await as(member).post(`/posts/${post.id}/witness`, { note: 'x' })).statusCode).toBe(403);
    expect((await as(member).get('/witness/cases')).statusCode).toBe(403);
    const { caseId } = (await as(witness).post(`/posts/${post.id}/witness`, { note: 'Sounds sincere; local to Ohio.' })).json();
    // Flagging again adds a note to the same case.
    expect((await as(witness).post(`/posts/${post.id}/witness`, { note: 'Checked their earlier posts.' })).json().caseId).toBe(caseId);

    const cases = (await as(witness).get('/witness/cases')).json().cases;
    expect(cases.find((c: { id: string }) => c.id === caseId)).toMatchObject({
      postId: post.id,
      status: 'watching',
      posterName: 'Single Mom',
      anonymousPost: true,
      helpCount: 0,
      lastNote: 'Checked their earlier posts.',
    });

    await as(witness).patch(`/witness/cases/${caseId}`, { status: 'reaching_out', assignToMe: true });
    await as(witness).post(`/witness/cases/${caseId}/notes`, { body: 'Paid the utility bill through a partner church.', helpKind: 'utilities' });
    const after = (await as(witness).get('/witness/cases')).json().cases.find((c: { id: string }) => c.id === caseId);
    expect(after).toMatchObject({ status: 'helped', assignedTo: 'Witness Wendy', helpCount: 1 });
    const notes = (await as(witness).get(`/witness/cases/${caseId}/notes`)).json().notes;
    expect(notes.map((n: { helpKind: string | null }) => n.helpKind)).toEqual([null, null, 'utilities']);

    await as(witness).patch(`/witness/cases/${caseId}`, { status: 'closed' });
    expect((await as(witness).get('/witness/cases')).json().cases.some((c: { id: string }) => c.id === caseId)).toBe(false);
    expect((await as(witness).get('/witness/cases?status=closed')).json().cases.some((c: { id: string }) => c.id === caseId)).toBe(true);
  });
});

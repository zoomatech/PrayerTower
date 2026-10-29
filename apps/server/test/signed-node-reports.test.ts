import { createHash, createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as nodes from '../src/modules/radio/nodes.js';
import { app, as, createUser, db } from './helpers.js';

const requiredDefault = await nodes.signaturesRequired(db);
let admin: string;
let key: string;
beforeAll(async () => {
  admin = await createUser('Signed Reports Admin');
  await grantRole(db, admin, 'admin', null);
  key = (await as(admin).post('/admin/radio-nodes', { name: 'Signed listener' })).json().key;
});
afterAll(async () => {
  await nodes.setSignaturesRequired(db, requiredDefault);
  await db.end();
});

/** What a listener node with LISTEN_SIGN=on sends (apps/station/src/listener.ts). */
function signed(path: string, body: object, ts: number, k = key) {
  const secret = createHash('sha256').update(k).digest('hex');
  const text = JSON.stringify(body);
  return {
    method: 'POST' as const,
    url: path,
    headers: { 'content-type': 'application/json', 'x-node-kid': secret.slice(0, 16), 'x-node-ts': String(ts), 'x-node-sig': createHmac('sha256', secret).update(`${ts}\nPOST\n${path}\n${text}`).digest('hex') },
    payload: text,
  };
}

describe('signed listener reports', () => {
  it('accepts a signed request, and refuses a replay, a stale one and a forged one', async () => {
    const now = Date.now();
    expect((await app.inject(signed('/node/heartbeat', {}, now))).statusCode).toBe(200);
    // The same request again is a replay.
    expect((await app.inject(signed('/node/heartbeat', {}, now))).json().error).toBe('replayed');
    expect((await app.inject(signed('/node/heartbeat', {}, now + 1))).statusCode).toBe(200);
    // Ten minutes old.
    expect((await app.inject(signed('/node/heartbeat', {}, now - 600_000))).statusCode).toBe(401);
    // Signed with the wrong key, or with a changed body.
    expect((await app.inject(signed('/node/heartbeat', {}, now + 2, 'ptn_wrong'))).statusCode).toBe(401);
    const tampered = signed('/node/heartbeat', {}, now + 3);
    expect((await app.inject({ ...tampered, payload: JSON.stringify({ location: { lat: 1, lon: 1 } }) })).statusCode).toBe(401);
    expect(nodes.keyId(key)).toBe(signed('/x', {}, 1).headers['x-node-kid']);
  });

  it('can require signatures: the plain key alone is then refused', async () => {
    expect((await app.inject({ method: 'POST', url: '/node/heartbeat', headers: { 'x-node-key': key }, payload: {} })).statusCode).toBe(200);
    const res = await as(admin).patch('/admin/radio-nodes', { signaturesRequired: true });
    expect(res.json()).toMatchObject({ signaturesRequired: true });
    const plain = await app.inject({ method: 'POST', url: '/node/heartbeat', headers: { 'x-node-key': key }, payload: {} });
    expect(plain.statusCode).toBe(401);
    expect(plain.json().error).toBe('signature_required');
    expect((await app.inject(signed('/node/heartbeat', {}, Date.now() + 10))).statusCode).toBe(200);
    await as(admin).patch('/admin/radio-nodes', { signaturesRequired: false });
  });
});

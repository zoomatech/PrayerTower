import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as nodes from '../src/modules/radio/nodes.js';
import { app, as, createUser, db, STATION_KEY } from './helpers.js';

const defaultOn = await nodes.enabled(db);
const report = (key: string, body: object) => app.inject({ method: 'POST', url: '/node/channel-report', headers: { 'x-node-key': key }, payload: body });
const channel = (callSign: string, key = STATION_KEY) => app.inject({ method: 'GET', url: `/station/channel?callSign=${callSign}`, headers: { 'x-station-key': key } });

let admin: string;
beforeAll(async () => {
  admin = await createUser('Nodes Admin');
  await grantRole(db, admin, 'admin', null);
  await db.query('delete from public.radio_nodes');
});
afterAll(async () => {
  await nodes.setEnabled(db, defaultOn);
  await db.query('delete from public.radio_nodes');
  await db.end();
});

describe('listener nodes', () => {
  it('are off by default; admins add nodes and see each key once', async () => {
    expect(defaultOn).toBe(false);
    const outsider = await createUser('Not Nodes Admin');
    expect((await as(outsider).post('/admin/radio-nodes', { name: 'Hill' })).statusCode).toBe(403);
    const made = await as(admin).post('/admin/radio-nodes', { name: 'Hilltop Pi' });
    expect(made.statusCode).toBe(201);
    const { node, key } = made.json();
    expect(key).toMatch(/^ptn_[0-9a-f]{48}$/);
    expect(node).toMatchObject({ name: 'Hilltop Pi', role: 'listener', enabled: true });
    const listed = (await as(admin).get('/admin/radio-nodes')).json();
    expect(listed.enabled).toBe(false);
    expect(JSON.stringify(listed)).not.toContain(key);
    // Off: reports are refused and the station gets nothing.
    expect((await report(key, { callSign: 'N0CALL', preset: 'fm-standard', snrDb: 20 })).statusCode).toBe(404);
  });

  it('take reports with a valid key, and give the station the weakest fresh one', async () => {
    await as(admin).patch('/admin/radio-nodes', { enabled: true });
    const a = (await as(admin).post('/admin/radio-nodes', { name: 'Valley Pi' })).json();
    const b = (await as(admin).post('/admin/radio-nodes', { name: 'Town Pi' })).json();
    expect((await channel('N0CALL')).statusCode).toBe(204);
    expect((await report('ptn_wrong', { callSign: 'N0CALL', preset: 'fm-standard', snrDb: 20 })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/node/channel-report', payload: { callSign: 'N0CALL', preset: 'x', snrDb: 1 } })).statusCode).toBe(401);
    expect((await report(a.key, { callSign: 'N0CALL', preset: 'fm-standard', snrDb: 'loud' })).statusCode).toBe(400);
    expect((await report(a.key, { callSign: 'n0call', preset: 'fm-standard', snrDb: 25.04 })).statusCode).toBe(200);
    expect((await report(b.key, { callSign: 'N0CALL', preset: 'fm-standard', snrDb: 9 })).statusCode).toBe(200);
    // Each listener's latest counts: Town's newer, stronger report replaces its weak one.
    expect((await channel('N0CALL')).json()).toMatchObject({ snrDb: 9, callSign: 'N0CALL', preset: 'fm-standard', listeners: 2 });
    await report(b.key, { callSign: 'N0CALL', preset: 'fm-fast', snrDb: 31 });
    expect((await channel('n0call')).json()).toMatchObject({ snrDb: 25, listeners: 2 });
    expect((await channel('N0CALL', 'wrong-key-wrong-key-wrong-key-00')).statusCode).toBe(401);
    expect((await channel('W1AW')).statusCode).toBe(204);

    // A disabled node's key stops working and its reports stop counting.
    expect((await as(admin).patch(`/admin/radio-nodes/${a.node.id}`, { enabled: false })).json().node.enabled).toBe(false);
    expect((await report(a.key, { callSign: 'N0CALL', preset: 'fm-standard', snrDb: 5 })).statusCode).toBe(401);
    expect((await channel('N0CALL')).json()).toMatchObject({ snrDb: 31, listeners: 1 });
    // Stale reports are ignored.
    await db.query(`update public.channel_reports set heard_at = now() - interval '2 hours'`);
    expect((await channel('N0CALL')).statusCode).toBe(204);

    const admin2 = (await as(admin).get('/admin/radio-nodes')).json();
    expect(admin2.reports.map((r: { node: string }) => r.node).sort()).toEqual(['Town Pi', 'Valley Pi']);
    expect((await as(admin).delete(`/admin/radio-nodes/${b.node.id}`)).statusCode).toBe(200);
    expect((await report(b.key, { callSign: 'N0CALL', preset: 'fm-standard', snrDb: 5 })).statusCode).toBe(401);
  });
});

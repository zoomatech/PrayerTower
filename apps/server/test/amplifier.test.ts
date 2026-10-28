// LIVE AMPLIFIER. Its switch and radio_funding are shared rows, so the "on" cases run in a
// rolled-back transaction and other test files never see them.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as amplifier from '../src/modules/amplifier/index.js';
import * as radio from '../src/modules/radio/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.end();
});

describe('LIVE AMPLIFIER', () => {
  it('is off by default and only admins add operators, by a real-looking call sign', async () => {
    const admin = await createUser('Amp Admin');
    const ham = await createUser('Ham');
    await grantRole(db, admin, 'admin', null);
    expect((await as(ham).get('/amplifier/queue')).statusCode).toBe(403);
    expect((await as(ham).put(`/admin/amplifier/operators/${ham}`, { callSign: 'W1AW' })).statusCode).toBe(403);
    expect((await as(admin).put(`/admin/amplifier/operators/${ham}`, { callSign: 'not a call' })).statusCode).toBe(400);
    const callSign = `K${Math.floor(Math.random() * 10)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${ham.slice(0, 2).replace(/[^a-f]/g, 'A').toUpperCase()}`;
    const res = await as(admin).put(`/admin/amplifier/operators/${ham}`, { callSign: callSign.toLowerCase() });
    expect(res.statusCode).toBe(200);
    expect(res.json().operator.call_sign).toBe(callSign);
    // Still off: an operator gets nothing until an admin turns it on.
    expect((await as(ham).get('/amplifier/queue')).statusCode).toBe(403);
    expect((await as(admin).get('/admin/amplifier-settings')).json().settings).toMatchObject({ enabled: false, require_free: true });
    expect((await as(admin).delete(`/admin/amplifier/operators/${ham}`)).statusCode).toBe(200);
  });

  it('when on, lets an operator claim, read and release prayers, and tells the poster', async () => {
    const [admin, poster, sender, ham, ham2, member] = [
      await createUser('Amp Admin'),
      await createUser('Amp Poster'),
      await createUser('Amp Sender'),
      await createUser('Amp Ham'),
      await createUser('Amp Ham Two'),
      await createUser('Amp Member'),
    ];
    const post = await newRequest(poster, 'Please pray for rain on our dry farm this month.');
    const c = await db.connect();
    try {
      await c.query('begin');
      await c.query(`update public.token_settings set radio_funding = 'free'`);
      await amplifier.updateSettings(c, { enabled: true, readsPerPrayer: 1 });
      await amplifier.setOperator(c, admin, ham, { callSign: 'N0PRAY' });
      await amplifier.setOperator(c, admin, ham2, { callSign: 'N0AMEN' });
      const rp = await radio.queue(c, sender, post.id, `amp:${post.id}`);
      await expect(amplifier.queue(c, member)).rejects.toThrow('Only licensed operators');

      const q1 = await amplifier.queue(c, ham);
      expect(q1.find((p) => p.id === rp.id)?.text).toBe('Please pray for rain on our dry farm this month.');
      expect(JSON.stringify(q1)).not.toContain('Amp Poster');

      const reading = await amplifier.claim(c, ham, rp.id);
      // One read per prayer: it's gone from the other operator's queue while claimed.
      expect((await amplifier.queue(c, ham2)).some((p) => p.id === rp.id)).toBe(false);
      await expect(amplifier.claim(c, ham2, rp.id)).rejects.toThrow('no longer in the queue');

      await amplifier.release(c, ham, reading.id);
      expect((await amplifier.queue(c, ham2)).some((p) => p.id === rp.id)).toBe(true);
      const again = await amplifier.claim(c, ham, rp.id);
      await amplifier.markRead(c, ham, again.id, { onAirNote: '40 m net' });
      await expect(amplifier.markRead(c, ham, again.id, {})).rejects.toThrow('already read');
      const { rows } = await c.query(`select title from public.notifications where user_id = $1 and kind = 'live_amplifier_read'`, [poster]);
      expect(rows).toHaveLength(1);

      // 97.113: nothing is read while radio prayers are paid for.
      await c.query(`update public.token_settings set radio_funding = 'tokens'`);
      await expect(amplifier.queue(c, ham)).rejects.toThrow('97.113');
    } finally {
      await c.query('rollback');
      c.release();
    }
  });
});

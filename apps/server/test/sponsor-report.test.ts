import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { toHtml, weeklySponsorReportTask } from '../src/modules/admin/sponsor-report.js';
import type { Mail } from '../src/modules/digest/mailer.js';
import { as, createUser, db, newRequest } from './helpers.js';
import { languages } from '../src/language.js';

// These tests check the Spanish text, which members see only with SPANISH_ENABLED=1.
languages.spanish = true;

afterAll(async () => {
  await db.end();
});

const logger = { info: () => {}, error: () => {} };

describe('sponsor pilot report', () => {
  it('downloads as a printable HTML page with counts and no request text', async () => {
    const admin = await createUser('Phoebe');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Lydia');
    await newRequest(member, 'Secret family matter, please pray.');

    const res = await as(admin).get('/admin/pilot-report?weeks=4&format=html');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['content-disposition']).toContain('prayer-tower-pilot-report.html');
    expect(res.body).toContain('<title>Prayer Tower pilot report</title>');
    expect(res.body).toContain('4 weeks');
    expect(res.body).toContain('<svg');
    expect(res.body).not.toContain('Secret family matter');
    expect(res.body).not.toContain('Lydia');

    const es = await as(admin).get('/admin/pilot-report?weeks=2&format=html&lang=es');
    expect(es.body).toContain('Informe del piloto de Prayer Tower');
    expect((await as(member).get('/admin/pilot-report?format=html')).statusCode).toBe(403);
  });

  it('compares the last full week with the one before and escapes text', () => {
    const week = (week_start: string, n: number) => ({
      week_start, new_members: n, requests_posted: n, prayers_answered: 0, praying_now_taps: n, active_pray_ers: n,
      commitments_made: 0, commitment_checkins: 0, encouragements: 0, moderation_items: 0, removals: 0,
    });
    const html = toHtml([week('2026-10-12', 3), week('2026-10-19', 5), week('<b>', 1)]);
    expect(html).toContain('+2 vs the week before');
    expect(html).toContain('&#60;b&#62;');
    expect(html).not.toContain('<td><b>');
  });

  it('emails sponsors on Monday only when addresses and SMTP are set', async () => {
    const outbox: Mail[] = [];
    const mailer = async (m: Mail) => void outbox.push(m);
    await weeklySponsorReportTask(db, mailer, [])({}, { logger } as never);
    await weeklySponsorReportTask(db, null, ['board@example.org'])({}, { logger } as never);
    expect(outbox).toHaveLength(0);
    await weeklySponsorReportTask(db, mailer, ['board@example.org', 'pastor@example.org'])({}, { logger } as never);
    expect(outbox.map((m) => m.to)).toEqual(['board@example.org', 'pastor@example.org']);
    expect(outbox[0]!.subject).toMatch(/^Prayer Tower pilot report, week of \d{4}-\d{2}-\d{2}$/);
    expect(outbox[0]!.html).toContain('<table>');
  });
});

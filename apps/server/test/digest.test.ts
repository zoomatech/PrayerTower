import { afterAll, describe, expect, it } from 'vitest';
import { isoWeek, sendDigests } from '../src/modules/digest/index.js';
import type { Mail } from '../src/modules/digest/mailer.js';
import { as, createUser, db, newRequest } from './helpers.js';
import { languages } from '../src/language.js';

// These tests check the Spanish text, which members see only with SPANISH_ENABLED=1.
languages.spanish = true;

afterAll(async () => {
  await db.end();
});

describe('weekly email digest', () => {
  it('is off by default, then emails answered prayers and promises once a week', async () => {
    const poster = await createUser('Hannah');
    const member = await createUser('Eli');
    const quiet = await createUser('Samuel');
    const post = await newRequest(poster, 'Please pray we can have a child.');
    await as(member).post(`/posts/${post.id}/praying-now`, {});
    await as(member).post(`/posts/${post.id}/commitments`, { frequency: 'daily', vowText: 'Every morning.' });
    expect((await as(poster).post(`/posts/${post.id}/answered`, {})).statusCode).toBe(200);

    const week = `test-${isoWeek()}-${member}`;
    const outbox: Mail[] = [];
    const mailer = async (m: Mail) => void outbox.push(m);

    // Nobody has turned it on yet.
    await sendDigests(db, mailer, week);
    expect(outbox.filter((m) => m.to.startsWith(member))).toHaveLength(0);

    expect((await as(member).patch('/me', { digestEnabled: true })).json().profile.digest_enabled).toBe(true);
    await as(quiet).patch('/me', { digestEnabled: true, locale: 'es' });
    await sendDigests(db, mailer, week);
    const mine = outbox.filter((m) => m.to === `${member}@test.local`);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.subject).toBe('Your week in prayer');
    expect(mine[0]!.text).toContain('Please pray we can have a child.');
    expect(mine[0]!.text).toContain('You prayed 1 time for 1 request.');
    expect(mine[0]!.html).toContain('<li>Please pray we can have a child.</li>');
    // A member with nothing this week gets no email.
    expect(outbox.some((m) => m.to === `${quiet}@test.local`)).toBe(false);

    // Once per week.
    await sendDigests(db, mailer, week);
    expect(outbox.filter((m) => m.to === `${member}@test.local`)).toHaveLength(1);

    // Spanish for Spanish readers.
    await as(poster).patch('/me', { digestEnabled: true, locale: 'es' });
    await sendDigests(db, mailer, week);
    const es = outbox.find((m) => m.to === `${poster}@test.local`)!;
    expect(es.subject).toBe('Tu semana en oración');
    expect(es.text).toContain('(tu petición)');
  });

  it('does nothing without SMTP', async () => {
    expect(await sendDigests(db, null)).toEqual({ sent: 0, skipped: 0 });
  });
});

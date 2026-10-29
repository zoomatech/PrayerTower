import { afterAll, describe, expect, it } from 'vitest';
import { buildDigest, isoWeek, sendDigests } from '../src/modules/digest/index.js';
import { sendEach, type Mail } from '../src/modules/digest/mailer.js';
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

  it('keeps sending after one address fails, and the retry sends only that one', async () => {
    const poster = await createUser('Digest Lois');
    const bad = await createUser('Digest Eunice');
    const good = await createUser('Digest Timothy');
    const post = await newRequest(poster, 'Pray for our long drive home.');
    for (const m of [bad, good]) {
      await as(m).post(`/posts/${post.id}/praying-now`, {});
      await as(m).patch('/me', { digestEnabled: true });
    }
    const week = `test-fail-${isoWeek()}-${good}`;
    const outbox: Mail[] = [];
    let refuse = true;
    const mailer = async (m: Mail) => {
      if (refuse && m.to === `${bad}@test.local`) throw new Error('mailbox unavailable');
      outbox.push(m);
    };
    await expect(sendDigests(db, mailer, week)).rejects.toThrow(/emails failed \(mailbox unavailable\)/);
    expect(outbox.filter((m) => m.to === `${good}@test.local`)).toHaveLength(1);
    refuse = false;
    await sendDigests(db, mailer, week);
    expect(outbox.filter((m) => m.to === `${good}@test.local`)).toHaveLength(1);
    expect(outbox.filter((m) => m.to === `${bad}@test.local`)).toHaveLength(1);
  });

  it('never emails a sensitive request, or one across a block', async () => {
    const poster = await createUser('Digest Poster');
    const member = await createUser('Digest Reader');
    const plain = await newRequest(poster, 'Pray for my job interview.');
    const sensitive = await newRequest(poster, 'Pray for my recovery.', { isSensitive: true });
    for (const p of [plain, sensitive]) {
      await as(member).post(`/posts/${p.id}/praying-now`, {});
      await as(poster).post(`/posts/${p.id}/answered`, {});
    }
    expect((await buildDigest(db, member)).answered.map((a) => a.body)).toEqual(['Pray for my job interview.']);
    expect((await buildDigest(db, poster)).answered).toHaveLength(2); // your own requests, always
    await as(poster).put(`/people/${member}/block`);
    expect((await buildDigest(db, member)).answered).toEqual([]);
  });

  it('does nothing without SMTP', async () => {
    expect(await sendDigests(db, null)).toEqual({ sent: 0, skipped: 0 });
  });
});

describe('emails to a short list (sponsors, admins)', () => {
  it('sends to the rest after one fails, and throws only when every send failed', async () => {
    const sent: string[] = [];
    const send = async (to: string) => {
      if (to.startsWith('bad')) throw new Error('refused');
      sent.push(to);
    };
    expect(await sendEach(['a@x.org', 'bad@x.org', 'b@x.org'], send)).toBe(2);
    expect(sent).toEqual(['a@x.org', 'b@x.org']);
    await expect(sendEach(['bad1@x.org', 'bad2@x.org'], send)).rejects.toThrow('refused');
    expect(await sendEach([], send)).toBe(0);
  });
});

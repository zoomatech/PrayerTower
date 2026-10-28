import { afterAll, describe, expect, it } from 'vitest';
import { localize } from '../src/modules/notifications/i18n.js';
import { question } from '../src/modules/prompts/index.js';
import { as, createUser, db, drainJobs, newRequest } from './helpers.js';
import { languages } from '../src/language.js';

// These tests check the Spanish text, which members see only with SPANISH_ENABLED=1.
languages.spanish = true;

afterAll(async () => {
  await db.end();
});

describe('member language', () => {
  it('saves the language and sends notifications in it, falling back to English', async () => {
    const poster = await createUser('Lucía');
    const member = await createUser('Pedro');
    expect((await as(poster).patch('/me', { locale: 'es' })).json().profile.locale).toBe('es');
    expect((await as(poster).patch('/me', { locale: 'fr' })).statusCode).toBe(400);

    const post = await newRequest(poster);
    await as(member).post(`/posts/${post.id}/praying-now`, {});
    await as(member).post(`/posts/${post.id}/commitments`, { frequency: 'daily', vowText: 'Oraré por ti.' });
    await drainJobs();
    const notes = (await as(poster).get('/me/notifications')).json().notifications as { kind: string; title: string; body: string }[];
    expect(notes.find((n) => n.kind === 'praying_now')!.title).toBe('Pedro está orando por ti, Lucía, ahora mismo');
    expect(notes.find((n) => n.kind === 'commitment_made')!.body).toBe('Pedro orará cada día.');

    // English readers keep the English text.
    const english = await createUser('Ann');
    const post2 = await newRequest(english);
    await as(member).post(`/posts/${post2.id}/praying-now`, {});
    await drainJobs();
    const n2 = (await as(english).get('/me/notifications')).json().notifications as { kind: string; title: string }[];
    expect(n2.find((n) => n.kind === 'praying_now')!.title).toBe('Pedro is praying for you, Ann, right now');
  });

  it('has Spanish for every template and prompt', () => {
    expect(localize('es', 'milestone', { label: 'Primera oración', amount: 2, priestly: true })!.body).toBe(
      'Recibiste 2 fichas de bonificación sacerdotales. Gracias por orar.',
    );
    expect(localize('en', 'milestone', {})).toBeNull();
    expect(localize('es', 'no_such_key', {})).toBeNull();
    expect(question('gentle', 'Billy', true, 'es')).toBe('¿Cuándo fue la última vez que oraste por Billy?');
    expect(question('gentle', 'this request', false, 'es')).toBe('¿Orarías por esta petición hoy?');
  });
});

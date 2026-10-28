import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { supabaseJwksVerifier } from '../src/auth.js';
import { config, db } from './helpers.js';

afterAll(() => db.end());

// The local stack's publishable key, from `supabase status`.
function publishableKey(): string {
  if (process.env.SUPABASE_PUBLISHABLE_KEY) return process.env.SUPABASE_PUBLISHABLE_KEY;
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8' });
  return JSON.parse(out.slice(out.indexOf('{'))).PUBLISHABLE_KEY;
}

describe('Supabase Auth end to end', () => {
  // Works whether or not invite-only is on (a valid code passes either way).
  const signUp = (data: Record<string, string>) =>
    fetch(`${config.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: publishableKey(), 'content-type': 'application/json' },
      body: JSON.stringify({ email: `${randomUUID()}@example.com`, password: 'a-long-test-password-1', data }),
    });

  it('signs up through Supabase Auth and calls the API with the real access token', async () => {
    const code = `T${randomUUID().replace(/-/g, '').slice(0, 11).toUpperCase()}`;
    await db.query('insert into public.invite_codes (code) values ($1)', [code]);
    const res = await signUp({ display_name: 'Dana', invite_code: code.toLowerCase() });
    expect(res.status).toBe(200);
    const session = (await res.json()) as { access_token: string; user: { id: string } };

    const app = buildApp({ db, verifyToken: supabaseJwksVerifier(config.SUPABASE_URL) });
    const me = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${session.access_token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().profile).toMatchObject({ id: session.user.id, display_name: 'Dana' });

    const tampered = session.access_token.slice(0, -4) + 'AAAA';
    const bad = await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${tampered}` } });
    expect(bad.statusCode).toBe(401);
  });
});

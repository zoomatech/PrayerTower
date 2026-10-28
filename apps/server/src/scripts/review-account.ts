// The sign-in App Review and Google Play review use (docs/store/REVIEW_NOTES.md).
//
//   REVIEW_PASSWORD='…' npm run review-account -- review@yourdomain.org
//
// Creates the account, or resets its password if it already exists, with the
// email already confirmed (no inbox needed) and onboarding done. It is dated
// past the new-member waiting period; the script prints how many prayers for
// others still lift the remaining new-member limits. It adds no content: staff
// post the sample requests by hand (decision 2026-09-19). Unlike seed:demo, it is meant
// for the hosted project, so it needs that project's DATABASE_URL,
// SUPABASE_URL and SUPABASE_SECRET_KEY.
import { randomBytes } from 'node:crypto';
import { loadConfig, loadDotEnv } from '../config.js';
import { createPool } from '../db.js';

const [email] = process.argv.slice(2);
if (!email || !email.includes('@')) {
  console.error('usage: REVIEW_PASSWORD=… npm run review-account -- <email>');
  process.exit(1);
}

loadDotEnv();
const config = loadConfig();
if (!config.SUPABASE_SECRET_KEY) {
  console.error('Set SUPABASE_SECRET_KEY for the project the reviewers will use.');
  process.exit(1);
}
// Reviewers type it by hand: long, but no characters that are easy to misread.
const password = process.env.REVIEW_PASSWORD || `Pray-${randomBytes(9).toString('base64url').replace(/[-_lIO0]/g, 'x')}`;
const name = process.env.REVIEW_NAME || 'App Review';

const base = `${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users`;
const headers = { apikey: config.SUPABASE_SECRET_KEY, authorization: `Bearer ${config.SUPABASE_SECRET_KEY}`, 'content-type': 'application/json' };
const db = createPool(config.DATABASE_URL);

const { rows } = await db.query<{ id: string }>('select id from auth.users where lower(email) = lower($1)', [email]);
const body = JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: name }, app_metadata: { invite_exempt: true } });
const r = rows[0] ? await fetch(`${base}/${rows[0].id}`, { method: 'PUT', headers, body }) : await fetch(base, { method: 'POST', headers, body });
const user = (await r.json()) as { id?: string; msg?: string; message?: string };
if (!r.ok || !user.id) {
  console.error(`Supabase refused: ${JSON.stringify(user)}`);
  await db.end();
  process.exit(1);
}
await db.query(
  `update public.profiles set display_name = $2, onboarded_at = coalesce(onboarded_at, now()),
     created_at = least(created_at, now() - interval '60 days') where id = $1`,
  [user.id, name],
);
const { rows: limits } = await db.query<{ on: boolean; prayers: number }>(
  'select new_member_limits_enabled as on, new_member_min_prayers as prayers from public.safety_settings',
);
if (limits[0]?.on && limits[0].prayers > 0) {
  console.log(`Note: new-member limits are on. The reviewer is limited until they tap Praying Now on ${limits[0].prayers} other members' requests (say so in the review notes).`);
}
console.log(`${rows[0] ? 'Reset' : 'Created'} the review account.\n  Email:    ${email}\n  Password: ${password}\nPut both in App Store Connect (App Review Information) and Play Console (App content → App access).`);
await db.end();

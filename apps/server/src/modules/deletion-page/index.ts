// The public "delete my account" web page that Google Play asks for: members
// can delete without reinstalling the app, either by signing in on the page
// (which calls DELETE /me) or, if they can't sign in, by leaving a request that
// staff confirm by email and then carry out from the admin screen.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { conflict, notFound } from '../../errors.js';
import { deleteAccount } from '../accounts/index.js';

export const NewRequest = z.object({ email: z.email().max(320), note: z.string().trim().max(1000).optional() });

export async function createRequest(q: Queryable, input: z.infer<typeof NewRequest>) {
  await q.query('insert into public.account_deletion_requests (email, note) values (lower($1), $2)', [input.email, input.note || null]);
}

export async function pending(q: Queryable) {
  const { rows } = await q.query(
    `select r.id, r.email, r.note, r.created_at, u.id as user_id
       from public.account_deletion_requests r left join auth.users u on lower(u.email) = r.email
      where r.status = 'pending' order by r.created_at`,
  );
  return rows.map((r) => ({ id: r.id, email: r.email, note: r.note, createdAt: r.created_at, accountFound: !!r.user_id }));
}

export const Decision = z.object({ action: z.enum(['delete', 'dismiss']) });

/** Staff carry out (or dismiss) a request after confirming it with the member. Returns media paths to remove. */
export async function decide(q: Queryable, staffId: string, id: string, d: z.infer<typeof Decision>): Promise<string[]> {
  const { rows } = await q.query<{ email: string; status: string }>('select email, status from public.account_deletion_requests where id = $1 for update', [id]);
  if (!rows[0]) throw notFound('Request');
  if (rows[0].status !== 'pending') throw conflict('This request was already handled');
  let paths: string[] = [];
  if (d.action === 'delete') {
    const { rows: user } = await q.query<{ id: string }>('select id from auth.users where lower(email) = $1', [rows[0].email]);
    if (!user[0]) throw notFound('Account with that email');
    paths = await deleteAccount(q, user[0].id);
  }
  await q.query(`update public.account_deletion_requests set status = $2, handled_by = $3, handled_at = now() where id = $1`, [
    id,
    d.action === 'delete' ? 'deleted' : 'dismissed',
    staffId,
  ]);
  return paths;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The page itself. With a publishable key it offers sign-in-and-delete; the request form always works. */
export function page(opts: { supabaseUrl: string; publishableKey: string | null; supportEmail: string | null }) {
  const signIn = opts.publishableKey
    ? `<section>
  <h2>Delete it now</h2>
  <p>Sign in with the email and password you use in the app. Your account is deleted right away.</p>
  <form id="now">
    <label>Email <input name="email" type="email" autocomplete="email" required></label>
    <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
    <label>Type DELETE to confirm <input name="confirm" required pattern="DELETE" autocomplete="off"></label>
    <button type="submit">Delete my account</button>
    <p class="msg" role="status"></p>
  </form>
</section>`
    : '';
  const contact = opts.supportEmail ? ` You can also email <a href="mailto:${esc(opts.supportEmail)}">${esc(opts.supportEmail)}</a>.` : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Delete your Prayer Tower account</title>
<style>
  :root { color-scheme: light dark; --fg: #2B2238; --muted: #6B6478; --bg: #FAF7F2; --card: #fff; --line: #E7E0D6; --accent: #5B3E96; }
  @media (prefers-color-scheme: dark) { :root { --fg: #EEE9F5; --muted: #ABA3B8; --bg: #17131D; --card: #221C2B; --line: #3A3245; --accent: #B9A2E6; } }
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
  main { max-width: 560px; margin: 0 auto; padding: 32px 16px 64px; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 16px 20px; margin: 20px 0; }
  h1 { font-size: 26px; margin: 0 0 8px; } h2 { font-size: 19px; margin: 0 0 8px; }
  p, li { color: var(--muted); } label { display: block; margin: 10px 0; font-weight: 600; }
  input, textarea { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 10px; font: inherit; border: 1px solid var(--line); border-radius: 10px; background: transparent; color: var(--fg); }
  button { margin-top: 8px; padding: 10px 18px; font: inherit; font-weight: 700; color: #fff; background: var(--accent); border: 0; border-radius: 999px; cursor: pointer; }
  a { color: var(--accent); } .msg { font-weight: 600; color: var(--fg); }
</style></head>
<body><main>
<h1>Delete your Prayer Tower account</h1>
<p>In the app, go to <strong>Me → Delete my account</strong>. If you no longer have the app, use this page.</p>
<section>
  <h2>What is deleted</h2>
  <ul><li>Your sign-in, email and profile</li><li>Your requests, comments, encouragements, photos and messages</li><li>Your promises, events, prayer history and tokens</li></ul>
  <p>We keep only the token ledger and moderators' past decisions, under "Deleted member" with no name or email. A request that holds tokens other members gave is emptied and taken down rather than erased.</p>
</section>
${signIn}
<section>
  <h2>Can't sign in? Ask us to delete it</h2>
  <p>Leave the email on your account. We'll confirm with you by email before deleting, and finish within 30 days.${contact}</p>
  <form id="ask">
    <label>Email on your account <input name="email" type="email" autocomplete="email" required></label>
    <label>Anything we should know (optional) <textarea name="note" rows="3" maxlength="1000"></textarea></label>
    <button type="submit">Send request</button>
    <p class="msg" role="status"></p>
  </form>
</section>
</main>
<script>
const SUPABASE_URL = ${JSON.stringify(opts.supabaseUrl.replace(/\/$/, ''))};
const KEY = ${JSON.stringify(opts.publishableKey ?? '')};
const say = (form, text) => { form.querySelector('.msg').textContent = text; };
document.getElementById('ask').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, data = { email: f.email.value, note: f.note.value || undefined };
  const r = await fetch('account-deletion/requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  say(f, r.ok ? 'Thank you. We received your request and will email you to confirm.' : 'Something went wrong. Please check the email and try again.');
  if (r.ok) f.reset();
});
const now = document.getElementById('now');
if (now) now.addEventListener('submit', async (e) => {
  e.preventDefault();
  say(now, 'Deleting…');
  const t = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify({ email: now.email.value, password: now.password.value }) });
  const session = await t.json().catch(() => ({}));
  if (!t.ok || !session.access_token) return say(now, 'That email and password did not match. You can send a request below instead.');
  const d = await fetch('me', { method: 'DELETE', headers: { authorization: 'Bearer ' + session.access_token, 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) });
  say(now, d.ok ? 'Your account has been deleted. God bless you.' : 'We could not delete the account. Please send a request below.');
  if (d.ok) now.reset();
});
</script>
</body></html>`;
}

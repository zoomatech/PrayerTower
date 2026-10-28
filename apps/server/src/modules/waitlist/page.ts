// The public waitlist page: /waitlist, and /open-circle/waitlist in Open Circle's words.
import { esc, layout, type Brand } from '../site/index.js';

export function waitlistPage(name: string, brand?: Brand) {
  const faith = !brand;
  const edition = faith ? 'prayer-tower' : 'open-circle';
  return layout(
    `${name}: join the waitlist`,
    `<h1>Join the waitlist</h1>
<p class="lede">${esc(name)} is opening slowly, a few people at a time. Leave your email and we'll send you an invitation when there's room.</p>
<div class="card">
<form id="join" novalidate>
  <p><label for="email">Email</label><br><input id="email" name="email" type="email" autocomplete="email" required maxlength="320" style="width:100%;font:inherit;padding:10px"></p>
  <p><label for="name">Your name (optional)</label><br><input id="name" name="name" autocomplete="name" maxlength="80" style="width:100%;font:inherit;padding:10px"></p>
  <p><label for="note">What brings you here? (optional)</label><br><textarea id="note" name="note" maxlength="300" rows="3" style="width:100%;font:inherit;padding:10px"></textarea></p>
  <p><button class="button" type="submit">Join the waitlist</button></p>
  <p id="status" role="status" aria-live="polite"></p>
</form>
</div>
<p>We use your email only to invite you. We never sell it, and you can ask us to remove it at any time.</p>
<script>
const f = document.getElementById('join'), s = document.getElementById('status');
f.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!f.email.value.includes('@')) { s.textContent = 'Please enter your email address.'; return; }
  s.textContent = 'Sending…';
  try {
    const r = await fetch('/waitlist/join', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: f.email.value, name: f.name.value, note: f.note.value, edition: ${JSON.stringify(edition)} }) });
    s.textContent = r.ok ? "Thank you. You're on the list, and we'll email you when there's room." : 'Something went wrong. Please check your email address and try again.';
    if (r.ok) f.reset();
  } catch { s.textContent = 'Something went wrong. Please try again.'; }
});
</script>`,
    '/waitlist',
    'en',
    brand,
  );
}

// Automated WCAG 2.1 and 2.2 A/AA checks plus axe best practices (axe-core) on the screens of the web build.
// This catches missing labels, contrast and role problems; VoiceOver on a phone is still checked by hand.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { as, db, postIdByText, signIn } from './helpers';

async function scan(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test('the sign-in screen has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: /sign in/i }).last()).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test('the main screens have no WCAG A/AA violations', async ({ page }) => {
  await signIn(page, 'carol');
  const found: Record<string, string[]> = {};
  found.feed = await scan(page);
  await page.goto('/compose');
  await page.waitForLoadState('networkidle');
  found.compose = await scan(page);
  const postId = await postIdByText('Pray for peace in our family over the holidays.');
  await page.goto(`/post/${postId}`);
  await page.waitForLoadState('networkidle');
  found.post = await scan(page);
  await page.goto('/profile');
  await page.waitForLoadState('networkidle');
  found.profile = await scan(page);
  await page.goto('/feedback');
  await page.waitForLoadState('networkidle');
  found.feedback = await scan(page);
  await page.goto('/tour');
  await page.waitForLoadState('networkidle');
  found.tour = await scan(page);
  expect(found).toEqual({ feed: [], compose: [], post: [], profile: [], feedback: [], tour: [] });
});

test('the newer screens (settings, Me, messages, events, care, admin, audit log) have no violations', async ({ page, browser }) => {
  const found: Record<string, string[]> = {};
  const visit = async (p: Page, name: string, url: string) => {
    await p.goto(url);
    await p.waitForLoadState('networkidle');
    found[name] = await scan(p);
  };
  // Carol: settings, data download and digest (on Me), messages and events.
  await signIn(page, 'carol');
  await visit(page, 'notificationSettings', '/notification-settings');
  await visit(page, 'me', '/profile');
  await visit(page, 'messages', '/messages');
  const { rows: convo } = await db.query<{ id: string }>(
    `select c.id from public.conversations c join public.conversation_members m on m.conversation_id = c.id
       join auth.users u on u.id = m.user_id where u.email = 'carol@demo.prayertower.local' order by c.created_at limit 1`,
  );
  await visit(page, 'conversation', `/conversation/${convo[0]!.id}`);
  await visit(page, 'events', '/events');
  const { rows: event } = await db.query<{ id: string }>(`select id from public.events order by created_at limit 1`);
  await visit(page, 'event', `/event/${event[0]!.id}`);
  // Staff screens: the care queue (pastor) and the audit log (admin).
  const pastor = await as(browser, 'pastor');
  await visit(pastor, 'care', '/care');
  const admin = await as(browser, 'admin');
  await visit(admin, 'admin', '/admin');
  await visit(admin, 'auditLog', '/audit-log');
  // In Spanish the page language must follow (WCAG 3.1.1).
  await page.evaluate(() => window.localStorage.setItem('prayer-tower.language', 'es'));
  await visit(page, 'spanishSettings', '/notification-settings');
  expect(await page.locator('html').getAttribute('lang')).toBe('es');
  await page.evaluate(() => window.localStorage.removeItem('prayer-tower.language'));
  expect(found).toEqual({
    notificationSettings: [],
    me: [],
    messages: [],
    conversation: [],
    events: [],
    event: [],
    care: [],
    admin: [],
    auditLog: [],
    spanishSettings: [],
  });
});

test('the public website has no violations in English or Spanish', async ({ page }) => {
  const api = process.env.E2E_API_URL ?? 'http://127.0.0.1:3000';
  const found: Record<string, string[]> = {};
  for (const path of ['/', '/support', '/privacy', '/terms', '/account-deletion', '/es', '/es/support', '/es/privacy', '/es/terms', '/es/account-deletion']) {
    await page.goto(api + path);
    expect(await page.locator('html').getAttribute('lang')).toBe(path.startsWith('/es') ? 'es' : 'en');
    found[path] = await scan(page);
  }
  expect(Object.entries(found).filter(([, v]) => v.length)).toEqual([]);
});

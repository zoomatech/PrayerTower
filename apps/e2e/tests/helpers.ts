import { expect, type Browser, type Page } from '@playwright/test';
import pg from 'pg';

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'praying-demo-1';
export type Demo = 'admin' | 'carol' | 'ethel' | 'james' | 'ruth' | 'pastor';

/** Read-only lookups (ids of things a test just made in the UI). */
export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', max: 2 });

/** Signs in a demo member. The first-run tour is marked seen unless `tour` is true (09-tour tests it). */
export async function signIn(page: Page, who: Demo, { tour = false } = {}) {
  if (!tour) {
    const { rows } = await db.query<{ id: string }>('select id from auth.users where email = $1', [`${who}@demo.prayertower.local`]);
    // The app keeps this flag in AsyncStorage, which is localStorage on the web.
    if (rows[0]) await page.addInitScript((key) => window.localStorage.setItem(key, '1'), `tour:seen:v1:${rows[0].id}`);
  }
  await page.goto('/sign-in');
  await page.locator('input').nth(0).fill(`${who}@demo.prayertower.local`);
  await page.locator('input[type=password]').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).last().click();
  await expect(page.getByText('Prayers').first()).toBeVisible();
}

/** A separate signed-in browser for a second member in the same test. */
export async function as(browser: Browser, who: Demo) {
  const ctx = await browser.newContext({ baseURL: test_baseURL() });
  const page = await ctx.newPage();
  await signIn(page, who);
  return page;
}
const test_baseURL = () => process.env.E2E_WEB_URL ?? 'http://127.0.0.1:8081';

/** The feed card holding this text (the innermost block with both the text and the action row). */
export function card(page: Page, text: string) {
  return page.locator('div').filter({ hasText: text }).filter({ has: page.getByText('Praying Now', { exact: true }) }).last();
}

export async function postIdByText(text: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>('select id from public.posts where body like $1 order by created_at desc limit 1', [`%${text}%`]);
  if (!rows[0]) throw new Error(`no post containing ${text}`);
  return rows[0].id;
}

export const unique = (label: string) => `${label} ${Date.now().toString(36)}`;

// Why we run on gifts, not ads (Steve 2026-10-28; copy in docs/copy/DONATIONS_NOT_ADS.md,
// the list in promise.ts). The website's /why-donations page and, as JSON, the app's
// screen on Me, both only while Admin → Notebook ideas has it switched on.
import type { Queryable } from '../../db.js';
import * as donations from '../donations/index.js';
import * as future from '../future/index.js';
import { esc, layout, type Brand } from './index.js';
import { WHY_GIFTS } from './promise.js';

export interface WhyGifts {
  title: string;
  intro: string;
  points: { heading: string; body: string }[];
  /** The website's Give link: the Zeffy page while giving is on through Zeffy. The app uses Me → Give instead. */
  giveUrl: string | null;
  /** The public fund report, while it is published (Prayer Tower only: it is the "Common Prayer Fund"). */
  fundPath: string | null;
}

export async function enabled(q: Queryable) {
  const { rows } = await q.query<{ on: boolean }>('select why_gifts_enabled as on from public.notebook_settings');
  return rows[0]?.on === true;
}

/** The Zeffy page while giving is on through Zeffy (Admin → Giving); Stripe giving happens in the app. */
async function giveUrl(q: Queryable): Promise<string | null> {
  const s = await donations.settings(q);
  return s.enabled && s.provider === 'zeffy' && s.donate_url ? s.donate_url : null;
}

/** The words for one edition: `faith` for Prayer Tower, otherwise neutral under `name`. */
export async function copy(q: Queryable, name: string, faith: boolean): Promise<WhyGifts> {
  const fund = faith ? await future.commonFund(q) : { enabled: false };
  return {
    title: 'How we pay for it: gifts, not ads',
    intro: `${name} runs on gifts from the people who use it and believe in it. Here is why.`,
    points: WHY_GIFTS(name, faith).map(([heading, body]) => ({ heading: heading!, body: body! })),
    giveUrl: await giveUrl(q),
    fundPath: fund.enabled ? '/fund' : null,
  };
}

/** The web page; `brand` for Open Circle, none for Prayer Tower. */
export function page(c: WhyGifts, brand?: Brand) {
  const cards = c.points.map((p) => `<div class="card"><h2>${esc(p.heading)}</h2><p>${esc(p.body)}</p></div>`).join('\n');
  const links = [
    c.giveUrl ? `<a class="button" href="${esc(c.giveUrl)}">Give</a>` : '',
    c.fundPath ? `<a href="${esc(c.fundPath)}">See where gifts go</a>` : '',
  ].join(' ');
  return layout(c.title, `<h1>${esc(c.title)}</h1>\n<p class="lede">${esc(c.intro)}</p>\n${cards}\n${links.trim() ? `<p>${links.trim()}</p>` : ''}`, '/why-donations', 'en', brand);
}

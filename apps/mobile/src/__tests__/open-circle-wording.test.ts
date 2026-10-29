// Open Circle has no religious words. Screens it shows (giving, radio message
// requests, sign-in security, invites) must have Open Circle wording for every
// string that would otherwise say "prayer", "church" and the like.
import en from '@/locales/en';
import { keys as neutral } from '@/locales/neutral';

type Tree = { [key: string]: string | Tree };
const RELIGIOUS = /\b(pray|prayer|prayers|praying|god|church|faith|priestly|blessing|amen|pastor|scripture|bible|ministry|prayer tower)\b/i;

function strings(e: Tree, n: Tree | undefined, path: string, out: [string, string][]) {
  for (const [k, v] of Object.entries(e)) {
    const over = n?.[k];
    if (typeof v === 'string') out.push([`${path}${k}`, typeof over === 'string' ? over : v]);
    else strings(v, typeof over === 'object' ? over : undefined, `${path}${k}.`, out);
  }
  return out;
}

it.each(['give', 'radioRequests', 'twoStep', 'accountSecurity', 'invites', 'listen', 'cast'])('%s has no religious words in Open Circle', (section) => {
  const e = (en as unknown as Tree)[section] as Tree;
  const religious = strings(e, neutral[section] as Tree | undefined, `${section}.`, []).filter(([, text]) => RELIGIOUS.test(text));
  expect(religious).toEqual([]);
});

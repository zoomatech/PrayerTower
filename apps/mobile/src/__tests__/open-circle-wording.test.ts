// Open Circle has no religious words. Screens it shows (giving, radio message
// requests, sign-in security, invites, and every kindness and growth feature:
// the kind cloud, emoji meanings, conversation helpers, growth practices, gentle
// repair, growth ideas) must have Open Circle wording for every string that would
// otherwise say "prayer", "church" and the like. "Thinking of you" replaces prayer.
import en from '@/locales/en';
import { keys as neutral } from '@/locales/neutral';
import { neutralEnglish } from '@/lib/neutral-tree';

type Tree = { [key: string]: string | Tree };
const RELIGIOUS = /\b(pray|prayer|prayers|praying|prayed|pray-ers|confession|bible|god|lord|jesus|christ|psalm|church|faith|priestly|bless|blessing|blessings|blessed|amen|pastor|scripture|bible|gospel|sermon|worship|ministry|prayer tower)\b/i;

function strings(e: Tree, n: Tree | undefined, path: string, out: [string, string][]) {
  for (const [k, v] of Object.entries(e)) {
    const over = n?.[k];
    if (typeof v === 'string') out.push([`${path}${k}`, typeof over === 'string' ? over : v]);
    else strings(v, typeof over === 'object' ? over : undefined, `${path}${k}.`, out);
  }
  return out;
}

// Strings that only faith communities ever see (the server hides these features from
// Open Circle), or admin hints that describe what faith communities get.
const FAITH_ONLY = [
  /^ai\.(chatLink|chatTitle|chatIntro|ai)$/,
  /^care\.confessionNote/,
  /^readingPlan\./,
  /^library\.(adminHint|adminDailyHint|adminParallelsHint|adminPlansHint|adminWordsHint|study\..+)$/,
  /^church(Review)?\./,
  /^admin\.(toggle\.(confession|confessionHint|aiChat|aiChatHint|readingPlan|readingPlanHint|crossCommunityHint|supportLabelHint)|field\.confessionDays|newCommunityHint)$/,
  /^skins\.seasonalHint$/,
];

it('Open Circle English has no religious words anywhere, admin screens included', () => {
  const tree = neutralEnglish(en as unknown as Tree, neutral as unknown as Tree) as Tree;
  const religious = strings(tree, undefined, '', [])
    .filter(([key, text]) => RELIGIOUS.test(text) && !FAITH_ONLY.some((re) => re.test(key)))
    .map(([key, text]) => `${key}: ${text}`);
  expect(religious).toEqual([]);
});

it('renames the app, never leaves "Message Tower"', () => {
  const tree = neutralEnglish({ a: 'Prayer Tower pilot report', b: 'Pray-ers can write' }, {}) as Tree;
  expect(tree).toEqual({ a: 'Open Circle pilot report', b: 'Supporters can write' });
});

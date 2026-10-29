// Open Circle (secular) members never see religious words. Hand-written neutral
// wording comes first (the app's locales/neutral.ts, the server's
// notifications/i18n.ts); everything else a member can read passes through this
// word-level fallback, on the server (errors, notices without a template) and in
// the app (any string without its own neutral wording).
// A third element `true` keeps the replacement exactly as written (the app's name, a
// lowercase phrase replacing a proper noun).
const RULES: [RegExp, string, true?][] = [
  [/\bPrayer Tower\b/g, 'Open Circle', true],
  [/\bCommon Prayer Fund\b/g, 'Common Fund', true],
  [/\bprayer partners\b/gi, 'listening partners'],
  [/\bprayer partner\b/gi, 'listening partner'],
  [/\bspoken prayers\b/gi, 'spoken messages'],
  [/\bspoken prayer\b/gi, 'spoken message'],
  [/\bradio prayers\b/gi, 'radio messages'],
  [/\bradio prayer\b/gi, 'radio message'],
  [/\bprayer requests\b/gi, 'requests'],
  [/\bprayer request\b/gi, 'request'],
  [/\bprayer warriors?\b/gi, 'kindness champion'],
  [/\bcommit(ted)? to pray\b/gi, 'promise$1 to check in'],
  [/\bpray for\b/gi, 'support'],
  [/\bpraying for\b/gi, 'supporting'],
  [/\bprayed for\b/gi, 'supported'],
  [/\bpray-ers\b/gi, 'supporters'],
  [/\bpraying\b/gi, 'supporting'],
  [/\bprayed\b/gi, 'supported'],
  [/\bprayers\b/gi, 'messages'],
  [/\bprayer\b/gi, 'message'],
  [/\bpray\b/gi, 'support'],
  [/\bpastors\b/gi, 'mentors'],
  [/\bpastor\b/gi, 'mentor'],
  [/\bchurches\b/gi, 'communities'],
  [/\bchurch\b/gi, 'community'],
  [/\bPriestly\b/g, 'Lighthouse'],
  [/\bbefore the Lord\b/gi, 'in their thoughts'],
  [/\bGod bless( you)?\b/gi, 'Take care'],
  [/\bBible reading plan\b/g, 'reading plan', true],
  [/\ba praise\b/gi, 'good news'],
  [/\bpraise & thanks\b/gi, 'good news'],
  [/\bpraises\b/gi, 'good news'],
  [/\bpraise\b/gi, 'good news'],
  [/\btestimonies\b/gi, 'stories'],
  [/\btestimony\b/gi, 'story'],
  [/\bscripture leaf\b/gi, 'quote leaf'],
  [/\bscripture\b/gi, 'quotes'],
];

export const RELIGIOUS_WORDS = /\b(pray\w*|pray-ers|pastors?|priestly|lord|god|church(es)?|bible|scripture|prais\w*|testimon\w*|prayer tower)\b/i;

/** Keeps the first letter's case of the word it replaces. */
const matchCase = (found: string, word: string) => (found[0] === found[0]!.toUpperCase() ? word[0]!.toUpperCase() + word.slice(1) : word);

export function neutralText(text: string): string {
  if (!RELIGIOUS_WORDS.test(text)) return text;
  return RULES.reduce(
    (s, [re, to, asIs]) => s.replace(re, (found, ...groups) => (asIs ? to : matchCase(found, to.replace('$1', typeof groups[0] === 'string' ? 'd' : '')))),
    text,
  );
}

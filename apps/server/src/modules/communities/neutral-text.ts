// Open Circle (secular) members never see religious words. Notices and messages
// with a template use the hand-written neutral wording (notifications/i18n.ts);
// everything else a member can read from the server (error messages, notices
// without a template) passes through this word-level fallback.
const RULES: [RegExp, string][] = [
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
];

export const RELIGIOUS_WORDS = /\b(pray\w*|pastors?|priestly|lord|god|church(es)?)\b/i;

/** Keeps the first letter's case of the word it replaces. */
const matchCase = (found: string, word: string) => (found[0] === found[0]!.toUpperCase() ? word[0]!.toUpperCase() + word.slice(1) : word);

export function neutralText(text: string): string {
  if (!RELIGIOUS_WORDS.test(text)) return text;
  return RULES.reduce(
    (s, [re, to]) => s.replace(re, (found, ...groups) => matchCase(found, to.replace('$1', typeof groups[0] === 'string' ? 'd' : ''))),
    text,
  );
}

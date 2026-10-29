// Reading through disguises (docs/HARMFUL_PRAYERS.md, "Disguised words"): number and
// symbol swaps (k1ll, d!e), letters split up (k.i.l.l, k i l l), stretched letters
// (diiiie), common misspellings, coded words (unalive, sewer slide) and emoji (🔪 💀).
// The harmful-prayer check runs its patterns on this reading as well as on the text
// as written. A match only ever sends the post to a person; nothing is refused for it.

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '|': 'l' };

/** Emoji read as the word they stand for in a threat or a wish for harm. */
const EMOJI: [RegExp, string][] = [
  [/\u{1F52A}/gu, ' stab '], // 🔪
  [/\u{1F5E1}️?/gu, ' stab '], // 🗡️
  [/\u{1F52B}/gu, ' shoot '], // 🔫
  [/\u{1F4A3}/gu, ' bomb '], // 💣
  [/\u{1F480}|☠️?|⚰️?|\u{1FAA6}/gu, ' die '], // 💀 ☠️ ⚰️ 🪦
  [/\u{1F525}/gu, ' burn '], // 🔥
];

/** Coded words people use to slip past filters, read as plain words. */
const CODED: [RegExp, string][] = [
  [/\bun-?aliv(?:e|ing)\b/g, 'kill'],
  [/\bun-?alived\b/g, 'killed'],
  [/\bsewer ?slide\b/g, 'suicide'],
  [/\bsu[i1!]c[i1!]de\b/g, 'suicide'],
  [/\bkms\b/g, 'kill myself'],
  [/\bkys\b/g, 'kill yourself'],
  [/\b(?:six|6) (?:feet|ft) under\b/g, 'dead'],
  [/\bsleep(?:s|ing)? with the fishes\b/g, 'die'],
  [/\bgo (?:to )?sleep forever\b/g, 'die'],
];

/** Misspellings and sound-alikes of the words the patterns look for. */
const SPELLING: Record<string, string> = {
  kil: 'kill',
  kll: 'kill',
  kiil: 'kill',
  murda: 'murder',
  murdr: 'murder',
  merder: 'murder',
  ded: 'dead',
  daed: 'dead',
  deid: 'dead',
  dye: 'die',
  dy: 'die',
  shoout: 'shoot',
  shoote: 'shoot',
  stabb: 'stab',
  hert: 'hurt',
  hurtt: 'hurt',
  sufer: 'suffer',
  suffr: 'suffer',
  curze: 'curse',
  kurse: 'curse',
  revenj: 'revenge',
  revange: 'revenge',
  ur: 'your',
  u: 'you',
  ima: "i'm going to",
  imma: "i'm going to",
  gona: 'gonna',
};

/** The text with disguises taken off, in lower case. Ordinary text comes back the same, apart from case and spacing. */
export function unmask(text: string): string {
  let t = text.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/[\u2018\u2019]/g, "'").toLowerCase();
  for (const [re, word] of EMOJI) t = t.replace(re, word);
  // Letters split by dots, dashes, underscores or asterisks inside a word: k.i.l.l, d-i-e, k*ll.
  t = t.replace(/\b(?:[a-z0-9@$!][._*-]){2,}[a-z0-9@$!]\b/g, (w) => w.replace(/[._*-]/g, ''));
  // Single letters spaced out: "k i l l" (three or more in a row).
  t = t.replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (w) => w.replace(/ /g, ''));
  // Number and symbol swaps, only inside words that also have letters (so "3 kids" stays).
  t = t.replace(/[a-z0-9@$!|]+/g, (w) => (/[a-z]/.test(w) && /[0-9@$!|]/.test(w) ? w.replace(/[0-9@$!|]/g, (c) => LEET[c] ?? c) : w));
  // Stretched letters: three or more of the same become one (diiiie → die), then the spelling list fixes "kil".
  t = t.replace(/([a-z])\1{2,}/g, '$1');
  t = t.replace(/[a-z']+/g, (w) => SPELLING[w] ?? w);
  for (const [re, word] of CODED) t = t.replace(re, word);
  return t.replace(/\s+/g, ' ').trim();
}

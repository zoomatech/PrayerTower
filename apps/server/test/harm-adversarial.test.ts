// Adversarial pass on the harmful-prayer check (docs/HARMFUL_PRAYERS.md, "Disguised words"):
// misspellings, number swaps, split and stretched letters, coded words and emoji. With
// read_disguises on they are caught and go to a person; nothing is refused for them, and
// ordinary prayers that happen to use the same characters are left alone.
import { describe, expect, it } from 'vitest';
import { check, decide, type HarmSettings } from '../src/modules/harm/index.js';
import { unmask } from '../src/modules/harm/unmask.js';
import { mentionsCrisis } from '../src/modules/safety/index.js';

const SETTINGS: HarmSettings = {
  enabled: true,
  threat_action: 'hold',
  hate_action: 'hold',
  harm_wish_action: 'review',
  curse_action: 'review',
  revenge_action: 'review',
  abuse_action: 'support',
  foul_hold_at: 6,
  foul_junk_filter: true,
  flood_per_day: 5,
  extra_hate_words: [],
  explain_held: true,
  read_disguises: true,
};
const read = (t: string) => check(t, [], true);

describe('disguised harmful requests', () => {
  it.each([
    // Number and symbol swaps
    ["I'm going to k1ll him.", 'threat'],
    ["I'm gonna sh00t that man.", 'threat'],
    ['I pray my ex d!es.', 'harm_wish'],
    ['I hope my b0ss suffers.', 'harm_wish'],
    // Split, spaced and stretched letters
    ["I'm going to k.i.l.l him.", 'threat'],
    ["I'm going to k-i-l-l my neighbor.", 'threat'],
    ["I'm going to k i l l him.", 'threat'],
    ['I hope he diiiies.', 'harm_wish'],
    ["I'm going to killll him.", 'threat'],
    // Misspellings and sound-alikes
    ["I'm going to kil him.", 'threat'],
    ['imma kill him', 'threat'],
    ['I hope my ex is ded soon.', 'harm_wish'],
    ['I pray that man gets hert.', 'harm_wish'],
    ['Help me get revenj on my sister.', 'revenge'],
    ['I kurse my neighbor.', 'curse'],
    // Coded words
    ["I'm going to unalive him.", 'threat'],
    ['I pray my stepdad ends up six feet under.', 'harm_wish'],
    ['I hope that guy sleeps with the fishes.', 'harm_wish'],
    // Emoji in place of the word
    ["I'm going to 🔪 him.", 'threat'],
    ["I'm going to 🔫 that man.", 'threat'],
    ['I hope my boss 💀', 'harm_wish'],
    ['May my ex ⚰️', 'harm_wish'],
    ['May he 🔥', 'harm_wish'],
    // Hidden characters between letters
    ["I'm going to k​ill him.", 'threat'],
  ])('catches %s as %s', (text, category) => {
    const v = read(text);
    expect(v.categories).toContain(category);
    // A disguise is never a reason to refuse: it goes to a person.
    expect(v.junk).toBe(false);
    expect(decide(v, SETTINGS)?.action).not.toBe('filter');
  });

  it('marks matches found only through a disguise, for the weekly report', () => {
    expect(read("I'm going to k1ll him.").rules.some((r) => r.endsWith(':masked'))).toBe(true);
    expect(read("I'm going to kill him.").rules.some((r) => r.endsWith(':masked'))).toBe(false);
  });

  it('reads nothing through disguises while the switch is off', () => {
    expect(check("I'm going to k1ll him.").categories).toEqual([]);
    expect(check("I'm going to 🔪 him.").categories).toEqual([]);
  });
});

describe('disguised self-harm reaches crisis support', () => {
  it.each(['I want to unalive myself.', 'thinking about sewer slide tonight', 'honestly kms', 'I keep thinking about su1c1de'])('%s', (text) => {
    expect(mentionsCrisis(text)).toBe(false);
    expect(mentionsCrisis(unmask(text))).toBe(true);
  });
});

describe('ordinary prayers stay untouched with disguises read', () => {
  it.each([
    'Pray for my 3 kids, they are scared.',
    'Our worship night was 🔥 tonight!',
    'Lord, thank you 🙏 for 7 years sober.',
    'My grandma passed 💀 no wait, she pulled through! Praise God.',
    'Please pray, my mom is in the I.C.U. after surgery.',
    'I am sooooo grateful for this church.',
    'Kill the cancer cells, Lord. Pray the chemo destroys every tumor.',
    'I dye my hair for chemo week so my kids smile.',
    'Pray my dad doesnt die in surgery 🙏',
    'Psalm 3:7: Strike all my enemies on the jaw.',
    'u guys are the best, thank u for praying',
    'B.L.E.S.S. you all.',
    'Pray for those who curse you (Luke 6:28).',
  ])('%s', (text) => {
    expect(read(text).categories).toEqual([]);
  });
});

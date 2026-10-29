// The free word check for harmful prayers (docs/HARMFUL_PRAYERS.md). Pure: no database.
import { describe, expect, it } from 'vitest';
import { check, decide, type HarmSettings } from '../src/modules/harm/index.js';

const DEFAULTS: HarmSettings = {
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
  read_disguises: false,
};
const cats = (t: string) => check(t).categories;
const action = (t: string) => decide(check(t), DEFAULTS)?.action ?? 'none';

describe('harmful prayer check', () => {
  it.each([
    ["I'm going to kill him if he comes near my kids again.", 'threat'],
    ['I will hurt my ex for what she did.', 'threat'],
    ['You are going to pay. I know where you live.', 'threat'],
    ['I pray that he dies a slow death.', 'harm_wish'],
    ['I hope my boss gets cancer.', 'harm_wish'],
    ['God, strike that man down.', 'harm_wish'],
    ['Lord let them rot in hell', 'harm_wish'],
    ['I curse my neighbor and all his house.', 'curse'],
    ['Help me get revenge on my sister.', 'revenge'],
    ['I want to make them pay.', 'revenge'],
    ['All immigrants should be wiped out.', 'hate'],
    ['My husband hits me when he drinks. Please pray.', 'abuse_disclosure'],
    ['I was raped last year and still cannot sleep.', 'abuse_disclosure'],
  ])('flags %s as %s', (text, category) => {
    expect(cats(text)).toContain(category);
  });

  it.each([
    'Please pray my mom does not die in surgery.',
    "Pray that my dad doesn't suffer.",
    'Pray for her as she is going to die soon; hospice says days.',
    'I hope she dies peacefully, surrounded by family.',
    'Lord, please don\'t let him die.',
    "I'm going to beat this cancer.",
    "I'm going to hurt myself.",
    'Pray the tumor dies and the chemo works.',
    'Help me break the generational curse on my family.',
    'Vengeance is mine, says the Lord. Help me leave revenge to Him.',
    'Pray for my enemies, that they find peace.',
    'Your prayers touched me deeply.',
    'Pray for my job interview.',
    // Grief
    "My husband died last week. I wish he hadn't suffered so long.",
    'I hope my mom is not suffering anymore.',
    'Praying for him, who died yesterday, and for his wife.',
    'I miss her so much it feels like I could die.',
    'My father beat cancer twice, and now it is back.',
    // Illness
    'I want this cancer to die. Kill the cancer cells, Lord.',
    "We're going to beat this infection.",
    'This job is killing me. Pray for rest.',
    'My boss is going to kill me if I am late again, ha.',
    'Pray the chemo destroys every tumor.',
    // Scripture that speaks of violence or enemies
    'Psalm 3:7: Arise, Lord! Deliver me, my God! Strike all my enemies on the jaw.',
    'Psalm 139:19: If only you, God, would slay the wicked!',
    'Psalm 58:6: Break the teeth in their mouths, O God.',
    'Romans 12:19: Do not take revenge, my dear friends, but leave room for God\'s wrath.',
    'The wages of sin is death, but the gift of God is eternal life.',
    'Jesus said, Destroy this temple, and I will raise it again in three days.',
    'Let God arise, let his enemies be scattered.',
    'Pray for those who persecute you, and bless those who curse you.',
  ])('leaves alone: %s', (text) => {
    expect(cats(text)).toEqual([]);
  });

  it('allows swearing out of anguish, holds excessive swearing, and refuses only pure junk', () => {
    expect(action('God, why the fuck did you take my baby? I am so damn angry.')).toBe('none');
    expect(action('fuck shit fuck shit bitch')).toBe('filter');
    expect(action('fuck fuck fuck my baby died')).toBe('none');
    expect(action('fuck this shit, fucking doctors, damn hospital, fucking bills, shitty insurance, bullshit')).toBe('hold');
  });

  it('holds threats and hate for a person, keeps harm wishes up for review, and supports abuse disclosures', () => {
    expect(action("I'm going to kill him.")).toBe('hold');
    expect(action('I pray he dies.')).toBe('review');
    expect(action('My father beats me.')).toBe('support');
    // A threat on top of a disclosure is held for a person; support is still offered (harm.apply).
    const d = decide(check("My stepdad beats me and I'm going to kill him."), DEFAULTS)!;
    expect(d).toMatchObject({ category: 'threat', action: 'hold' });
    expect(d.categories).toContain('abuse_disclosure');
  });

  it('treats admin-added words as hate, and ignores invisible characters', () => {
    expect(check('those people are zorbs', ['zorbs']).categories).toContain('hate');
    expect(cats('I pray he d​ies')).toContain('harm_wish');
  });
});

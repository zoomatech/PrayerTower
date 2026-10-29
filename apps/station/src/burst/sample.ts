// Made-up but varied prayer requests for `cli.js bench` and the tests: real
// requests rarely repeat word for word, so the benchmark must not either.
// Deterministic (seeded), so numbers are comparable from run to run.
const WHO = ['my mom', 'my dad', 'my wife', 'my husband', 'my son', 'my daughter', 'my grandmother', 'my brother', 'my sister', 'my best friend', 'our pastor', 'my neighbor', 'my coworker', 'my nephew', 'my aunt', 'our youth leader', 'my roommate', 'my father-in-law'];
const NAMES = ['Ana', 'Ben', 'Carla', 'Dev', 'Ellen', 'Frank', 'Grace', 'Hugo', 'Ines', 'Jamal', 'Kim', 'Luis', 'Maya', 'Noah', 'Olive', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tara', 'Uma', 'Victor', 'Wes', 'Yara', 'Zeke'];
const NEED = [
  'who is having heart surgery on Thursday',
  'who was just diagnosed with breast cancer and starts chemo next week',
  'who lost a job after twelve years and is worried about the mortgage',
  'who is struggling with depression and does not want to get out of bed',
  'who has been sober for 90 days and is fighting hard to stay clean',
  'who is in the ICU after a car accident on the highway',
  'who is waiting on biopsy results that come back Friday',
  'who is deployed overseas and has not called home in two weeks',
  'who is going through a painful divorce with three small kids',
  'who is starting a new school in a new city and feels alone',
  'who has pneumonia and is on oxygen at the hospital',
  'who is caring for a parent with dementia and is exhausted',
  'who is expecting twins after years of infertility',
  'who is facing a court date about custody next month',
  'who has not spoken to the family in a long time',
  'whose house flooded in the storm last weekend',
  'who just moved into hospice care',
  'who has a job interview on Monday morning',
];
const ASK = [
  'Please pray for healing and strength.',
  'Pray for peace and for wisdom for the doctors.',
  'We are asking God for a miracle.',
  'Pray that God would open the right doors.',
  'Please pray for comfort for the whole family.',
  'Pray for protection and a safe return home.',
  'Pray that they would feel loved and not alone.',
  'Thank you all for standing with us in prayer.',
  'Pray for patience and good news.',
  'We trust the Lord, but we are tired. Please pray.',
];

export function samplePrayers(count: number, seed = 1): string[] {
  let x = seed >>> 0 || 1;
  const pick = <T>(a: readonly T[]) => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return a[(x >>> 8) % a.length]!;
  };
  return Array.from({ length: count }, () => {
    const who = pick([0, 1, 2]) === 0 ? `${pick(WHO)}, ${pick(NAMES)},` : pick(WHO);
    const start = pick(['Please pray for', 'Pray for', 'Asking for prayer for', 'Could you pray for', 'Prayers please for']);
    return `${start} ${who} ${pick(NEED)}. ${pick(ASK)}`;
  });
}

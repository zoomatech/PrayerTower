// Passage search, ported from Winstons Syndicate (Packages/SyndicateCore/Sources/ZoomaReference/VerseSearch.swift,
// `VerseLibrary.passageSearch` and `PassageWords`). It works on any collection of numbered passages, so the
// Bible and the ancient writings share it: a passage is a verse (or paragraph) with the one either side of it in
// the same work. The KJV's own forms of a word count as the word (who/whom, you/thee/ye, says/saith), endings are
// taken off so "loveth", "loved" and "love" are one word, and a word's synonyms (rod = staff) count for a little less.

export type Passage = { workId: string; ref: string; text: string };
export type PassageHit = { index: number; complete: boolean };

/** Lowercased runs of letters, as RelationLanguage.words in Swift. */
export const words = (text: string) => text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);

const families = (list: string[]) => {
  const map = new Map<string, string>();
  for (const family of list) {
    const forms = family.split(' ');
    for (const form of forms) map.set(form, forms[0]!);
  }
  return map;
};

/** RelationLanguage.irregular in Swift. */
const irregular = families([
  'slay slew slain slays slaying', 'weep wept weeps weeping', 'come came comes coming', 'go went gone goes going',
  'give gave given gives giving', 'say said says saying', 'speak spoke spoken speaks speaking', 'teach taught teaches teaching',
  'lead led leads leading', 'see saw seen sees seeing', 'write wrote written writes writing', 'know knew known knows knowing',
  'eat ate eaten eats eating', 'drink drank drunk drinks drinking', 'take took taken takes taking', 'bring brought brings bringing',
  'be am is are was were been being art wast wert', 'have has had having hath hast', 'do does did done doing doth dost', 'will wilt', 'shall shalt', 'make made makes making',
  'run ran runs running', 'rise rose risen rises rising', 'fall fell fallen falls falling', 'forgive forgave forgiven forgives forgiving',
  'send sent sends sending', 'begin began begun begins beginning', 'find found finds finding', 'leave left leaves leaving',
  'hear heard hears hearing', 'hold held holds holding', 'keep kept keeps keeping', 'fight fought fights fighting',
  'buy bought buys buying', 'sell sold sells selling', 'die died dies dying', 'lie lay lain lies lying',
]);

/** PassageWords.kept in Swift: the irregular forms plus the KJV's pronoun and verb families. */
const kept = new Map([
  ...irregular,
  ...families(['who whom whoso whosoever', 'you ye thee thou your yours thy thine yourself yourselves thyself', 'people men', 'i me', 'say said says saying saith sayest', 'speak spake']),
]);

/** The form the search compares. */
export function stem(word: string): string {
  const known = kept.get(word);
  if (known) return known;
  let w = word;
  for (const ending of ['eth', 'est', 'ing', 'ed', 'es', 's']) {
    if (w.endsWith(ending) && w.length - ending.length >= 3) {
      w = w.slice(0, -ending.length);
      break;
    }
  }
  if (w.endsWith('e') && w.length > 3) w = w.slice(0, -1);
  return w;
}

const pairs = (list: string[]) => new Set(list.slice(1).map((w, i) => `${list[i]} ${w}`));

/** Synonyms the KJV uses, from the Moby Thesaurus (public domain): "word<TAB>syn syn syn" per line. */
export function parseSynonyms(text: string) {
  const table = new Map<string, string[]>();
  for (const line of text.split('\n')) {
    const [word, list] = line.split('\t');
    if (word && list) table.set(word, list.split(' '));
  }
  return table;
}

/** The stems of a word's synonyms, found under the word as typed or with an ending taken off ("rods" as "rod"). */
function synonymStems(word: string, synonyms: Map<string, string[]>) {
  const forms = [word];
  for (const ending of ['es', 's', 'ed', 'd', 'ing', 'eth']) {
    if (word.endsWith(ending) && word.length - ending.length >= 3) forms.push(word.slice(0, -ending.length));
  }
  for (const form of forms) {
    const found = synonyms.get(form);
    if (found) return new Set(found.map(stem));
  }
  return new Set<string>();
}

/** One collection made ready for searching. Built once; searching never changes it. */
export class PassageIndex {
  private readonly stems: string[][];
  private readonly sets: Set<string>[];
  private readonly passageCount = new Map<string, number>();

  constructor(
    readonly passages: Passage[],
    private readonly synonyms: Map<string, string[]> = new Map(),
  ) {
    this.stems = passages.map((p) => words(p.text).map(stem));
    this.sets = this.stems.map((s) => new Set(s));
    for (const set of this.sets) for (const form of set) this.passageCount.set(form, (this.passageCount.get(form) ?? 0) + 1);
  }

  /**
   * The passages holding the words searched for, best first: passages holding every word, then those holding every
   * word or a synonym of it, then those holding at least half the words' weight, a rarer word weighing more and a
   * synonym less than the word. Among equals, the one holding the words most nearly in the order typed comes first,
   * then the one holding most of them. A passage gives one hit: a passage is left out when the one beside it was
   * already given. A word in more than one passage in ten (say, that, lord) is not widened to its synonyms.
   */
  search(text: string): PassageHit[] {
    const typed = words(text);
    const searched = typed.map(stem);
    const total = this.passages.length;
    const alternatives = new Map<string, Set<string>>();
    typed.forEach((word, i) => {
      const form = searched[i]!;
      if ((this.passageCount.get(form) ?? 0) >= total / 10) return;
      const set = alternatives.get(form) ?? new Set<string>();
      for (const s of synonymStems(word, this.synonyms)) if (s !== form && this.passageCount.has(s)) set.add(s);
      alternatives.set(form, set);
    });
    const weight = new Map<string, number>();
    for (const form of new Set(searched)) {
      const count = this.passageCount.get(form);
      if (count) weight.set(form, Math.log(total / count));
      else {
        const counts = [...(alternatives.get(form) ?? [])].map((a) => this.passageCount.get(a)!).filter(Boolean);
        if (counts.length) weight.set(form, Math.log(total / Math.max(...counts)));
      }
    }
    if (!weight.size) return [];
    const whole = [...weight.values()].reduce((a, b) => a + b, 0);
    const held = (form: string, set: Set<string>) => {
      if (set.has(form)) return 1;
      const other = alternatives.get(form);
      if (other) for (const a of other) if (set.has(a)) return 0.8;
      return 0;
    };
    const weigh = (set: Set<string>) => {
      let sum = 0;
      for (const [form, w] of weight) sum += w * held(form, set);
      return sum;
    };
    const searchedPairs = pairs(searched);
    type Candidate = { index: number; complete: boolean; withSynonyms: boolean; passage: number; inOrder: number; own: number };
    const candidates: Candidate[] = [];
    const forms = [...weight.keys()];
    for (let i = 0; i < total; i++) {
      const own = this.sets[i]!;
      const ownWeight = weigh(own);
      if (ownWeight <= 0) continue;
      const passage = new Set(own);
      const workId = this.passages[i]!.workId;
      if (i > 0 && this.passages[i - 1]!.workId === workId) for (const s of this.stems[i - 1]!) passage.add(s);
      if (i + 1 < total && this.passages[i + 1]!.workId === workId) for (const s of this.stems[i + 1]!) passage.add(s);
      const passageWeight = weigh(passage);
      if (passageWeight < whole * 0.5) continue;
      let inOrder = 0;
      for (const p of pairs(this.stems[i]!)) if (searchedPairs.has(p)) inOrder++;
      candidates.push({
        index: i,
        complete: forms.every((f) => passage.has(f)),
        withSynonyms: forms.every((f) => held(f, passage) > 0),
        passage: passageWeight,
        inOrder,
        own: ownWeight,
      });
    }
    candidates.sort(
      (a, b) =>
        Number(b.complete) - Number(a.complete) ||
        Number(b.withSynonyms) - Number(a.withSynonyms) ||
        b.passage - a.passage ||
        b.inOrder - a.inOrder ||
        b.own - a.own ||
        a.index - b.index,
    );
    const given = new Set<number>();
    const hits: PassageHit[] = [];
    for (const c of candidates) {
      if (given.has(c.index - 1) || given.has(c.index + 1)) continue;
      given.add(c.index);
      hits.push({ index: c.index, complete: c.complete });
    }
    return hits;
  }
}

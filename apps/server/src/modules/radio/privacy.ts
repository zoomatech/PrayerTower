// Privacy on the air (docs/STATION_OPERATOR_GUIDE.md, "Privacy on the air"): the words a
// radio prayer carries are made here, once, when the station claims it (index.ts claimNext,
// and the transmit job outside station mode), and kept as sent_text, so the listening page,
// the cast log and every listener see exactly what went out.
//
// Always: email addresses, web links, phone numbers and @handles are taken out, and an
// anonymous request never carries its author's name or handle.
// With radio_name_privacy_enabled on, a member who chose privacy (an anonymous request, or
// "Keep names off the radio" on Me) also has the names in the words replaced by "someone":
// a capitalized word in mid-sentence that isn't on the list of everyday words below, plus
// the author's own name wherever it appears. It errs toward taking a word out.
import type { Queryable } from '../../db.js';

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const LINK = /\b(?:https?:\/\/|www\.)\S*[^\s.,;:!?)]/gi;
// Seven or more digits, with the usual separators: a phone number, never a verse ("John 3:16")
// or a sentence's last number and the next one.
const PHONE = /\+?\(?\d(?:(?:[ ()-]|\.(?=\d)){0,2}\d){6,}/g;
const HANDLE = /(^|[\s(])@\w{2,30}\b/g;

/** Contact details never go on the air. */
export function scrubContact(text: string): string {
  return tidy(text.replace(EMAIL, '').replace(LINK, '').replace(PHONE, '').replace(HANDLE, '$1'));
}

/** Collapse what taking words out leaves behind: double spaces, a space before a comma. */
function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Capitalized words that are not names: faith words, family words, days and months, and
// the words a sentence often starts with. Compared in lower case.
const EVERYDAY = new Set(
  (
    'i a an the and but or so if in on at to of for with by from as after before when while until because since about please pray praying prayer prayers ' +
    'thank thanks thankful grateful help healing heal strength peace comfort wisdom guidance protection need needs asking ask lift lifting ' +
    'god god’s god\'s lord lord’s lord\'s jesus christ holy spirit father son heaven heavenly amen bless blessed blessing almighty savior saviour ' +
    'bible scripture psalm psalms church pastor mass ' +
    'my our we us me he him his she her hers they them their it its this that these those there here who what why how today tonight tomorrow ' +
    'yesterday now soon also just still all every each some any no not yes ' +
    'mom mum mother dad father grandma grandpa grandmother grandfather nana papa brother sister son daughter wife husband aunt uncle cousin ' +
    'niece nephew baby friend friends family neighbor neighbour boss coworker teacher doctor nurse ' +
    'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december ' +
    'christmas easter thanksgiving lent advent icu er covid ' +
    'english spanish dear may let would could should will can dr mr mrs ms fr rev st prof'
  ).split(/\s+/),
);

const WORD = /[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’-]*/g;

/** The author's name and handle, as separate words of two letters or more. */
function nameWords(names: (string | null | undefined)[]): Set<string> {
  return new Set(
    names
      .filter((n): n is string => !!n)
      .flatMap((n) => n.split(/[\s_.-]+/))
      .map((w) => w.toLowerCase())
      .filter((w) => w.length >= 2 && !EVERYDAY.has(w)),
  );
}

/**
 * Replace names with "someone". `known` (the author's name and handle) goes anywhere it
 * appears; with `guess`, so does any capitalized word in mid-sentence that isn't an
 * everyday word. "John Smith's" becomes "someone's".
 */
export function scrubNames(text: string, known: (string | null | undefined)[], guess: boolean): string {
  const names = nameWords(known);
  // A handle or a whole name first, as written ("margaret_l"), then word by word.
  for (const whole of known) {
    if (whole && whole.trim().length >= 2) text = text.replace(new RegExp(`(?<![\\w@])${whole.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`, 'gi'), 'someone');
  }
  let out = '';
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    const word = m[0];
    const at = m.index!;
    const possessive = /['’]s$/i.test(word);
    const bare = possessive ? word.slice(0, -2) : word;
    const lower = bare.toLowerCase();
    const before = text.slice(0, at).trimEnd();
    // "Dr. Okafor" is mid-sentence; "surgery. Tom" starts one.
    const sentenceStart = (before === '' || /[.!?:;\n"“(]$/.test(before)) && !/\b(?:dr|mr|mrs|ms|fr|rev|sr|st|jr|prof)\.$/i.test(before);
    const capitalized = /^[A-ZÀ-ÖØ-Þ][a-zß-öø-ÿ'’-]/.test(bare);
    const isName = names.has(lower) || (guess && capitalized && !sentenceStart && !EVERYDAY.has(lower));
    out += text.slice(last, at) + (isName ? (possessive ? 'someone’s' : 'someone') : word);
    last = at + word.length;
  }
  out += text.slice(last);
  // "someone someone" (a first and last name) is one person.
  return tidy(out.replace(/\bsomeone(?:\s+someone)+(’s)?/g, (_m, s: string | undefined) => `someone${s ?? ''}`));
}

export async function namePrivacyEnabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select radio_name_privacy_enabled as on from public.token_settings');
  return rows[0]!.on;
}

/**
 * The words that go on the air for a request: `body` is the request (or a thanksgiving's
 * text), cut to `max` characters after the privacy rules above.
 */
export async function airText(q: Queryable, postId: string, body: string, max: number): Promise<string> {
  const { rows } = await q.query<{ anonymous: boolean; names_private: boolean; display_name: string; handle: string | null }>(
    `select p.is_anonymous as anonymous, pr.radio_names_private as names_private, pr.display_name, pr.handle
       from public.posts p join public.profiles pr on pr.id = p.user_id where p.id = $1`,
    [postId],
  );
  const a = rows[0];
  let text = scrubContact(body);
  if (a) {
    const chose = a.anonymous || a.names_private;
    const guess = chose && (await namePrivacyEnabled(q));
    // An anonymous request never carries its author's name; a member who chose privacy, with the switch on, carries no names.
    if (a.anonymous || guess) text = scrubNames(text, [a.display_name, a.handle], guess);
  }
  return text.slice(0, max).trim();
}

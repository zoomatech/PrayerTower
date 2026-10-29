// Harmful prayer requests (docs/HARMFUL_PRAYERS.md), off by default.
// A free word check sorts text into categories: threats, hate, prayers for
// someone's harm or death, curses, revenge, abuse disclosures, and swearing.
// Steve's rules: only obvious junk is refused by the machine; anything that may
// be real goes to a person before it is removed, and nobody describing their own
// trauma is blocked. Swearing out of anguish is allowed. Nothing flagged here is
// sent by radio or amplified until a person clears it. A flood from one account
// is bundled into one queue item so it can't swamp the reviewers.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { AppError } from '../../errors.js';
import * as communities from '../communities/index.js';
import * as notifications from '../notifications/index.js';

export const CATEGORIES = ['threat', 'hate', 'harm_wish', 'curse', 'revenge', 'abuse_disclosure', 'foul'] as const;
export type Category = (typeof CATEGORIES)[number];
export type Action = 'filter' | 'hold' | 'review' | 'support' | 'allow';
type Target = 'post' | 'comment' | 'message';

// The check ---------------------------------------------------------------------

/** Someone else: a pronoun, "my <relation>", or "that/the <person>" (never "the cancer"). */
const OTHER =
  "(?:him|her|them|you|he|she|they|y'?all|my (?:\\w+ )?(?:ex|husband|wife|boss|father|mother|dad|mom|stepdad|stepmom|stepfather|stepmother|brother|sister|son|daughter|neighbou?r|landlord|pastor|coworker|co-worker|teacher|enemy|enemies|in-laws?|boyfriend|girlfriend|partner|uncle|aunt|cousin|abuser)|(?:that|those|the|this) (?:man|woman|guy|girl|boy|person|people|driver|doctor|judge|cop|officer|criminal|murderer|killer|thief|abuser|monster|bastard|bitch|jerk|idiot|liar|family))";
const NOT_SELF = '(?!\\s+(?:myself|me)\\b)';

const THREAT = [
  new RegExp(`\\bi(?:'m| am|'ll| will)?\\s+(?:going to|gonna|will|plan to|about to)\\s+(?:\\w+\\s+){0,2}?(?:kill|murder|shoot|stab|strangle|choke|beat|bomb|poison|burn|run over|hurt|end)${NOT_SELF}\\s+${OTHER}(?!'s)`, 'i'),
  new RegExp(`\\bi(?:'ll| will)\\s+(?:kill|murder|shoot|stab|strangle|choke|beat|bomb|poison|hurt)${NOT_SELF}\\s+${OTHER}(?!'s)`, 'i'),
  /\b(?:you(?:'re| are)? (?:going to|gonna|will) (?:die|pay|regret)|you(?:'ll| will) be sorry|watch your back|i know where you live|you'?re (?:a )?dead (?:man|woman|meat))\b/i,
];

const DEATH_OR_HARM =
  '(?:die|dies|dead|death|drop dead|suffer|suffers|gets? cancer|burn in hell|rot in hell|rot|go to hell|be destroyed|perish|get hurt|be hurt|have an accident|crash|be struck|lose everything|be punished|be killed)';
const HARM_WISH = [
  new RegExp(`\\b(?:pray(?:ing)?|hope|hoping|wish|wishing|want|asking (?:god|the lord|jesus)|ask (?:god|the lord|jesus))\\b(?: (?:that|for))? ${OTHER}\\b(?![^.!?]{0,30}\\b(?:not|\\w+n't|never|no longer|stop|as|because|since|who|while|before|when|if)\\b)[^.!?]{0,30}?\\b${DEATH_OR_HARM}\\b(?![^.!?]{0,20}\\b(?:peacefully|in peace|without pain|comfortabl\\w*|at home|surrounded)\\b)`, 'i'),
  new RegExp(`\\b(?:god|lord|jesus|father|heaven),? (?:please )?(?:strike|smite|punish|destroy|kill|curse|damn|crush)\\s+${OTHER}`, 'i'),
  new RegExp(`(?<!(?:n't|not|never) )\\b(?:may|let) (?:god |the lord |heaven )?(?:strike|smite|punish|destroy|kill|curse|damn|crush)\\s+${OTHER}`, 'i'),
  new RegExp(`(?<!(?:n't|not|never) )\\b(?:may|let) ${OTHER} (?:die|suffer|rot|burn|perish|be destroyed)\\b`, 'i'),
  /\bdrop dead\b/i,
];

const CURSE = [
  new RegExp(`(?<!\\b(?:break|breaking|broke|lift|lifting|remove|removing|from|of) (?:the |this |a |every )?)\\b(?:i |we )?(?:curse|hex|jinx|cast a spell on|put a curse on|place a curse on|damn)\\s+${OTHER}`, 'i'),
  new RegExp(`\\b(?:may|let) ${OTHER} be (?:cursed|damned)\\b`, 'i'),
  /\b(?:a )?curse (?:on|upon) (?:him|her|them|you|his|her|their)\b/i,
];

const REVENGE = [
  /\b(?:revenge|avenge|payback|retribution)\b/i,
  new RegExp(`\\b(?:make|see) ${OTHER} pay\\b|\\bget (?:back at|even with) ${OTHER}`, 'i'),
  /\bvengeance (?:on|upon|against)\b/i,
];
/** Scripture and prayers that give revenge up are not revenge. */
const REVENGE_RELEASED = /\b(?:vengeance is mine|leave (?:it|vengeance|revenge|room)|not (?:seek|take|want) (?:revenge|vengeance)|let go of (?:my )?(?:anger|revenge)|without revenge|instead of revenge|desire for revenge)\b/i;

const GROUPS =
  '(?:jews|muslims|christians|catholics|mormons|atheists|gays|lesbians|homosexuals|trans(?:gender)? people|blacks|whites|asians|mexicans|immigrants|refugees|arabs|hindus|liberals|conservatives|democrats|republicans|women|men)';
const HATE = [
  new RegExp(`\\b(?:all |the |those |these )?${GROUPS} (?:should|must|need to|deserve to|ought to) (?:all )?(?:die|burn|be killed|be wiped out|be exterminated|go to hell|be destroyed|be eradicated)\\b`, 'i'),
  new RegExp(`\\b(?:kill|exterminate|wipe out|get rid of|eradicate) (?:all )?(?:the )?${GROUPS}\\b`, 'i'),
  new RegExp(`\\bgod hates ${GROUPS}\\b`, 'i'),
  new RegExp(`\\b${GROUPS} are (?:vermin|animals|subhuman|a disease|parasites|cockroaches|demons)\\b`, 'i'),
];

const ABUSE = [
  /\b(?:he|she|they|my \w+(?: \w+)?) (?:hits?|beats?|beat|rapes?|raped|molests?|molested|abuses?|abused|chokes?|choked|strangled|kicks?|kicked|punch(?:es|ed)?|slaps?|slapped|threatens?|threatened) me\b/i,
  /\bi (?:was|am being|got|have been|was being|am) (?:raped|molested|abused|beaten|assaulted|trafficked|groomed|sexually assaulted)\b/i,
  /\b(?:sexual(?:ly)? (?:abused|assaulted|abuse|assault)|domestic (?:violence|abuse)|abusive (?:husband|wife|partner|relationship|father|mother|parent|dad|mom|boyfriend|girlfriend|home|marriage)|(?:afraid|scared) (?:to go|of going) home)\b/i,
];

const SWEAR = /^(?:fuck\w*|motherfuck\w*|shit\w*|bullshit|horseshit|goddamn\w*|damn\w*|bitch\w*|bastard\w*|asshole\w*|cunt\w*|dick(?:head)?s?|piss(?:ed)?|crap\w*|wtf|stfu|ffs)$/i;
/** Words that mean something real is going on: never refuse text that has them. */
const REAL = /\b(?:die[ds]?|dead|death|lost|loss|cancer|hospital|help|please|pray\w*|god|lord|jesus|baby|child|kids?|mom|dad|husband|wife|why|hurt\w*|pain|alone|scared|afraid)\b/i;

export interface Verdict {
  categories: Category[];
  swears: number;
  /** Nothing but swearing: the only text refused automatically. */
  junk: boolean;
}

/** Sorts text into categories. Pure, so the app's precheck and the tests can use it. */
export function check(text: string, extraHateWords: string[] = []): Verdict {
  const t = text.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/[\u2018\u2019]/g, "'");
  const words = t.split(/[^\p{L}\p{N}'*]+/u).filter(Boolean);
  const swears = words.filter((w) => SWEAR.test(w.replace(/^'+|'+$/g, ''))).length;
  const has = (list: RegExp[]) => list.some((r) => r.test(t));
  const lower = t.toLowerCase();
  const cats: Category[] = [];
  if (has(THREAT)) cats.push('threat');
  if (has(HATE) || extraHateWords.some((w) => w.trim() && new RegExp(`\\b${escape(w.trim().toLowerCase())}\\b`, 'i').test(lower))) cats.push('hate');
  if (has(HARM_WISH)) cats.push('harm_wish');
  if (has(CURSE)) cats.push('curse');
  if (has(REVENGE) && !REVENGE_RELEASED.test(t)) cats.push('revenge');
  if (has(ABUSE)) cats.push('abuse_disclosure');
  const others = words.length - swears;
  const junk = swears >= 3 && others < 3 && !REAL.test(t) && cats.length === 0;
  return { categories: cats, swears, junk };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Settings ------------------------------------------------------------------------

export interface HarmSettings {
  enabled: boolean;
  threat_action: 'hold' | 'review' | 'allow';
  hate_action: 'hold' | 'review' | 'allow';
  harm_wish_action: 'hold' | 'review' | 'allow';
  curse_action: 'hold' | 'review' | 'allow';
  revenge_action: 'hold' | 'review' | 'allow';
  abuse_action: 'support' | 'allow';
  foul_hold_at: number;
  foul_junk_filter: boolean;
  flood_per_day: number;
  extra_hate_words: string[];
}
const COLUMNS = [
  'enabled',
  'threat_action',
  'hate_action',
  'harm_wish_action',
  'curse_action',
  'revenge_action',
  'abuse_action',
  'foul_hold_at',
  'foul_junk_filter',
  'flood_per_day',
  'extra_hate_words',
] as const satisfies readonly (keyof HarmSettings)[];

export async function settings(q: Queryable): Promise<HarmSettings> {
  const { rows } = await q.query<HarmSettings>(`select ${COLUMNS.join(', ')} from public.harm_settings`);
  return rows[0]!;
}

const Level = z.enum(['hold', 'review', 'allow']);
export const SettingsPatch = z
  .object({
    enabled: z.boolean(),
    threat_action: Level,
    hate_action: Level,
    harm_wish_action: Level,
    curse_action: Level,
    revenge_action: Level,
    abuse_action: z.enum(['support', 'allow']),
    foul_hold_at: z.number().int().min(2).max(1000),
    foul_junk_filter: z.boolean(),
    flood_per_day: z.number().int().min(1).max(1000),
    extra_hate_words: z.array(z.string().trim().min(2).max(60)).max(500),
  })
  .partial();

export async function updateSettings(q: Queryable, patch: z.infer<typeof SettingsPatch>): Promise<HarmSettings> {
  const sets = COLUMNS.map((c, i) => `${c} = coalesce($${i + 1}, ${c})`).join(', ');
  const { rows } = await q.query<HarmSettings>(`update public.harm_settings set ${sets}, updated_at = now() returning ${COLUMNS.join(', ')}`, [
    ...COLUMNS.map((c) => patch[c] ?? null),
  ]);
  return rows[0]!;
}

// What happens ----------------------------------------------------------------------

/** Most serious first: the first category decides the action. */
const ORDER: Category[] = ['threat', 'hate', 'foul', 'harm_wish', 'curse', 'revenge', 'abuse_disclosure'];
const RANK: Record<Action, number> = { allow: 0, support: 1, review: 2, hold: 3, filter: 4 };

export interface Decision {
  category: Category;
  categories: Category[];
  action: Action;
}

/** The action for a verdict under the admin's settings, or null when nothing applies. */
export function decide(v: Verdict, s: HarmSettings): Decision | null {
  if (v.junk && s.foul_junk_filter) return { category: 'foul', categories: ['foul'], action: 'filter' };
  const cats = [...v.categories];
  if (v.swears >= s.foul_hold_at) cats.push('foul');
  const actionFor = (c: Category): Action =>
    c === 'threat' ? s.threat_action
    : c === 'hate' ? s.hate_action
    : c === 'harm_wish' ? s.harm_wish_action
    : c === 'curse' ? s.curse_action
    : c === 'revenge' ? s.revenge_action
    : c === 'abuse_disclosure' ? s.abuse_action
    : 'hold';
  let best: Decision | null = null;
  for (const c of ORDER.filter((c) => cats.includes(c))) {
    const action = actionFor(c);
    if (action !== 'allow' && (!best || RANK[action] > RANK[best.action])) best = { category: c, categories: cats, action };
  }
  return best;
}

// What the member sees ------------------------------------------------------------------

export interface Resource {
  label: string;
  url: string;
}

/** US hotlines, as listed on the CDC's "Get Help Right Now" page (cdc.gov/howrightnow/get-help). */
export const ABUSE_RESOURCES: Resource[] = [
  { label: 'In danger now: call 911', url: 'tel:911' },
  { label: 'Domestic violence: 1-800-799-7233', url: 'tel:18007997233' },
  { label: 'Text START to 88788', url: 'sms:88788?body=START' },
  { label: 'Sexual assault (RAINN): 800-656-4673', url: 'tel:18006564673' },
  { label: 'Child abuse (Childhelp): 1-800-422-4453', url: 'tel:18004224453' },
];

export interface Guidance {
  category: Category;
  action: Action;
  title: string;
  message: string;
  resources: Resource[];
}

// Open Circle (and any community with neutral wording): the same gentle words, without the religious ones.
const NEUTRAL: Record<Category, { title: string; message: string }> = {
  threat: {
    title: 'That sounds like a lot of anger',
    message: 'Anger is honest. If you are thinking of hurting someone, please talk to someone you trust first. You could ask for support with the anger, and for safety and fairness.',
  },
  hate: {
    title: 'Speak up for people, not against them',
    message: 'Every group here is made of people someone loves. Try saying what happened, and what would help.',
  },
  harm_wish: {
    title: 'Ask for fairness, not for harm',
    message: 'It is fine to be honest about someone who hurt you. Try asking for fairness, safety, and healing for what they did to you.',
  },
  curse: {
    title: 'Wish for good, never for harm',
    message: 'You can pour out your hurt here. Try asking for things to be made right, and for your own safety and healing.',
  },
  revenge: {
    title: 'Ask for fairness, not revenge',
    message: 'Revenge rarely heals what happened. Try asking for fairness and for your own healing.',
  },
  abuse_disclosure: {
    title: 'You are not alone',
    message: 'Thank you for trusting us with this. What happened to you is not your fault. If you are in danger, call 911. These lines are free, confidential and open all day and night.',
  },
  foul: {
    title: 'Tell us what is going on',
    message: 'It sounds like something hurts badly. Say a little about what happened, so people know how to support you.',
  },
};

/** A gentle word for the member: a redirect, never a lecture. `secular` gives Open Circle's wording. */
export function guidance(d: Decision, secular = false): Guidance {
  const abuse = d.categories.includes('abuse_disclosure');
  const resources = abuse ? ABUSE_RESOURCES : [];
  const held = d.action === 'hold' ? ' A moderator will read it before others see it.' : '';
  const text: Record<Category, { title: string; message: string }> = {
    threat: {
      title: 'That sounds like a lot of anger',
      message: 'Anger can be prayed honestly. If you are thinking of hurting someone, please talk to someone you trust first. You could ask for prayer for the anger, and for protection and justice.',
    },
    hate: {
      title: 'Pray for people, not against them',
      message: 'Every group here is made of people someone loves. Try praying about what happened, and for peace.',
    },
    harm_wish: {
      title: 'Ask for justice, and leave the rest to God',
      message: 'The Psalms are honest about enemies, and they leave vengeance to God. Try asking for justice, protection, and healing for what they did to you.',
    },
    curse: {
      title: 'Pray for good, never for harm',
      message: 'You can pour out your hurt here. Try asking God to deal with them justly, and to protect and heal you.',
    },
    revenge: {
      title: 'Ask for justice, and leave the rest to God',
      message: '"Do not take revenge … leave room for God\'s wrath" (Romans 12:19). Try asking for justice and for your own healing.',
    },
    abuse_disclosure: {
      title: 'You are not alone',
      message: 'Thank you for trusting us with this. What happened to you is not your fault. If you are in danger, call 911. These lines are free, confidential and open all day and night.',
    },
    foul: {
      title: 'Tell us what is going on',
      message: 'It sounds like something hurts badly. Say a little about what happened, so people know how to pray for you.',
    },
  };
  const t = (secular ? NEUTRAL : text)[abuse && d.category !== 'threat' && d.category !== 'hate' ? 'abuse_disclosure' : d.category];
  return { category: d.category, action: d.action, title: t.title, message: t.message + (d.action === 'filter' ? '' : held), resources };
}

/** For the precheck: the gentle word before posting, or null when the check is off or nothing applies. */
export async function precheck(q: Queryable, text: string, userId?: string): Promise<Guidance | null> {
  const s = await settings(q);
  if (!s.enabled || !text.trim()) return null;
  const d = decide(check(text, s.extra_hate_words), s);
  return d ? guidance(d, userId ? await communities.isSecular(q, userId) : false) : null;
}

// Before and after saving -------------------------------------------------------------

/**
 * Before saving: refuses only obvious junk (text that is nothing but swearing), and
 * returns the decision to apply once the item is saved. Null when the check is off.
 */
export async function screen(q: Queryable, userId: string, _target: Target, text: string): Promise<Decision | null> {
  const s = await settings(q);
  if (!s.enabled || !text.trim()) return null;
  const d = decide(check(text, s.extra_hate_words), s);
  if (!d) return null;
  // Nothing is saved, so the member can simply say more and post again.
  if (d.action === 'filter') throw new AppError(422, 'filtered', guidance(d, await communities.isSecular(q, userId)).message);
  return d;
}

export const HARM_REASON: Record<Category, string> = {
  threat: 'Possible threat: a person should read this',
  hate: 'Possible hate against a group',
  harm_wish: 'Prayer for someone to be harmed',
  curse: 'A curse on someone',
  revenge: 'Wants revenge',
  abuse_disclosure: 'Someone may be being abused: check in kindly',
  foul: 'A lot of swearing: a person should read this',
};
const FLOOD_REASON = 'Flood: many flagged items from one account today (Admin → Moderation → Harm floods)';

/**
 * After saving: marks the item, holds it if needed, sends it to a person, and
 * offers support to someone disclosing abuse. Past the account's daily flood
 * limit, items are held and bundled into one queue item instead.
 */
export async function apply(q: Queryable, userId: string, target: Target, id: string, d: Decision | null): Promise<Guidance | null> {
  if (!d) return null;
  const s = await settings(q);
  if (target !== 'message') await q.query(`update public.${target === 'post' ? 'posts' : 'comments'} set harm_category = $2 where id = $1`, [id, d.category]);
  const { rows: today } = await q.query<{ n: number; bundled: number }>(
    `select count(*)::int as n, count(*) filter (where action = 'bundled')::int as bundled
       from public.harm_events where user_id = $1 and created_at > now() - interval '1 day'`,
    [userId],
  );
  const flooding = today[0]!.n >= s.flood_per_day;
  const action = flooding ? 'bundled' : d.action;
  await q.query(`insert into public.harm_events (user_id, target_type, target_id, category, action) values ($1, $2, $3, $4, $5)`, [
    userId,
    target,
    id,
    d.category,
    action,
  ]);
  const table = { post: 'posts', comment: 'comments', message: 'messages' }[target];
  // Abuse disclosures are never hidden, not even in a flood: nobody describing their trauma is held back.
  if (d.action === 'hold' || (flooding && d.action !== 'support')) await q.query(`update public.${table} set moderation_status = 'hidden_pending_review' where id = $1 and moderation_status = 'visible'`, [id]);
  // One queue item per account per day once it floods; one per item before that.
  if (!flooding || today[0]!.bundled === 0) {
    const { rows } = await q.query<{ community_id: string }>(`select community_id from public.${table} where id = $1`, [id]);
    await q.query(
      `insert into public.moderation_items (target_type, target_id, user_id, community_id, source, reason, ai_categories, auto_hidden)
       values ($1, $2, $3, $4, 'harm', $5, $6, $7)
       on conflict (target_type, target_id) where source = 'harm' do nothing`,
      [target, id, userId, rows[0]!.community_id, flooding ? FLOOD_REASON : HARM_REASON[d.category], { harm: d.categories }, d.action === 'hold' || (flooding && d.action !== 'support')],
    );
  }
  const secular = await communities.isSecular(q, userId);
  const g = guidance(d, secular);
  // Someone disclosing abuse hears from us privately, with the hotlines, once a day at most.
  if (d.categories.includes('abuse_disclosure') && s.abuse_action === 'support') {
    await notifications.notify(q, userId, {
      kind: 'support_resources',
      title: 'You are not alone',
      body: `${guidance({ ...d, category: 'abuse_disclosure', action: 'support' }, secular).message} Domestic violence: 1-800-799-7233 (or text START to 88788). Sexual assault: 800-656-4673. Child abuse: 1-800-422-4453.`,
      data: { resources: ABUSE_RESOURCES },
      dedupeKey: `support_resources:${userId}:${new Date().toISOString().slice(0, 10)}`,
    });
  }
  return g;
}

/** A moderator dismissed the flag: the item may now be amplified and sent by radio. */
export async function clear(q: Queryable, target: string, id: string) {
  if (target === 'post' || target === 'comment') await q.query(`update public.${target}s set harm_category = null where id = $1`, [id]);
  await q.query(`update public.harm_events set cleared_at = now() where target_type = $1 and target_id = $2 and cleared_at is null`, [target, id]);
}

// Floods --------------------------------------------------------------------------------

/** Accounts with bundled items still waiting, newest first. */
export async function floods(q: Queryable) {
  const { rows } = await q.query(
    `select e.user_id, p.display_name, count(*)::int as items, min(e.created_at) as first_at, max(e.created_at) as last_at,
            array_agg(distinct e.category) as categories
       from public.harm_events e join public.profiles p on p.id = e.user_id
      where e.action = 'bundled' and e.cleared_at is null
      group by e.user_id, p.display_name order by max(e.created_at) desc limit 100`,
  );
  return rows;
}

export const FloodDecision = z.object({ action: z.enum(['release', 'remove']) });

/** One decision for a whole flood: show everything again, or remove all of it. */
export async function decideFlood(q: Queryable, moderatorId: string, userId: string, action: 'release' | 'remove') {
  const { rows } = await q.query<{ target_type: Target; target_id: string }>(
    `update public.harm_events set cleared_at = now()
      where user_id = $1 and action = 'bundled' and cleared_at is null returning target_type, target_id`,
    [userId],
  );
  for (const r of rows) {
    const table = { post: 'posts', comment: 'comments', message: 'messages' }[r.target_type];
    if (action === 'release') {
      await q.query(`update public.${table} set moderation_status = 'visible' where id = $1 and moderation_status = 'hidden_pending_review'`, [r.target_id]);
      if (r.target_type !== 'message') await q.query(`update public.${table} set harm_category = null where id = $1`, [r.target_id]);
    } else {
      await q.query(`update public.${table} set moderation_status = 'removed' where id = $1 and moderation_status <> 'removed'`, [r.target_id]);
    }
  }
  // The flood's own queue item is settled too.
  await q.query(
    `update public.moderation_items set status = $3::public.moderation_item_status, decided_by = $2, decided_at = now(), rule = $5
      where user_id = $1 and source = 'harm' and status = 'pending' and reason = $4`,
    [userId, moderatorId, action === 'release' ? 'dismissed' : 'actioned', FLOOD_REASON, action === 'release' ? null : 'harm'],
  );
  return { items: rows.length };
}

export async function metrics(q: Queryable, since: Date) {
  const { rows } = await q.query(
    `select category, action, count(*)::int as n from public.harm_events where created_at >= $1 group by category, action order by category, action`,
    [since],
  );
  return rows;
}

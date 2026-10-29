// The kind cloud ("What would Ted Lasso do?", Steve, 2026-10-29). Off until
// notebook_settings.kind_cloud_enabled. A small cloud in the corner of the
// composer asks "Are you sure you want to put that out there?" when words look
// aimed at someone, and asks more firmly ('strong') for a threat or a stream of
// swearing. It never stops a post: Steve (2026-10-29) wants a person to review
// anything before it is blocked, so no one describing their trauma is refused.
// Holding threats for a moderator belongs to the harm filter (thread "Prepare
// for harmful prayer requests"). Swearing out of anguish, not aimed at anyone
// ("this damn cancer", "I'm so f***ing scared"), gets no cloud at all.
//
// The check is plain word rules on our own server: instant, free, and the same
// answer every time. The AI safety check still runs after posting as before,
// and its verdict can raise a cloud in the pre-check.
// Research and sources: docs/KIND_CLOUD.md.
import type { Queryable } from '../../db.js';

export type CloudReason = 'threat' | 'foul' | 'aimed' | 'shouting';
export interface Verdict {
  level: 'ok' | 'nudge' | 'strong';
  reason?: CloudReason;
}

// Strong swear words, with the usual disguises (f*ck, sh!t, fuuuck).
const SWEAR = /\b(?:mother)?f+[u*@#]+c*[k*]+\w*|\bsh+[i1!*]+t+\w*|\bb[i1!*]+tch\w*|\bbastards?\b|\ba+ss+h[o0*]+les?\b|\bcunts?\b|\bdick(?:head)?s?\b|\bpiss(?:ed)?\b|\bwtf\b|\bstfu\b/g;
const INSULT = /\b(?:idiots?|stupid|morons?|losers?|pathetic|worthless|dumb|fools?|hypocrites?|ugly|trash|garbage|scum|disgusting|freaks?|retard\w*|clowns?|liars?)\b/;
const YOU = /^(?:you|u|ur|your|youre|you're|yours|yourself|ya|y'all|yall)$/;
const AIMED = [/\bshut\s+up\b/, /\bscrew\s+(?:you|u)\b/, /\bgo\s+to\s+hell\b/, /\bhate\s+(?:you|u)\b/, /\bnobody\s+(?:likes|cares about)\s+(?:you|u)\b/];
// Kept narrow on purpose: "I will find you a church" or "I want to kill myself" are not threats
// (the second is met with crisis support, never refused).
const THREATS = [
  /\bi(?:'ll| will|'m going to| am going to|'m gonna| am gonna| gonna| want to| wanna)\s+(?:kill|hurt|beat|shoot|stab|strangle|choke|murder|end|rape|destroy)\s+(?:you|u|ya|him|her|them|your)\b/,
  /\bi(?:'ll| will)\s+make\s+(?:you|u)\s+(?:pay|suffer|regret)\b/,
  /\b(?:kill|hang|shoot)\s+your\s*self\b/,
  /\bkys\b/,
  /\bi\s+hope\s+(?:you|u)\s+(?:die|get\s+cancer|burn)\b/,
  /\b(?:you|u)(?:'re| are| r)\s+(?:dead|gonna die|going to die)\b/,
  /\byou\s+deserve\s+to\s+die\b/,
  /\bi\s+know\s+where\s+(?:you|u)\s+live\b/,
  /\bwatch\s+your\s+back\b/,
  /\bhunt\s+(?:you|u)\s+down\b/,
];

/** Rules only, so the same words always get the same answer. */
export function assess(raw: string): Verdict {
  const text = raw.toLowerCase().replace(/[’`]/g, "'");
  if (THREATS.some((r) => r.test(text))) return { level: 'strong', reason: 'threat' };
  const words = text.split(/\s+/).filter(Boolean);
  const swears = text.match(SWEAR)?.length ?? 0;
  // Excessive: a stream of swearing, not a word of pain.
  if (swears >= 5 || (swears >= 3 && swears / words.length >= 0.2)) return { level: 'strong', reason: 'foul' };
  // Aimed: a swear word or an insult within a few words of "you".
  // Trim punctuation, but keep the * # @ ! that disguise a swear word ("f***").
  const tokens = words.map((w) => w.replace(/^[^\w'*#@!]+|[^\w'*#@!]+$/g, '').replace(/[.,?!]+$/, ''));
  const bad = (w: string) => w.search(SWEAR) === 0 || INSULT.test(w);
  for (let i = 0; i < tokens.length; i++) {
    if (!YOU.test(tokens[i]!)) continue;
    const near = tokens.slice(Math.max(0, i - 3), i + 5);
    // "I f***ing love you" is love, not an attack.
    if (near.some((w) => /^(?:love|miss|thank|thanks|proud)$/.test(w))) continue;
    if (near.some(bad)) return { level: 'nudge', reason: 'aimed' };
  }
  if (AIMED.some((r) => r.test(text))) return { level: 'nudge', reason: 'aimed' };
  // Shouting: mostly capitals, long enough to be more than one word of joy ("AMEN!").
  const letters = raw.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 20 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) return { level: 'nudge', reason: 'shouting' };
  return { level: 'ok' };
}

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select kind_cloud_enabled as on from public.notebook_settings');
  return rows[0]?.on === true;
}

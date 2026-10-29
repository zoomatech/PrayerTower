// The English words for the native SwiftUI app (apps/ios-native), from the same
// sources as this app: locales/en.ts, and for Open Circle the neutral tree
// (neutral-tree.ts). Flattened to "section.key" → text and written as JSON into
// PrayerTowerKit's resources by scripts/native-strings.ts. A test here fails when
// the committed JSON is out of date, so the two apps never drift apart.
import {
  ACTION_LABELS,
  CARE_KIND_LABELS,
  EVENT_KIND_LABELS,
  FREQUENCY_LABELS,
  POST_TYPE_LABELS,
  PRAYER_KIND_LABELS,
  PRAYER_REALM_LABELS,
  WHY_HERE_LABELS,
} from '@prayer-tower/shared';

import en from '@/locales/en';
import { keys as neutralKeys, literals } from '@/locales/neutral';
import { merge, neutralEnglish, neutralString } from './neutral-tree';

type Tree = { [key: string]: unknown };

function flatten(tree: Tree, prefix = '', out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else if (v && typeof v === 'object') flatten(v as Tree, key, out);
  }
  return out;
}

const sorted = (o: Record<string, string>) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]!]));

/** `faith`: Prayer Tower's words. `neutral`: Open Circle's, plus `literal:<text>` for text the server sends. */
export function nativeStrings() {
  // The labels the Expo app passes as label() defaults, so both wordings have every one.
  const labels = {
    enums: {
      postType: POST_TYPE_LABELS,
      prayerKind: PRAYER_KIND_LABELS,
      prayerRealm: PRAYER_REALM_LABELS,
      frequency: FREQUENCY_LABELS,
      action: ACTION_LABELS,
      whyHere: WHY_HERE_LABELS,
      eventKind: EVENT_KIND_LABELS,
      careKind: CARE_KIND_LABELS,
    },
  };
  const english = merge(labels, en as Tree);
  const neutral = flatten(neutralEnglish(english, neutralKeys));
  for (const [from, to] of Object.entries(literals as Record<string, string>)) neutral[`literal:${from}`] = neutralString(to);
  return { faith: sorted(flatten(english)), neutral: sorted(neutral) };
}

export const nativeStringsJSON = () => {
  const s = nativeStrings();
  return { faith: `${JSON.stringify(s.faith, null, 1)}\n`, neutral: `${JSON.stringify(s.neutral, null, 1)}\n` };
};

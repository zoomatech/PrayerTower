// The Open Circle (secular) English: every string runs through the shared
// word-level fallback, then the hand-written wording in locales/neutral.ts wins
// wherever it exists. So a string nobody rewrote still never says "prayer" or
// "church" to an Open Circle member or admin.
import { neutralText } from '@prayer-tower/shared';

type Tree = { [key: string]: unknown };

export function merge(base: Tree, over: Tree): Tree {
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = v && typeof v === 'object' && b && typeof b === 'object' ? merge(b as Tree, v as Tree) : v;
  }
  return out;
}

/** One string in Open Circle wording; `name` is the edition's name (EXPO_PUBLIC_OPEN_CIRCLE_NAME). */
export const neutralString = (text: string, name = 'Open Circle') => neutralText(text).replaceAll('Open Circle', name);

const fallback = (tree: Tree, name: string): Tree =>
  Object.fromEntries(Object.entries(tree).map(([k, v]) => [k, typeof v === 'string' ? neutralString(v, name) : v && typeof v === 'object' ? fallback(v as Tree, name) : v]));

export const neutralEnglish = (en: Tree, keys: Tree, name = 'Open Circle'): Tree => merge(fallback(en, name), keys);

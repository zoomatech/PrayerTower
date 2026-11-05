// The Full Screen Sparkler skin's post backgrounds (Steve, 2026-11-01): chosen like Facebook post
// backgrounds, from solid color blocks, starfields, flowers and textures, under Menu → Settings →
// Themes → Full Screen Sparkler Theme → Background choices. Every one is drawn (no pictures), and
// the choice is kept on this device. The same list is in the native app (Kit Sparkler.swift).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

export type SparklerGroup = 'solid' | 'stars' | 'flowers' | 'texture';

export interface SparklerBackground {
  id: string;
  group: SparklerGroup;
  name: string;
  /** The block's color, under any drawn pattern. */
  base: string;
  /** Text on it is light when true. */
  dark: boolean;
}

export const SPARKLER_BACKGROUNDS: SparklerBackground[] = [
  { id: 'white', group: 'solid', name: 'White', base: '#FFFFFF', dark: false },
  { id: 'sky', group: 'solid', name: 'Sky blue', base: '#D9ECFB', dark: false },
  { id: 'mint', group: 'solid', name: 'Mint', base: '#DAF2E2', dark: false },
  { id: 'lavender', group: 'solid', name: 'Lavender', base: '#E8DFF7', dark: false },
  { id: 'peach', group: 'solid', name: 'Peach', base: '#FCE1D0', dark: false },
  { id: 'butter', group: 'solid', name: 'Butter yellow', base: '#FFF3C4', dark: false },
  { id: 'navy', group: 'solid', name: 'Navy', base: '#1B2A4A', dark: true },
  { id: 'plum', group: 'solid', name: 'Plum', base: '#4A2545', dark: true },
  { id: 'starfield', group: 'stars', name: 'Starfield', base: '#0B1330', dark: true },
  { id: 'deep-space', group: 'stars', name: 'Deep space', base: '#04050D', dark: true },
  { id: 'meadow', group: 'flowers', name: 'Meadow flowers', base: '#FBF6E9', dark: false },
  { id: 'blossoms', group: 'flowers', name: 'Pink blossoms', base: '#FDEEF2', dark: false },
  { id: 'linen', group: 'texture', name: 'Linen', base: '#F3EEE4', dark: false },
  { id: 'paper', group: 'texture', name: 'Paper', base: '#FAF7EF', dark: false },
  { id: 'wood', group: 'texture', name: 'Wood grain', base: '#E7D4B4', dark: false },
];

/** The night block the default white becomes in dark mode (Steve, 2026-11-01: the stardust needs a dark feed to show). */
export const NIGHT: SparklerBackground = { id: 'night', group: 'solid', name: 'Night', base: '#10131C', dark: true };

/** The background a post shows: the member's choice, except that the default white turns to night in dark mode. */
export function shownBackground(bg: SparklerBackground, dark: boolean): SparklerBackground {
  return dark && bg.id === 'white' ? NIGHT : bg;
}

export const SPARKLER_GROUPS: SparklerGroup[] = ['solid', 'stars', 'flowers', 'texture'];
export const DEFAULT_SPARKLER_BACKGROUND = 'white';

export function sparklerBackground(id: string | null | undefined): SparklerBackground {
  return SPARKLER_BACKGROUNDS.find((b) => b.id === id) ?? SPARKLER_BACKGROUNDS[0]!;
}

/** The same numbers every time for the same seed, so a post's pattern doesn't jump as it redraws. */
export function seeded(seed: number) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Stars across a w × h block: one about every 1,400 square points, a few bigger and bluer. */
export function starPoints(w: number, h: number, seed: number) {
  const rnd = seeded(seed);
  const n = Math.round((w * h) / 1400);
  return Array.from({ length: n }, () => {
    const big = rnd() < 0.08;
    return { x: rnd() * w, y: rnd() * h, r: big ? 1.4 + rnd() * 0.8 : 0.4 + rnd() * 0.7, o: 0.45 + rnd() * 0.55, blue: rnd() < 0.2 };
  });
}

/** Flowers scattered over a w × h block: one about every 9,000 square points, never cut off at the top. */
export function flowerPoints(w: number, h: number, seed: number) {
  const rnd = seeded(seed);
  const n = Math.max(3, Math.round((w * h) / 9000));
  return Array.from({ length: n }, () => ({ x: rnd() * w, y: 10 + rnd() * Math.max(0, h - 20), r: 6 + rnd() * 6, turn: rnd() * 72, hue: Math.floor(rnd() * 3) }));
}

/** One five-petal flower as an SVG path, petals round a center at (x, y). */
export function petalPath(x: number, y: number, r: number, turn: number) {
  const parts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const a = ((turn + i * 72) * Math.PI) / 180;
    const tx = x + Math.cos(a) * r;
    const ty = y + Math.sin(a) * r;
    const side = r * 0.55;
    const l = a - Math.PI / 2;
    const c1 = `${(x + Math.cos(a) * r * 0.5 + Math.cos(l) * side).toFixed(1)} ${(y + Math.sin(a) * r * 0.5 + Math.sin(l) * side).toFixed(1)}`;
    const c2 = `${(x + Math.cos(a) * r * 0.5 - Math.cos(l) * side).toFixed(1)} ${(y + Math.sin(a) * r * 0.5 - Math.sin(l) * side).toFixed(1)}`;
    parts.push(`M ${x.toFixed(1)} ${y.toFixed(1)} Q ${c1} ${tx.toFixed(1)} ${ty.toFixed(1)} Q ${c2} ${x.toFixed(1)} ${y.toFixed(1)} Z`);
  }
  return parts.join(' ');
}

// The member's choice, kept on this device and shared by every screen that shows it.
const KEY = 'sparkler.background';
let current = DEFAULT_SPARKLER_BACKGROUND;
let loaded = false;
const listeners = new Set<() => void>();

export function setSparklerBackground(id: string) {
  current = sparklerBackground(id).id;
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, current).catch(() => undefined);
}

export function useSparklerBackground(): SparklerBackground {
  useEffect(() => {
    if (loaded) return;
    loaded = true;
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v && v !== current) {
          current = sparklerBackground(v).id;
          listeners.forEach((l) => l());
        }
      })
      .catch(() => undefined);
  }, []);
  const id = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
  return sparklerBackground(id);
}

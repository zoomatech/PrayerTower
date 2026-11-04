// The draw-in, shared by every skin that draws its connectors as the member scrolls
// (Steve, 2026-10-30: "The animated motion of vertically oriented forming connectors to
// post cards should be its own reusable subroutine"). A feed list provides a DrawBus and
// calls its `emit` from onScroll; each row calls useDrawIn(itsViewRef) and uncovers its
// drawing from the top down with the value it returns. A row's lines draw themselves in,
// growing downward, when it comes into view, and undraw once it has left, so they build
// again as the member scrolls back ("like the vines").
import { createContext, useContext, useEffect, useRef, type ComponentRef, type RefObject } from 'react';
import { Animated, Dimensions, Easing, View } from 'react-native';

import { useReducedMotion } from './motion';

/** A row's view, as a ref can hold it. */
export type Row = ComponentRef<typeof View>;

export type DrawBus = { sub: (fn: () => void) => () => void; emit: () => void };

export function makeDrawBus(): DrawBus {
  const subs = new Set<() => void>();
  return {
    sub: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    emit: () => subs.forEach((fn) => fn()),
  };
}

export const DrawBusContext = createContext<DrawBus | null>(null);

/** When a row counts as on screen: `y` and `h` are the row's top and height, `view` the window's height. */
export type SeenRule = (y: number, h: number, view: number) => boolean;

/** Neon Circuit's rule: a sliver of the row is on screen. */
export const SEEN_SLIVER: SeenRule = (y, h, view) => Math.min(y + h, view) - Math.max(y, 0) > Math.min(24, h * 0.05);

/** Beanstalk's rule, the design's IntersectionObserver: 8% of the post on screen, less the bottom 4%. */
export const SEEN_EIGHTH: SeenRule = (y, h, view) => {
  const bottom = view * 0.96;
  const seen = Math.min(y + h, bottom) - Math.max(y, 0);
  return seen >= h * 0.08 || seen >= 0.08 * bottom;
};

const NEON_EASE = Easing.inOut(Easing.cubic);

/** The parts of the draw-in a skin chooses: how long, how it eases, how far it counts, when a row is seen. */
export type DrawInStyle = {
  duration?: number;
  easing?: (t: number) => number;
  /** The value when fully drawn (1, or a skin's clock in ms). */
  to?: number;
  seen?: SeenRule;
  /** Milliseconds before the first check, for rows already on screen. */
  firstCheck?: number;
  /** Told each time the row comes into view (true) or leaves it (false), Reduce Motion or not. */
  onShow?: (shown: boolean) => void;
};

/**
 * `drawn` goes 0 → `to` (1 by default) as this row's lines draw in: once the row is seen, and
 * back to 0 once it is wholly off. Always `to` outside a feed that provides a DrawBus, or with
 * Reduce Motion. Hand `onLayout` to the row's view, so rows already on screen draw in as soon
 * as they are laid out.
 */
export function useDrawIn(ref: RefObject<Row | null>, style: number | DrawInStyle = 1100) {
  const { duration = 1100, easing = NEON_EASE, to = 1, seen = SEEN_SLIVER, firstCheck = 80, onShow } = typeof style === 'number' ? { duration: style } : style;
  const bus = useContext(DrawBusContext);
  const reduced = useReducedMotion();
  const live = !!bus && !reduced;
  const v = useRef(new Animated.Value(live ? 0 : to)).current;
  const recheck = useRef<() => void>(() => {});
  const told = useRef(onShow);
  told.current = onShow;
  useEffect(() => {
    if (!bus || reduced) v.setValue(to);
    if (!bus) return;
    let shown = false;
    const show = (now: boolean) => {
      if (now === shown) return;
      shown = now;
      told.current?.(now);
      if (reduced) return;
      v.stopAnimation();
      if (now) Animated.timing(v, { toValue: to, duration, easing, useNativeDriver: false }).start();
      else v.setValue(0);
    };
    const check = () =>
      ref.current?.measureInWindow((_x, y, _w, h) => {
        if (!h) return;
        const view = Dimensions.get('window').height;
        if (seen(y, h, view)) show(true);
        else if (y + h <= 0 || y >= view) show(false);
      });
    recheck.current = check;
    const first = setTimeout(check, firstCheck);
    const off = bus.sub(check);
    return () => {
      clearTimeout(first);
      off();
      recheck.current = () => {};
    };
  }, [bus, reduced, ref, v, duration, easing, to, seen, firstCheck]);
  return { drawn: v, onLayout: () => recheck.current() };
}

/**
 * Where one line down a whole feed ends, in the feed's own points from its top (Full Screen
 * Sparkler, Steve 2026-11-01): `at` of the screen below how far it has scrolled, so it grows as
 * you scroll, never drawing back (`reached` is what it had before) and never past the feed's end.
 * The same as Kit Sparkler.tip in the native app.
 */
export function lineTip(scrolled: number, screen: number, reached: number, feedHeight: number, at = 0.84) {
  const now = Math.max(0, scrolled) + screen * at;
  return Math.min(Math.max(reached, now), Math.max(0, feedHeight));
}

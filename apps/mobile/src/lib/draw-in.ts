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

/**
 * `drawn` goes 0 → 1 as this row's lines draw in: once a sliver of the row is on screen, and
 * back to 0 once it is wholly off. Always 1 outside a feed that provides a DrawBus, or with
 * Reduce Motion. Hand `onLayout` to the row's view, so rows already on screen draw in as soon
 * as they are laid out.
 */
export function useDrawIn(ref: RefObject<Row | null>, duration = 1100) {
  const bus = useContext(DrawBusContext);
  const reduced = useReducedMotion();
  const live = !!bus && !reduced;
  const v = useRef(new Animated.Value(live ? 0 : 1)).current;
  const recheck = useRef<() => void>(() => {});
  useEffect(() => {
    if (!bus || reduced) return v.setValue(1);
    let shown = false;
    const show = (now: boolean) => {
      if (now === shown) return;
      shown = now;
      v.stopAnimation();
      if (now) Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
      else v.setValue(0);
    };
    const check = () =>
      ref.current?.measureInWindow((_x, y, _w, h) => {
        if (!h) return;
        const view = Dimensions.get('window').height;
        const seen = Math.min(y + h, view) - Math.max(y, 0);
        if (seen > Math.min(24, h * 0.05)) show(true);
        else if (y + h <= 0 || y >= view) show(false);
      });
    recheck.current = check;
    const first = setTimeout(check, 80);
    const off = bus.sub(check);
    return () => {
      clearTimeout(first);
      off();
      recheck.current = () => {};
    };
  }, [bus, reduced, ref, v, duration]);
  return { drawn: v, onLayout: () => recheck.current() };
}

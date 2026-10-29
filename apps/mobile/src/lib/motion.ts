// iOS Settings → Accessibility → Motion → Reduce Motion (and the matching
// Android and browser settings). Feed skins and layouts check this and hold
// their animations still while it is on.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduced)
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

/**
 * Speak a short message to VoiceOver or TalkBack. iOS has no live regions, so text that
 * appears on its own (the kind cloud, a suggestion placed in the box) is announced here.
 */
export function announce(message: string) {
  AccessibilityInfo.announceForAccessibility(message);
}

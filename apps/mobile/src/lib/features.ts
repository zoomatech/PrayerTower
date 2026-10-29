// Switches for the notebook ideas built in Batch 7 (admin turns them off on
// the Admin screen). Fetched once per app session; while loading, or if the
// call fails, every feature stays hidden.
import { useEffect, useState } from 'react';

import { api, type Features } from './api';

const OFF: Features = { worldwideCount: false, thanksCard: false, sermonInputs: false, supportLabel: false, witnessStories: false, pressureRule: false, misleadingRule: false, automationRule: false, urgencyGlow: false, reactionTray: false, memberTown: false, prizeChoice: false, crossCommunity: false, postLines: false, checkinAffirmation: false, whyGifts: false, legalReview: false, podcasts: false, materialMatch: false, guestPrayer: false, prayerChain: false, prayedForWidget: false, prayerMinute: false };
let cached: Promise<Features> | null = null;

export function loadFeatures(): Promise<Features> {
  cached ??= api.features().then(
    // A switch the server doesn't send (an older server) stays off.
    (r) => ({ ...OFF, ...r.features }),
    () => {
      cached = null;
      return OFF;
    },
  );
  return cached;
}

/** Forget the cached switches (after an admin changes them). */
export function resetFeatures() {
  cached = null;
}

export function useFeatures(): Features {
  const [f, setF] = useState<Features>(OFF);
  useEffect(() => {
    let live = true;
    loadFeatures().then((x) => live && setF(x));
    return () => {
      live = false;
    };
  }, []);
  return f;
}

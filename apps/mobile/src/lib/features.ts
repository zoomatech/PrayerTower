// Switches for the notebook ideas built in Batch 7 (admin turns them off on
// the Admin screen). Fetched once per app session; while loading, or if the
// call fails, every feature stays hidden.
import { useEffect, useState } from 'react';

import { api, type Features } from './api';

const OFF: Features = { worldwideCount: false, thanksCard: false, sermonInputs: false, supportLabel: false, witnessStories: false, pressureRule: false, misleadingRule: false, automationRule: false, urgencyGlow: false, reactionTray: false, memberTown: false, prizeChoice: false, crossCommunity: false, postLines: false, checkinAffirmation: false, whyGifts: false, poolMatching: false, legalReview: false, podcasts: false, materialMatch: false, guestPrayer: false, prayerChain: false, prayedForWidget: false, prayerMinute: false, crosspost: false, followupNudge: false, gratitudeCard: false, gentleRhythm: false, encourager: false, remembered: false, welcomeCard: false, askKindly: false, mend: false, liftUp: false, gratitudeCount: false, believe: false, partners: false, kindnessHighlights: false, coolDown: false, lament: false, twoStep: false, feedSkins: false, commentTree: false, commentTreeLeaves: 5, commentTreeMaxDepth: 2, themeProposals: false, videoMaxSeconds: 7, kindCloud: false, meaningReactions: false, lamps: false, poolLedger: false, circleGoals: false, supportLinks: false, squireBoard: false, groupGifts: false, prayerList: false, readingPlan: false, replySuggestions: false, meaningPrefs: false, troubleNudge: false, greetingPacks: false, ownWords: false, kindClosings: false, talkCounts: false, meaningIconRow: false, kindnessResearch: false, meaningProposals: false, shareConsent: false, skinGallery: false };
let cached: Promise<Features> | null = null;

export function loadFeatures(): Promise<Features> {
  cached ??= Promise.resolve()
    .then(() => api.features())
    .then(
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

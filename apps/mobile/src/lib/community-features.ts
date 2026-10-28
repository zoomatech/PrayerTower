// Features an admin can hide for one community (Admin → Communities), such as
// radio for Open Circle. Outside the auth provider every feature is on.
import type { CommunityFeature } from '@prayer-tower/shared';

import { useAuth } from './auth';

/** Whether a feature is on for the member's community. */
export function useFeature(feature: CommunityFeature): boolean {
  let hidden: readonly string[] | undefined;
  try {
    hidden = useAuth().community?.hiddenFeatures;
  } catch {
    // No auth provider (a screen rendered on its own): show everything.
  }
  return !hidden?.includes(feature);
}

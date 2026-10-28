// Features an admin can hide for one community (Admin → Communities), such as
// radio for Open Circle. Outside the auth provider every feature is on.
import type { CommunityFeature } from '@prayer-tower/shared';
import { createContext, useContext } from 'react';

import * as auth from './auth';

// Tests that mock '@/lib/auth' leave out the context: fall back to an empty one.
const Context = auth.AuthContext ?? createContext(null);

/** Whether a feature is on for the member's community. */
export function useFeature(feature: CommunityFeature): boolean {
  return !useContext(Context)?.community?.hiddenFeatures?.includes(feature);
}

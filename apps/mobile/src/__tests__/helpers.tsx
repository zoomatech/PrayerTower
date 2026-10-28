// Test helpers: a sample card and a render that wraps screens in the language provider.
import type { Card } from '@prayer-tower/shared';
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { LocaleProvider } from '@/lib/i18n';

export const renderApp = (ui: ReactElement) => render(<LocaleProvider>{ui}</LocaleProvider>);

export function sampleCard(overrides: Partial<Card> = {}): Card {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    cardType: 'prayer_request',
    branchKey: null,
    answeredAt: null,
    testimonyAt: null,
    isSensitive: false,
    crisis: false,
    reach: 0,
    createdAt: '2026-10-28T12:00:00.000Z',
    postType: 'prayer_request',
    body: 'Please pray for my mother, who has surgery on Friday.',
    preview: 'Please pray for my mother',
    truncated: false,
    urgency: 1,
    kind: null,
    realm: null,
    background: null,
    state: 'open',
    isMine: false,
    author: { id: '00000000-0000-4000-8000-0000000000aa', displayName: 'Ruth', handle: null, anonymous: false, tier: null, pastor: null },
    counts: { prayingNow: 0, prayers: 0, commitments: 0, encouragements: 0, wellWishes: 0, shares: 0, comments: 0 },
    actions: ['praying_now', 'commit', 'encouragement', 'well_wishes', 'share', 'gift_tokens'],
    myCommitment: null,
    topComment: null,
    media: [],
    testimony: null,
    allSupportWelcome: false,
    ...overrides,
  };
}

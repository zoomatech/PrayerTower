// Concept doc check-in step: with the switch on, My Promises says what checking in
// affirms (neutral wording in Open Circle); with it off, the line is hidden.
import { act, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import Commitments from '@/app/(tabs)/commitments';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), commitments: jest.fn(), review: jest.fn() } }));

const promise = { id: 'c1', post_id: 'p1', frequency: 'daily', vow_text: 'I will pray for you.', status: 'active', next_reminder_at: null, committed_count: 3, completed_count: 1, ends_at: null, post_excerpt: 'My mother' };

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.commitments).mockResolvedValue({ commitments: [promise], note: '' } as Awaited<ReturnType<typeof api.commitments>>);
  jest.mocked(api.review).mockResolvedValue({ message: '' } as Awaited<ReturnType<typeof api.review>>);
});
afterEach(() => act(() => setWording('faith')));

const on = (checkinAffirmation: boolean) => jest.mocked(api.features).mockResolvedValue({ features: { checkinAffirmation } } as Awaited<ReturnType<typeof api.features>>);

describe('Check-in affirmation', () => {
  it('shows the affirmation when the switch is on', async () => {
    on(true);
    await renderApp(<Commitments />);
    expect(await screen.findByText(/affirming before God that you have truly prayed for this person/)).toBeTruthy();
  });

  it('is hidden when the switch is off', async () => {
    on(false);
    await renderApp(<Commitments />);
    expect(await screen.findByText('My mother')).toBeTruthy();
    expect(screen.queryByText(/affirming before God/)).toBeNull();
  });

  it('uses neutral wording in Open Circle', async () => {
    on(true);
    await act(() => setWording('neutral'));
    await renderApp(<Commitments />);
    expect(await screen.findByText('By checking in, you are saying you truly kept this promise. We take you at your word.')).toBeTruthy();
  });
});

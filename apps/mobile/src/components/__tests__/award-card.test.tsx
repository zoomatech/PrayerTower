// The Prayer Warrior Award on Me: hidden while off; an offer can be accepted with or without the name shown.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { AwardCard } from '@/components/award-card';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  return { api: new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) }) };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: (f: () => void) => require('react').useEffect(f, [f]) }));
const mocked = api as unknown as Record<string, jest.Mock>;

describe('AwardCard', () => {
  it('shows nothing while the award is off', async () => {
    mocked.myAwards!.mockResolvedValue({ enabled: false, awards: [] });
    await renderApp(<AwardCard />);
    await waitFor(() => expect(mocked.myAwards).toHaveBeenCalled());
    expect(screen.queryByText(/Prayer Warrior/)).toBeNull();
  });

  it('accepts an offer, showing the name in the Hall by default', async () => {
    mocked.myAwards!.mockResolvedValue({
      enabled: true, publicHall: true, prize: { tokens: 25, priestly: 2, note: '' },
      awards: [{ id: 'a1', year: 2026, rank: 1, userId: 'me', name: 'Ruth', prayers: 300, checkins: 65, peoplePrayedFor: 40, status: 'offered', showName: false, decidedAt: null }],
    });
    mocked.acceptAward!.mockResolvedValue({ accepted: true, tokens: 25, priestly: 2 });
    await renderApp(<AwardCard />);
    expect(await screen.findByText('You are a 2026 Prayer Warrior')).toBeTruthy();
    expect(screen.getByText('With the award: 25 tokens and 2 Priestly tokens.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Accept the award' }));
    expect(mocked.acceptAward).toHaveBeenCalledWith('a1', true, undefined);
  });
});

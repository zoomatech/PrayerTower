import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';

import SquireBoardScreen from '@/app/squire-board';
import { api } from '@/lib/api';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() }, useFocusEffect: (fn: () => void) => require('react').useEffect(fn, []) }));
jest.mock('@/lib/api', () => ({ api: { squireBoard: jest.fn(), setSquireBoard: jest.fn() } }));

const board = {
  enabled: true as const,
  days: 30,
  onBoard: false,
  canJoin: true,
  entries: [{ rank: 1, personId: 'p1', name: 'Sam', prayers: 12, peoplePrayedFor: 5, you: false }],
};

describe('Prayer Squire board', () => {
  it('lists members and lets you join', async () => {
    (api.squireBoard as jest.Mock).mockResolvedValue(board);
    (api.setSquireBoard as jest.Mock).mockResolvedValue({ ...board, onBoard: true });
    await renderApp(<SquireBoardScreen />);
    expect(await screen.findByText('Sam')).toBeTruthy();
    expect(screen.getByText('12 prayers for 5 people')).toBeTruthy();
    await fireEvent.press(screen.getByRole('switch'));
    await waitFor(() => expect(api.setSquireBoard).toHaveBeenCalledWith(true));
  });

  it('keeps anonymous members on the private track', async () => {
    (api.squireBoard as jest.Mock).mockResolvedValue({ ...board, canJoin: false, entries: [] });
    await renderApp(<SquireBoardScreen />);
    expect(await screen.findByText(/private track/)).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

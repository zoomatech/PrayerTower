import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import PrayerListScreen from '@/app/prayer-list';
import { api } from '@/lib/api';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() }, useFocusEffect: (fn: () => void) => require('react').useEffect(fn, []) }));
jest.mock('@/lib/api', () => ({ api: { prayerList: jest.fn(), addToPrayerList: jest.fn(), prayedForListItem: jest.fn(), removePrayerListItem: jest.fn() } }));

const grandma = { id: 'i1', name: 'Grandma', note: 'Hip surgery', remind: 'daily' as const, nextReminderAt: null, lastPrayedAt: null, prayedCount: 0 };

describe('My prayer list', () => {
  it('adds a name with a daily reminder and marks it prayed', async () => {
    jest.mocked(api.prayerList).mockResolvedValue({ enabled: true, items: [] });
    jest.mocked(api.addToPrayerList).mockResolvedValue({ enabled: true, items: [grandma] });
    jest.mocked(api.prayedForListItem).mockResolvedValue({ enabled: true, items: [{ ...grandma, prayedCount: 1 }] });
    await renderApp(<PrayerListScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Name or topic'), 'Grandma');
    await fireEvent.press(screen.getByText('Every day'));
    await fireEvent.press(screen.getByText('Add to my list'));
    await waitFor(() => expect(api.addToPrayerList).toHaveBeenCalledWith(expect.objectContaining({ name: 'Grandma', remind: 'daily', hour: 9 })));
    await fireEvent.press(await screen.findByText('I prayed'));
    expect(await screen.findByText(/Times prayed: 1/)).toBeTruthy();
  });

  it('says so while switched off', async () => {
    jest.mocked(api.prayerList).mockResolvedValue({ enabled: false });
    await renderApp(<PrayerListScreen />);
    expect(await screen.findByText('The prayer list is not open.')).toBeTruthy();
  });
});

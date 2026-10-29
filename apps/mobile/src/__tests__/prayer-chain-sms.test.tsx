// Prayer chain by text: the number field shows only while texts are on.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import PrayerChainScreen from '@/app/prayer-chain';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), prayerChain: jest.fn(), addToPrayerChain: jest.fn(), removeFromPrayerChain: jest.fn() } }));

const on = (prayerChainSms: boolean) => jest.mocked(api.features).mockResolvedValue({ features: { prayerChainSms } } as Awaited<ReturnType<typeof api.features>>);
beforeEach(() => {
  resetFeatures();
  jest.mocked(api.prayerChain).mockResolvedValue({ people: [{ id: 'c1', email: null, phone: '+15055550101', status: 'pending', createdAt: '2026-10-29T00:00:00Z' }] });
});

describe('prayer chain by text', () => {
  it('hides the number field while off, and still lists numbers', async () => {
    on(false);
    await renderApp(<PrayerChainScreen />);
    expect(await screen.findByText('+15055550101')).toBeTruthy();
    expect(screen.queryByText('Mobile number')).toBeNull();
  });

  it('adds a number while on', async () => {
    on(true);
    jest.mocked(api.addToPrayerChain).mockResolvedValue({ id: 'c2' });
    await renderApp(<PrayerChainScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Mobile number'), '+1 505 555 0102');
    await fireEvent.press(screen.getByText('Add by text'));
    await waitFor(() => expect(api.addToPrayerChain).toHaveBeenCalledWith({ phone: '+1 505 555 0102' }));
  });
});

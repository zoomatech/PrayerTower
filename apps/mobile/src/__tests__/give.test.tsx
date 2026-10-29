// Give: off until an admin sets it up; Stripe checkout opens in the in-app browser.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { renderApp } from '@/__tests__/helpers';
import Give from '@/app/give';
import RadioRequests from '@/app/radio-requests';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'opened' })) }));
jest.mock('@/lib/community-features', () => ({ useFeature: () => true }));

const mocked = api as unknown as Record<keyof typeof api, jest.Mock>;
const info = { enabled: true, provider: 'stripe', url: null, minCents: 100, maxCents: 100000, everyoneMonthly: 1, allocationRequests: true };

beforeEach(() => {
  mocked.tokenPools.mockResolvedValue({ pools: [{ id: 'p1', name: 'Hospital visits' }] });
  mocked.myGifts.mockResolvedValue({ donations: [] });
  mocked.radioAllowance.mockResolvedValue({ enabled: true, freeThisMonth: 1, granted: 0, canRequest: true, pendingRequest: null, maxPerRequest: 3 });
});

describe('Give', () => {
  it('says giving is not open while it is off', async () => {
    mocked.givingInfo.mockResolvedValue({ ...info, enabled: false, provider: 'none' });
    await renderApp(<Give />);
    expect(await screen.findByText('Giving isn’t open yet.')).toBeTruthy();
  });

  it('starts a Stripe checkout for the chosen amount and pool', async () => {
    mocked.givingInfo.mockResolvedValue(info);
    mocked.giveCheckout.mockResolvedValue({ donationId: 'd1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    await renderApp(<Give />);
    await fireEvent.press(await screen.findByText('$25'));
    await fireEvent.press(screen.getByText('Hospital visits'));
    await fireEvent.press(screen.getByText('Give $25'));
    await waitFor(() => expect(mocked.giveCheckout).toHaveBeenCalledWith(2500, { kind: 'pool', poolId: 'p1' }, false));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_1');
  });

  it('gives to the member whose page it came from', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ to: 'u-ruth', name: 'Ruth' });
    mocked.givingInfo.mockResolvedValue(info);
    mocked.giveCheckout.mockResolvedValue({ donationId: 'd2', url: 'https://checkout.stripe.com/c/pay/cs_2' });
    await renderApp(<Give />);
    await fireEvent.press(await screen.findByText('Give $10'));
    await waitFor(() => expect(mocked.giveCheckout).toHaveBeenCalledWith(1000, { kind: 'member', userId: 'u-ruth' }, false));
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
  });

  it('opens the Zeffy page', async () => {
    mocked.givingInfo.mockResolvedValue({ ...info, provider: 'zeffy', url: 'https://www.zeffy.com/en-US/donation-form/x' });
    await renderApp(<Give />);
    await fireEvent.press(await screen.findByTestId('give-submit'));
    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://www.zeffy.com/en-US/donation-form/x'));
  });

  it('shows the free radio prayer and asks for more', async () => {
    mocked.givingInfo.mockResolvedValue(info);
    await renderApp(<Give />);
    expect(await screen.findByText('Free radio prayers left this month: 1')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('give-ask-count'), '2');
    await fireEvent.press(screen.getByText('Ask for more'));
    await waitFor(() => expect(mocked.askForRadioPrayers).toHaveBeenCalledWith(2, ''));
  });
});

describe('Radio prayer requests', () => {
  it('grants a request', async () => {
    mocked.radioRequests.mockResolvedValue({ requests: [{ id: 'q1', count: 2, note: 'Surgery Friday', name: 'Ruth', sent_last_30_days: 1, created_at: '2026-10-29T00:00:00Z' }] });
    await renderApp(<RadioRequests />);
    await fireEvent.press(await screen.findByText('Grant 2'));
    await waitFor(() => expect(mocked.decideRadioRequest).toHaveBeenCalledWith('q1', 2));
    expect(screen.queryByText('Ruth asks for 2')).toBeNull();
  });
});

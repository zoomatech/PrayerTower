// Give: off until an admin sets it up; Stripe checkout opens in the in-app browser.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { renderApp } from '@/__tests__/helpers';
import Give from '@/app/give';
import RadioRequests from '@/app/radio-requests';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'opened' })) }));
jest.mock('@/lib/community-features', () => ({ useFeature: () => true }));

// The first render in this file loads the whole Give screen; on a busy CI runner that took over 5 s (2026-10-29).
jest.setTimeout(20000);

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

  it("shows a member's giving split and makes the gift smaller by that share when the giver splits", async () => {
    resetFeatures();
    mocked.features.mockResolvedValue({ features: { givingSplit: true } });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ to: 'u-ruth', name: 'Ruth' });
    mocked.givingInfo.mockResolvedValue(info);
    mocked.memberGivingSplit.mockImplementation(async (_id: string, cents: number) => ({ split: { url: 'https://ko-fi.com/ruth', percent: 20, shareCents: cents / 5 } }));
    mocked.giveCheckout.mockResolvedValue({ donationId: 'd3', url: 'https://checkout.stripe.com/c/pay/cs_3' });
    await renderApp(<Give />);
    expect(await screen.findByText("Ruth asks that 20% of gifts toward them go to their own page. Of this gift, that's $2.")).toBeTruthy();
    await fireEvent.press(screen.getByText('Split my gift: $8 here, $2 to their page'));
    await fireEvent.press(await screen.findByText('Give $8'));
    await waitFor(() => expect(mocked.giveCheckout).toHaveBeenCalledWith(800, { kind: 'member', userId: 'u-ruth' }, false));
    await fireEvent.press(screen.getByText('Open their page'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://ko-fi.com/ruth');
    (useLocalSearchParams as jest.Mock).mockReturnValue({});
    mocked.features.mockResolvedValue({});
    resetFeatures();
  });

  it('opens the Zeffy page', async () => {
    mocked.givingInfo.mockResolvedValue({ ...info, provider: 'zeffy', url: 'https://www.zeffy.com/en-US/donation-form/x' });
    await renderApp(<Give />);
    await fireEvent.press(await screen.findByTestId('give-submit'));
    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://www.zeffy.com/en-US/donation-form/x'));
  });

  it('offers PayPal as a second button', async () => {
    mocked.givingInfo.mockResolvedValue({ ...info, paypalUrl: 'https://www.paypal.com/donate/?hosted_button_id=X' });
    await renderApp(<Give />);
    expect(await screen.findByText('Give $10')).toBeTruthy();
    await fireEvent.press(screen.getByText('Give with PayPal'));
    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://www.paypal.com/donate/?hosted_button_id=X'));
  });

  it('shows PayPal alone when it is the only way to give', async () => {
    mocked.givingInfo.mockResolvedValue({ ...info, provider: 'none', paypalUrl: 'https://www.paypal.com/donate/?hosted_button_id=X' });
    await renderApp(<Give />);
    expect(await screen.findByText('Give with PayPal')).toBeTruthy();
    expect(screen.queryByTestId('give-submit')).toBeNull();
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

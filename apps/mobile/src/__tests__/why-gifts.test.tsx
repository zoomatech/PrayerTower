// Why we run on gifts, not ads: the screen shows the server's words for the member's
// wording, Give (to Me → Give) only while giving is on, and the fund report link.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { renderApp } from '@/__tests__/helpers';
import WhyGifts from '@/app/why-gifts';
import { api, type WhyGifts as Copy } from '@/lib/api';
import { env } from '@/lib/env';
import { setWording } from '@/lib/i18n';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), canGoBack: () => true, back: jest.fn() }, useFocusEffect: (f: () => void) => require('react').useEffect(f, [f]) }));
jest.mock('@/lib/api', () => ({ api: { whyGifts: jest.fn(), givingInfo: jest.fn() } }));

const giving = (enabled: boolean) => jest.mocked(api.givingInfo).mockResolvedValue({ enabled, provider: enabled ? 'stripe' : 'none', url: null, paypalUrl: null, minCents: 100, maxCents: 100000, everyoneMonthly: 0, allocationRequests: false });

const copy = (over: Partial<Copy> = {}): Copy => ({
  title: 'How we pay for it: gifts, not ads',
  intro: 'Prayer Tower runs on gifts from the people who use it and believe in it. Here is why.',
  points: [{ heading: 'Ads would make you the product.', body: 'We want you to pray, then get on with your day.' }],
  giveUrl: null,
  fundPath: null,
  ...over,
});

afterEach(() => act(() => setWording('faith')));

describe('Why gifts, not ads', () => {
  it('shows the words, and no Give while giving is off', async () => {
    giving(false);
    jest.mocked(api.whyGifts).mockResolvedValue(copy());
    await renderApp(<WhyGifts />);
    expect(await screen.findByText('Ads would make you the product.')).toBeTruthy();
    expect(api.whyGifts).toHaveBeenCalledWith('faith');
    expect(screen.queryByRole('button', { name: 'Give' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'See where gifts go' })).toBeNull();
  });

  it('opens Me → Give and the fund report when they exist', async () => {
    giving(true);
    jest.mocked(api.whyGifts).mockResolvedValue(copy({ fundPath: '/fund' }));
    await renderApp(<WhyGifts />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Give' }));
    expect(router.push).toHaveBeenCalledWith('/give');
    await fireEvent.press(screen.getByRole('button', { name: 'See where gifts go' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(`${env.apiUrl}/fund`);
  });

  it('asks for the neutral words in Open Circle', async () => {
    giving(false);
    jest.mocked(api.whyGifts).mockResolvedValue(copy({ intro: 'Open Circle runs on gifts.' }));
    await act(() => setWording('neutral'));
    await renderApp(<WhyGifts />);
    expect(await screen.findByText('Open Circle runs on gifts.')).toBeTruthy();
    expect(api.whyGifts).toHaveBeenLastCalledWith('neutral');
  });
});

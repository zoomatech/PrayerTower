// Why we run on gifts, not ads: the screen shows the server's words for the member's
// wording, a give button only when a donation link exists, and the fund report link.
import { act, fireEvent, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { renderApp } from '@/__tests__/helpers';
import WhyGifts from '@/app/why-gifts';
import { api, type WhyGifts as Copy } from '@/lib/api';
import { env } from '@/lib/env';
import { setWording } from '@/lib/i18n';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));
jest.mock('@/lib/api', () => ({ api: { whyGifts: jest.fn() } }));

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
  it('shows the words, and no give button without a donation link', async () => {
    jest.mocked(api.whyGifts).mockResolvedValue(copy());
    await renderApp(<WhyGifts />);
    expect(await screen.findByText('Ads would make you the product.')).toBeTruthy();
    expect(api.whyGifts).toHaveBeenCalledWith('faith');
    expect(screen.queryByRole('button', { name: 'Give' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'See where gifts go' })).toBeNull();
  });

  it('opens the donation page and the fund report when they exist', async () => {
    jest.mocked(api.whyGifts).mockResolvedValue(copy({ giveUrl: 'https://give.example/pt', fundPath: '/fund' }));
    await renderApp(<WhyGifts />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Give' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://give.example/pt');
    await fireEvent.press(screen.getByRole('button', { name: 'See where gifts go' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(`${env.apiUrl}/fund`);
  });

  it('asks for the neutral words in Open Circle', async () => {
    jest.mocked(api.whyGifts).mockResolvedValue(copy({ intro: 'Open Circle runs on gifts.' }));
    await act(() => setWording('neutral'));
    await renderApp(<WhyGifts />);
    expect(await screen.findByText('Open Circle runs on gifts.')).toBeTruthy();
    expect(api.whyGifts).toHaveBeenLastCalledWith('neutral');
  });
});

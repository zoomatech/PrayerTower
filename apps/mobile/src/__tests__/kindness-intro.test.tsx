// The kindness tools intro: a card for each tool that is on, one at a time, in both
// editions, and once finished or skipped it stays away for that member on this device.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { introKey, KindnessIntro } from '@/components/kindness-intro';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn() } }));
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me' }, roles: [] }) }));

const on = (features: Record<string, boolean>) =>
  jest.mocked(api.features).mockResolvedValue({ features } as unknown as Awaited<ReturnType<typeof api.features>>);
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const all = { kindnessIntro: true, kindCloud: true, meaningReactions: true, lament: true };

beforeEach(async () => {
  resetFeatures();
  await AsyncStorage.clear();
});
afterEach(() => act(() => setWording('faith')));

describe('Kindness tools intro', () => {
  it('stays hidden while off', async () => {
    on({ ...all, kindnessIntro: false });
    await renderApp(<KindnessIntro />);
    await settle();
    expect(screen.queryByTestId('kindness-intro')).toBeNull();
  });

  it('walks the three cards, then stays away', async () => {
    on(all);
    await renderApp(<KindnessIntro />);
    await settle();
    expect(screen.getByText('1 of 3')).toBeTruthy();
    expect(screen.getByText('A gentle cloud, never a wall')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Next')));
    expect(screen.getByText('Say what your emoji means')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Next')));
    expect(screen.getByText('Room to grieve')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Got it')));
    expect(screen.queryByTestId('kindness-intro')).toBeNull();
    expect(await AsyncStorage.getItem(introKey('me'))).toBe('1');
  });

  it('shows only the tools that are on, in Open Circle wording', async () => {
    await act(() => setWording('neutral'));
    on({ kindnessIntro: true, meaningReactions: true });
    await renderApp(<KindnessIntro />);
    await settle();
    expect(screen.getByText('1 of 1')).toBeTruthy();
    expect(screen.getByText(/Thinking of You/)).toBeTruthy();
    expect(screen.queryByText(/Praying Now/)).toBeNull();
  });

  it('stays away once skipped', async () => {
    await AsyncStorage.setItem(introKey('me'), '1');
    on(all);
    await renderApp(<KindnessIntro />);
    await settle();
    expect(screen.queryByTestId('kindness-intro')).toBeNull();
  });
});

// Tokens: the balances on the Me screen, giving Priestly tokens, and gifting tokens to a request.
import type { Card } from '@prayer-tower/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import Profile from '@/app/(tabs)/profile';
import { useCardActions } from '@/components/card-actions';
import { PostCard } from '@/components/post-card';
import { api } from '@/lib/api';

// Calls this file doesn't set answer with an empty object, as a quiet server would.
jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({
    profile: { id: 'me', display_name: 'Ruth', why_here: [], anonymous_by_default: false, pray_for: [], support_wanted: [], support_offered: [] },
    roles: [],
    refreshProfile: jest.fn(),
    signOut: jest.fn(),
  }),
}));

const mocked = api as unknown as Record<keyof typeof api, jest.Mock>;
const summary = (balance: number, priestly: number) => ({
  balance,
  priestly: { balance: priestly, verifiedPrayers: 14, towardNext: 4, prayersPerToken: 10, radioPrayerCost: 1, amplifyRepeats: null },
});

describe('Tokens on the Me screen', () => {
  beforeEach(() => {
    mocked.feedThemes.mockResolvedValue({ themes: [], current: null });
    mocked.prayerStats.mockResolvedValue({ stats: { enabled: false } });
  });

  it('shows both balances and progress toward the next Priestly token', async () => {
    mocked.tokens.mockResolvedValue(summary(12, 1));
    await renderApp(<Profile />);
    expect(await screen.findByText('12')).toBeTruthy();
    expect(screen.getByText(/4 of 10/)).toBeTruthy();
    expect(screen.getByText(/never stops a request from being seen/)).toBeTruthy();
  });

  it('donates a Priestly token and shows the new balance', async () => {
    mocked.tokens.mockResolvedValueOnce(summary(12, 1)).mockResolvedValue(summary(12, 0));
    await renderApp(<Profile />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Donate 1 Priestly token' }));
    expect(mocked.donatePriestly).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Donate 1 Priestly token' })).toBeNull());
  });

  it('offers no donation without a Priestly token', async () => {
    mocked.tokens.mockResolvedValue(summary(3, 0));
    await renderApp(<Profile />);
    await screen.findByText('3');
    expect(screen.queryByRole('button', { name: 'Donate 1 Priestly token' })).toBeNull();
  });
});

function Harness({ card }: { card: Card }) {
  const { onAction, sheets } = useCardActions(jest.fn());
  return (
    <>
      <PostCard card={card} onAction={onAction} />
      {sheets}
    </>
  );
}

describe('Gift tokens to a request', () => {
  beforeEach(() => {
    mocked.tokenPools.mockResolvedValue({ pools: [] });
    mocked.boost.mockResolvedValue({});
  });

  it('gives the number of tokens typed, now', async () => {
    await renderApp(<Harness card={sampleCard()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Gift Tokens' }));
    expect(screen.getByRole('button', { name: 'Give tokens' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('How many tokens'), '3');
    await fireEvent.press(screen.getByRole('button', { name: 'Give tokens' }));
    expect(mocked.boost).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001', 3, expect.stringMatching(/^00000000-0000-4000-8000-000000000001:\d+$/));
    expect(await screen.findByText('Thank you. More people will see this request.')).toBeTruthy();
  });

  it('shows why a gift failed (for example, not enough tokens)', async () => {
    mocked.boost.mockRejectedValueOnce(new Error('Not enough tokens'));
    await renderApp(<Harness card={sampleCard()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Gift Tokens' }));
    await fireEvent.changeText(screen.getByLabelText('How many tokens'), '500');
    await fireEvent.press(screen.getByRole('button', { name: 'Give tokens' }));
    expect(await screen.findByText('Not enough tokens')).toBeTruthy();
  });
});

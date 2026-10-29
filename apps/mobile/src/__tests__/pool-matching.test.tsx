// Matching pledges on token pools: with the switch on, a donor can set a match when
// starting a pool, and others can give to a matched pool; with it off, neither shows.
import { fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import Pools from '@/app/pools';
import { api, type TokenPool } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('expo-router', () => ({ router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn() } }));
jest.mock('@/lib/api', () => ({
  api: { features: jest.fn(), myTokenPools: jest.fn(), tokenPools: jest.fn(), tokens: jest.fn(), createTokenPool: jest.fn(), fundTokenPool: jest.fn(), poolLedger: jest.fn() },
}));

const pool = (over: Partial<TokenPool> = {}): TokenPool => ({
  id: 'p1', name: 'Philanthropic first post', purpose: '', realm: null, drawAmount: 5, drawsPerMemberDay: 1, donor: 'Ethel', isMine: false, open: true, balance: 40,
  match: { mode: 'ratio', ratio: 2, cap: 30, matched: 20 }, ...over,
});

const on = (poolMatching: boolean) => jest.mocked(api.features).mockResolvedValue({ features: { poolMatching } } as Awaited<ReturnType<typeof api.features>>);

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.poolLedger).mockResolvedValue({ enabled: false });
  jest.mocked(api.myTokenPools).mockResolvedValue({ pools: [] });
  jest.mocked(api.tokens).mockResolvedValue({ balance: 20 } as Awaited<ReturnType<typeof api.tokens>>);
});

describe('Matching pledges', () => {
  it('shows the match and lets a member give', async () => {
    on(true);
    jest.mocked(api.tokenPools).mockResolvedValue({ pools: [pool()] });
    jest.mocked(api.fundTokenPool).mockResolvedValue({ matched: 6, poolBalance: 49, balance: 17 });
    await renderApp(<Pools />);
    expect(await screen.findByText('Matched 2 to 1 · 20 of 30 matched')).toBeTruthy();
    await fireEvent.changeText(screen.getAllByPlaceholderText('Add tokens')[0]!, '3');
    await fireEvent.press(screen.getByRole('button', { name: 'Give' }));
    expect(api.fundTokenPool).toHaveBeenCalledWith('p1', 3);
    expect(await screen.findByText('Thank you. 6 more were matched.')).toBeTruthy();
  });

  it('sends the pledge when starting a pool', async () => {
    on(true);
    jest.mocked(api.tokenPools).mockResolvedValue({ pools: [] });
    jest.mocked(api.createTokenPool).mockResolvedValue({ id: 'p2', balance: 10 });
    await renderApp(<Pools />);
    await fireEvent.changeText(await screen.findByLabelText('Name'), 'Matched');
    await fireEvent.changeText(screen.getByLabelText('Tokens to put in'), '10');
    await fireEvent.changeText(screen.getByLabelText("Match others' gifts (tokens per token, 0 for none)"), '2');
    await fireEvent.changeText(screen.getByLabelText("Most you'll match in all"), '30');
    await fireEvent.press(screen.getByRole('button', { name: 'Start pool' }));
    expect(api.createTokenPool).toHaveBeenCalledWith(expect.objectContaining({ amount: 10, matchRatio: 2, matchCap: 30 }));
  });

  it('hides matching while the switch is off', async () => {
    on(false);
    jest.mocked(api.tokenPools).mockResolvedValue({ pools: [pool({ match: null })] });
    await renderApp(<Pools />);
    expect(await screen.findByText('Philanthropic first post')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Give' })).toBeNull();
    expect(screen.queryByLabelText("Match others' gifts (tokens per token, 0 for none)")).toBeNull();
  });
});

describe('Matching by how many give', () => {
  it('starts a quadratic pool and shows its line', async () => {
    resetFeatures();
    on(true);
    jest.mocked(api.myTokenPools).mockResolvedValue({ pools: [] });
    jest.mocked(api.tokens).mockResolvedValue({ balance: 20 } as Awaited<ReturnType<typeof api.tokens>>);
    jest.mocked(api.tokenPools).mockResolvedValue({ pools: [pool({ id: 'q', match: { mode: 'quadratic', ratio: 0, cap: 100, matched: 32 } })] });
    jest.mocked(api.createTokenPool).mockResolvedValue({ id: 'p3', balance: 10 });
    await renderApp(<Pools />);
    expect(await screen.findByText('Matched by how many give · 32 of 100 matched')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Many hands');
    await fireEvent.changeText(screen.getByLabelText('Tokens to put in'), '10');
    await fireEvent.press(screen.getByRole('switch', { name: /Match by how many give/ }));
    await fireEvent.changeText(screen.getByLabelText("Most you'll match in all"), '100');
    await fireEvent.press(screen.getByRole('button', { name: 'Start pool' }));
    expect(api.createTokenPool).toHaveBeenCalledWith(expect.objectContaining({ matchMode: 'quadratic', matchCap: 100 }));
  });
});

describe('Pool ledger', () => {
  it('shows the totals while switched on', async () => {
    on(false);
    jest.mocked(api.tokenPools).mockResolvedValue({ pools: [] });
    jest.mocked(api.poolLedger).mockResolvedValue({ enabled: true, given: 120, givers: 9, matched: 40, reachedRequests: 85, reachedLast30Days: 30, requestsHelped: 17, returned: 0, openPools: 3 });
    await renderApp(<Pools />);
    expect(await screen.findByText('Where pool tokens went')).toBeTruthy();
    expect(screen.getByText('120 tokens put in by 9 members')).toBeTruthy();
    expect(screen.getByText('85 tokens reached 17 requests (30 in the last 30 days)')).toBeTruthy();
    expect(screen.queryByText(/returned when pools closed/)).toBeNull();
  });
});

// Loading, empty and error states: a slow or failed load never looks like an empty list,
// and a failed load offers "Try again".
import { fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import Commitments from '@/app/(tabs)/commitments';
import Pools from '@/app/pools';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});

const mocked = api as unknown as Record<keyof typeof api, jest.Mock>;
const offline = () => Promise.reject(new Error("You're offline. Check your connection and try again."));

describe('My Promises load states', () => {
  it('shows Loading, not the empty text, while the first load is on its way', async () => {
    mocked.commitments.mockReturnValue(new Promise(() => undefined));
    mocked.review.mockReturnValue(new Promise(() => undefined));
    await renderApp(<Commitments />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByText(/your promise appears here/)).toBeNull();
  });

  it('shows the error and Try again instead of the empty text, and recovers on retry', async () => {
    mocked.commitments.mockImplementationOnce(offline);
    mocked.review.mockImplementationOnce(offline);
    await renderApp(<Commitments />);
    expect(await screen.findByText(/You're offline/)).toBeTruthy();
    expect(screen.queryByText(/your promise appears here/)).toBeNull();

    mocked.commitments.mockResolvedValue({ commitments: [], note: '' });
    mocked.review.mockResolvedValue({ message: 'A quiet week.' });
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText(/your promise appears here/)).toBeTruthy();
    expect(screen.queryByText(/You're offline/)).toBeNull();
  });
});

describe('Token pools', () => {
  it('hides the balance and the form until the pools load', async () => {
    mocked.myTokenPools.mockImplementationOnce(offline);
    await renderApp(<Pools />);
    expect(await screen.findByText('Try again')).toBeTruthy();
    expect(screen.queryByText(/You have 0 tokens/)).toBeNull();
  });

  it('tells a member with no tokens how to earn one', async () => {
    mocked.myTokenPools.mockResolvedValue({ pools: [] });
    mocked.tokenPools.mockResolvedValue({ pools: [] });
    mocked.tokens.mockResolvedValue({ balance: 0, priestly: { balance: 0 } });
    await renderApp(<Pools />);
    expect(await screen.findByText('Each prayer you offer for someone else earns a token.')).toBeTruthy();
  });
});

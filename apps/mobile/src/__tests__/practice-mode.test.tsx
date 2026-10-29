// Practice mode: the admin switches, and free practice purchases in the token
// store while no App Store connection is set.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { PracticeModeSection } from '@/app/admin';
import TokenStoreScreen from '@/app/token-store';
import { api } from '@/lib/api';
import { practiceTransaction } from '@/lib/token-store';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn().mockResolvedValue({ features: {} }),
    tokenStore: jest.fn(),
    tokenPurchases: jest.fn(),
    buyTokens: jest.fn(),
    admin: { practiceMode: jest.fn(), updatePracticeMode: jest.fn() },
  },
}));

jest.mock('@/lib/token-store', () => ({
  ...jest.requireActual('@/lib/token-store'),
  storeAvailable: false,
  connect: jest.fn(),
  prices: jest.fn(),
  buy: jest.fn(),
}));

jest.mock('@/lib/auth', () => ({ useAuth: () => ({ session: { user: { id: '11111111-2222-4333-8444-555555555555' } } }) }));

const store = jest.requireMock('@/lib/token-store') as { connect: jest.Mock; buy: jest.Mock };

const connected = { ai: false, jaas: false, videoServer: false, appStore: false, practicePurchasesAllowed: true };

it('builds a practice purchase the server can read', () => {
  const signed = practiceTransaction('tokens.50', '11111111-2222-4333-8444-555555555555');
  expect(signed).toMatch(/^practice\.[A-Za-z0-9_-]+$/);
  const body = JSON.parse(Buffer.from(signed.slice('practice.'.length), 'base64url').toString('utf8'));
  expect(body).toMatchObject({ productId: 'tokens.50', appAccountToken: '11111111-2222-4333-8444-555555555555' });
  expect(body.transactionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});

it('lets an admin turn practice switches on and shows what is connected', async () => {
  const settings = { ai: false, live: false, purchases: false };
  jest.mocked(api.admin.practiceMode).mockResolvedValue({ settings, connected: { ...connected, practicePurchasesAllowed: false } });
  jest.mocked(api.admin.updatePracticeMode).mockResolvedValue({ settings: { ...settings, live: true }, connected });
  await renderApp(<PracticeModeSection />);
  expect(await screen.findByText('Connected now: nothing yet')).toBeTruthy();
  expect(screen.getByText('Practice purchases stay off: the App Store is set to production.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('switch', { name: /^Practice live rooms/ }));
  await waitFor(() => expect(api.admin.updatePracticeMode).toHaveBeenCalledWith({ live: true }));
  expect(await screen.findByText('Saved.')).toBeTruthy();
});

it('buys practice tokens without the App Store and marks them Practice', async () => {
  jest.mocked(api.tokenStore).mockResolvedValue({
    enabled: true,
    practice: true,
    commonFundPercent: 10,
    products: [{ sku: 'tokens_50', tokens: 50, currency: 'regular', priceLabel: '$0.99', appleProductId: 'tokens.50' } as never],
  });
  jest
    .mocked(api.tokenPurchases)
    .mockResolvedValueOnce({ purchases: [] })
    .mockResolvedValue({
      purchases: [{ id: 'p1', store_product_id: 'tokens.50', tokens: 50, currency: 'regular', status: 'credited', purchased_at: null, practice: true }],
    });
  jest.mocked(api.buyTokens).mockResolvedValue({ purchase: { tokens: 50 } } as never);
  await renderApp(<TokenStoreScreen />);
  expect(await screen.findByText(/Practice mode: no App Store and no money/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Practice purchase (free)'));
  await waitFor(() => expect(api.buyTokens).toHaveBeenCalledWith(expect.stringMatching(/^practice\./)));
  expect(await screen.findByText('Practice purchase done. 50 tokens were added.')).toBeTruthy();
  expect(await screen.findByText(/· Practice/)).toBeTruthy();
  expect(store.connect).not.toHaveBeenCalled();
  expect(store.buy).not.toHaveBeenCalled();
});

// Admin → Giving: recording a gift that came another way, for one member, from another.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { GivingSection } from '@/app/admin';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const mockAdmin = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  const top: Record<string, jest.Mock> = {};
  const api = new Proxy(top, { get: (target, key: string) => (key === 'admin' ? mockAdmin : (target[key] ??= jest.fn(async () => ({})))) });
  return { api };
});

const admin = api.admin as unknown as Record<keyof typeof api.admin, jest.Mock>;
const top = api as unknown as Record<keyof typeof api, jest.Mock>;
const settings = {
  enabled: true, provider: 'zeffy', donate_url: 'https://www.zeffy.com/x', paypal_url: null, zeffy_amount_unit: 'cents', min_cents: 100, max_cents: 100000,
  priestly_per_dollar: 1, regular_per_dollar: 10, everyone_monthly: 1, allocation_requests_enabled: false, allocation_max_per_request: 3,
};

beforeEach(() => {
  admin.donationSettings.mockResolvedValue({ settings, stripeKeySet: false, webhookSecretSet: false, zeffyKeySet: false, zeffyWebhookSet: false });
  admin.gifts.mockResolvedValue({ donations: [] });
  top.tokenPools.mockResolvedValue({ pools: [] });
  admin.people.mockImplementation(async (q: string) => ({
    people: q === 'ruth' ? [{ id: 'u-ruth', display_name: 'Ruth', email: 'ruth@x', roles: [] }] : [{ id: 'u-gail', display_name: 'Gail', email: 'gail@x', roles: [] }],
  }));
});

it('records a Zeffy gift for one member, given by another', async () => {
  await renderApp(<GivingSection />);
  await fireEvent.press(await screen.findByText('Zeffy'));
  await fireEvent.changeText(screen.getByLabelText('For one member (optional)'), 'ruth');
  await fireEvent.press(screen.getAllByText('Find')[0]!);
  await fireEvent.press(await screen.findByText('Ruth (ruth@x)'));
  await fireEvent.changeText(screen.getByLabelText('Given by a member (optional; they get the thank-you tokens)'), 'gail');
  await fireEvent.press(screen.getByText('Find'));
  await fireEvent.press(await screen.findByText('Gail (gail@x)'));
  await fireEvent.changeText(screen.getByLabelText('Gift amount in dollars'), '25');
  await fireEvent.press(screen.getByText('Record the gift'));
  await waitFor(() =>
    expect(admin.recordGift).toHaveBeenCalledWith({ amountCents: 2500, reference: '', via: 'zeffy', donorId: 'u-gail', target: { kind: 'member', userId: 'u-ruth' } }),
  );
});

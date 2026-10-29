// Admin → Push delivery: the switch, its two limits, and the last day's outcomes.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { PushDeliverySection } from '@/app/admin';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const mockAdmin = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api: { admin: mockAdmin } };
});

const admin = api.admin as unknown as Record<keyof typeof api.admin, jest.Mock>;
const state = (enabled: boolean) => ({
  settings: { push_reliability_enabled: enabled, collapse_minutes: 10, max_per_hour: 8 },
  health: { byStatus: { ok: 40, sent: 3, retry: 1, held: 2, folded: 5, capped: 1, error: 2 }, errors: [{ error: 'DeviceNotRegistered', n: 2 }], devicesTurnedOff: 2 },
});

it('turns reliable delivery on with the limits typed, and shows the last day', async () => {
  admin.pushSettings.mockResolvedValue(state(false));
  admin.updatePushSettings.mockResolvedValue(state(true));
  await renderApp(<PushDeliverySection />);
  expect(await screen.findByText(/40 delivered, 3 sent and awaiting a receipt, 3 waiting .* 6 folded or over the hourly cap, 2 failed\. Phones turned off: 2\./)).toBeTruthy();
  expect(screen.getByText('DeviceNotRegistered: 2')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Most everyday pushes per member per hour'), '5');
  await fireEvent.press(screen.getByRole('switch', { name: 'Reliable push delivery' }));
  await waitFor(() => expect(admin.updatePushSettings).toHaveBeenCalledWith({ collapseMinutes: 10, maxPerHour: 5, enabled: true }));
  expect(await screen.findByText('Saved.')).toBeTruthy();
});

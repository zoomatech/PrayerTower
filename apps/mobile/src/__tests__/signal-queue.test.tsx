// My signal queue: the member's radio prayers with status and signal codes.
import { screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import SignalQueueScreen from '@/app/signal-queue';
import { api, ApiError } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return { ApiError: actual.ApiError, api: { signalQueue: jest.fn() } };
});

it('shows each radio prayer with where it is, and the code of one that went out', async () => {
  jest.mocked(api.signalQueue).mockResolvedValue({
    signals: [
      { id: 'r2', postId: 'p2', excerpt: 'Pray for the bakery fire.', status: 'waiting', kind: 'prayer', amplified: false, queuedAt: '2026-10-29T18:00:00Z', sentAt: null, callSign: null, preset: null, heardCount: 0, signalCode: null },
      { id: 'r0', postId: 'p0', excerpt: 'Pray for the river crossing.', status: 'sent', kind: 'auto', amplified: false, queuedAt: '2026-10-29T16:00:00Z', sentAt: '2026-10-29T16:01:00Z', callSign: null, preset: null, heardCount: 1, signalCode: 'A2BC-DEFG-HJKL' },
      { id: 'r1', postId: 'p1', excerpt: 'Pray for the night ferry.', status: 'sent', kind: 'prayer', amplified: true, queuedAt: '2026-10-29T17:00:00Z', sentAt: '2026-10-29T17:01:00Z', callSign: 'K0GIN', preset: 'fm-standard', heardCount: 3, signalCode: 'Q7MK-4XPL-9RT2' },
    ],
  });
  await renderApp(<SignalQueueScreen />);
  expect(await screen.findByText('“Pray for the night ferry.”')).toBeTruthy();
  expect(screen.getByText('Q7MK-4XPL-9RT2')).toBeTruthy();
  expect(screen.getByText(/^Sent · amplified · .* · K0GIN · fm-standard$/)).toBeTruthy();
  expect(screen.getByText(/^Waiting · /)).toBeTruthy();
  expect(screen.getByText('Reported by 3 receivers')).toBeTruthy();
  expect(screen.getByText(/^Sent · sent for every request · /)).toBeTruthy();
  expect(screen.getByText('Reported by 1 receiver')).toBeTruthy();
});

it('says when the queue is switched off', async () => {
  jest.mocked(api.signalQueue).mockRejectedValue(new ApiError(404, 'not_found', 'Signal queue not found'));
  await renderApp(<SignalQueueScreen />);
  expect(await screen.findByText('The signal queue is switched off.')).toBeTruthy();
});

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
  expect(screen.getByText('Receivers reported hearing it 3 times')).toBeTruthy();
  expect(screen.getByText(/^Sent · sent for every request · /)).toBeTruthy();
  expect(screen.getByText('A receiver reported hearing it')).toBeTruthy();
});

it('says when the queue is switched off', async () => {
  jest.mocked(api.signalQueue).mockRejectedValue(new ApiError(404, 'not_found', 'Signal queue not found'));
  await renderApp(<SignalQueueScreen />);
  expect(await screen.findByText('The signal queue is switched off.')).toBeTruthy();
});

it('shows no journey while Signal journey is off', async () => {
  jest.mocked(api.signalQueue).mockResolvedValue({
    journey: false,
    signals: [{ id: 'r1', postId: 'p1', excerpt: 'Pray for the night ferry.', status: 'sent', kind: 'prayer', amplified: false, queuedAt: '2026-10-29T17:00:00Z', sentAt: '2026-10-29T17:01:00Z', callSign: 'K0GIN', preset: null, heardCount: 0, signalCode: 'Q7MK-4XPL-9RT2' }],
  });
  await renderApp(<SignalQueueScreen />);
  await screen.findByText('Q7MK-4XPL-9RT2');
  expect(screen.queryByText('How far it has gone')).toBeNull();
});

it('with Signal journey on, shows how far each sent wave has gone, the places passed and the strongest report', async () => {
  jest.useFakeTimers({ now: Date.parse('2026-10-29T17:11:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
  try {
    jest.mocked(api.signalQueue).mockResolvedValue({
      journey: true,
      signals: [
        { id: 'r2', postId: 'p2', excerpt: 'Pray for the bakery fire.', status: 'waiting', kind: 'prayer', amplified: false, queuedAt: '2026-10-29T17:10:00Z', sentAt: null, callSign: null, preset: null, heardCount: 0, signalCode: null },
        { id: 'r1', postId: 'p1', excerpt: 'Pray for the night ferry.', status: 'sent', kind: 'prayer', amplified: true, copies: 1000, queuedAt: '2026-10-29T17:00:00Z', sentAt: '2026-10-29T17:01:00Z', callSign: 'K0GIN', preset: null, heardCount: 2, signalCode: 'Q7MK-4XPL-9RT2', bestSnrDb: 14 },
      ],
    });
    await renderApp(<SignalQueueScreen />);
    // Ten minutes after it went out: about 180 million km, past the Moon and the Sun.
    expect(await screen.findByText('How far it has gone')).toBeTruthy();
    expect(screen.getAllByText('How far it has gone')).toHaveLength(1);
    expect(screen.getByText('10 light-minutes out, 179.9 million km from Earth')).toBeTruthy();
    expect(screen.getByText('Passed the Moon, the Sun')).toBeTruthy();
    expect(screen.getByText(/^Reaches Neptune in [\d.]+ h$/)).toBeTruthy();
    expect(screen.getByText('Strongest report: 14 dB')).toBeTruthy();
    expect(screen.getByText(/amplified · 1000 copies in one burst/)).toBeTruthy();
    expect(screen.getByLabelText(/^A wave leaving Earth, \d+ percent of the way to Neptune$/)).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

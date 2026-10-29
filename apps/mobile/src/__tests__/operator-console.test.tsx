// The radio operator's console: the window, the ID timer, the queue, the log, and the overrides.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import OperatorConsole from '@/app/operator-console';
import { api, ApiError, type RadioConsole } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return { ApiError: actual.ApiError, api: { radioConsole: jest.fn(), updateRadioConsole: jest.fn() } };
});
let mockRoles = ['radio_operator'];
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ roles: mockRoles }) }));

const mocked = api as unknown as Record<'radioConsole' | 'updateRadioConsole', jest.Mock>;
const soon = new Date(Date.now() + 4 * 60_000 + 30_000).toISOString();
const view: RadioConsole = {
  paused: false,
  windowOverrideUntil: null,
  onAirNow: false,
  schedule: { enabled: true, timeZone: 'America/Chicago', windows: [{ days: [1], start: '19:00', end: '20:00' }], quietStart: null, quietEnd: null, inWindow: false },
  queue: { queued: 2, sending: 0, oldestMinutes: 12, next: [{ id: 'r1', text: 'Pray for the night shift.', urgency: 2, repeats: 1, waitingMinutes: 12 }] },
  stations: [{ callSign: 'K0GIN', lastHeartbeat: new Date().toISOString(), lastIdAt: new Date().toISOString(), everyMinutes: 5, nextIdAt: soon }],
  log: [{ at: new Date().toISOString(), callSign: 'K0GIN', station: 'main', preset: 'fm-standard', status: 'transmitted', heard: true, error: null, text: 'Pray for calm seas.' }],
};

beforeEach(() => {
  mockRoles = ['radio_operator'];
  mocked.radioConsole.mockResolvedValue(view);
});

it('shows why the station is quiet, the ID timer, the queue and the log', async () => {
  await renderApp(<OperatorConsole />);
  expect(await screen.findByText('The station is not transmitting now')).toBeTruthy();
  expect(screen.getByText('Outside the transmission windows. Prayers wait for the next one.')).toBeTruthy();
  expect(screen.getByText(/next ID due in [45] min/)).toBeTruthy();
  expect(screen.getByText(/2 waiting, 0 sending · oldest waiting 12 min/)).toBeTruthy();
  expect(screen.getByText('Pray for the night shift.')).toBeTruthy();
  expect(screen.getByText(/fm-standard · sent · heard by a listener/)).toBeTruthy();
});

it('holds, resumes and sends outside the windows for a while', async () => {
  mocked.updateRadioConsole.mockResolvedValueOnce({ ...view, paused: true });
  await renderApp(<OperatorConsole />);
  await fireEvent.press(await screen.findByText('Hold all transmissions'));
  await waitFor(() => expect(mocked.updateRadioConsole).toHaveBeenCalledWith({ paused: true }));
  expect(await screen.findByText('Held by the operator. Nothing goes out until you resume.')).toBeTruthy();
  mocked.updateRadioConsole.mockResolvedValueOnce({ ...view, onAirNow: true, windowOverrideUntil: soon });
  await fireEvent.press(screen.getByText('Send for 30 min'));
  await waitFor(() => expect(mocked.updateRadioConsole).toHaveBeenCalledWith({ windowOverrideMinutes: 30 }));
  expect(await screen.findByText('The station may transmit now')).toBeTruthy();
  mocked.updateRadioConsole.mockResolvedValueOnce(view);
  await fireEvent.press(screen.getByText('End override'));
  await waitFor(() => expect(mocked.updateRadioConsole).toHaveBeenCalledWith({ windowOverrideMinutes: 0 }));
});

it('says plainly when the console is switched off, and keeps members out', async () => {
  mocked.radioConsole.mockRejectedValue(new ApiError(404, 'not_found', 'Operator console not found'));
  const { unmount } = await renderApp(<OperatorConsole />);
  expect(await screen.findByText('The operator console is off. An admin can turn it on in Admin → Radio.')).toBeTruthy();
  unmount();
  mockRoles = [];
  await renderApp(<OperatorConsole />);
  expect(screen.queryByText('Operator console')).toBeNull();
  expect(screen.getByText(/This page is for the/)).toBeTruthy();
});

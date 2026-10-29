// The radio operator's console: the window, the ID timer, the queue, the log, and the overrides.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import OperatorConsole from '@/app/operator-console';
import { api, ApiError, type RadioConsole } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return {
    ApiError: actual.ApiError,
    // The weekly station report shows only while an admin has it on (listener-admin.test.tsx covers it on).
    api: { radioConsole: jest.fn(), updateRadioConsole: jest.fn(), admin: { stationReport: jest.fn(async () => ({ enabled: false, email: false, thisWeek: null, lastWeek: null, history: [] })) } },
  };
});
let mockRoles = ['radio_operator'];
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ roles: mockRoles }) }));

const mocked = api as unknown as Record<'radioConsole' | 'updateRadioConsole', jest.Mock>;
const soon = new Date(Date.now() + 4 * 60_000 + 30_000).toISOString();
const view: RadioConsole = {
  paused: false,
  problems: [],
  windowOverrideUntil: null,
  onAirNow: false,
  schedule: { enabled: true, timeZone: 'America/Chicago', windows: [{ days: [1], start: '19:00', end: '20:00' }], quietStart: null, quietEnd: null, inWindow: false },
  queue: { queued: 2, sending: 0, oldestMinutes: 12, next: [{ id: 'r1', text: 'Pray for the night shift.', urgency: 2, repeats: 1, waitingMinutes: 12 }] },
  stations: [{ callSign: 'K0GIN', lastHeartbeat: new Date().toISOString(), lastIdAt: new Date().toISOString(), everyMinutes: 5, nextIdAt: soon }],
  sky: { target: "moon", name: null, az: 123.4, el: 5.2, aboveMinimum: false, minElevation: 10, holdBelow: true, next: { at: new Date().toISOString(), rising: true } },
  ceaseless: { enabled: true, gapMinutes: 30, inRotation: 4, sentLastDay: 7 },
  relays: [{ node: "Ridge", reportedAt: new Date().toISOString(), callSign: "K1RLY", relayedLastHour: 3, secondsLastHour: 4.2, budgetSeconds: 120, skipped: { duplicate: 2 } }],
  beacon: { enabled: true, minutes: 60, recent: [{ id: "b1", sentAt: new Date().toISOString(), status: "heard", callSign: "K0GIN", preset: "fm-standard", heard: [{ by: "Hilltop", snrDb: 18.4, peakDbfs: null }] }] },
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
  expect(screen.getByText('Hilltop (18 dB)')).toBeTruthy();
  expect(screen.getByText('4 kept requests; one goes out after 30 quiet minutes')).toBeTruthy();
  expect(screen.getByText('Sent again in the last day: 7')).toBeTruthy();
  expect(screen.getByText('The Moon: azimuth 123.4°, elevation 5.2°')).toBeTruthy();
  expect(screen.getByText(/Rises above 10° at .* Transmissions wait until it is up./)).toBeTruthy();
  expect(screen.getByText('3 frames re-sent in the last hour, 4.2 s of its 120 s air time')).toBeTruthy();
  expect(screen.getByText('Not re-sent: already sent 2')).toBeTruthy();
});

it('shows the station problems first', async () => {
  mocked.radioConsole.mockResolvedValue({ ...view, problems: [{ kind: 'ptt_failed', level: 'problem', detail: 'rigctld not answering', callSign: 'K0GIN', since: null }] });
  await renderApp(<OperatorConsole />);
  expect(await screen.findByText('Problems right now')).toBeTruthy();
  expect(screen.getByText('The radio did not key (PTT). (K0GIN) rigctld not answering')).toBeTruthy();
});

it('shows no problems card when all is well', async () => {
  await renderApp(<OperatorConsole />);
  expect(await screen.findByText('The station is not transmitting now')).toBeTruthy();
  expect(screen.queryByText('Problems right now')).toBeNull();
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

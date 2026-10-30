// "Sent by radio, heard by N listeners" on a request, its small map, and the member's choices.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { layout, RadioLoopSection, RadioPrefsSection, RadioSummaryCard } from '@/components/radio-summary';
import { api, type RadioSummary } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const admin: Record<string, jest.Mock> = {};
  const proxy = (t: Record<string, jest.Mock>) => new Proxy(t, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  const api = proxy(fns) as Record<string, unknown>;
  fns.admin = proxy(admin) as unknown as jest.Mock;
  return { api };
});

type Mocks = Record<'radioSummary' | 'radioPrefs' | 'updateRadioPrefs', jest.Mock> & { admin: Record<'radioLoop' | 'updateRadioLoop', jest.Mock> };
const mocked = api as unknown as Mocks;

const summary = (over: Partial<RadioSummary> = {}): RadioSummary => ({
  optedIn: false,
  sends: 2,
  station: { lat: 39.8, lon: -89.7 },
  latest: { sentAt: '2026-10-29T21:30:00Z', callSign: 'KD9XYZ', heardBy: 4, places: [{ name: 'Hilltop', lat: 39.8, lon: -89.5, snrDb: 15.1 }, { name: 'Chatham', lat: 39.7, lon: -89.7, snrDb: 8 }] },
  ...over,
});

it('says when it went out and how many heard it, with a map of where, and the one-notice choice', async () => {
  mocked.radioSummary.mockResolvedValue(summary());
  mocked.updateRadioPrefs.mockResolvedValue({ followup: true, namesPrivate: null });
  await renderApp(<RadioSummaryCard postId="p1" />);
  expect(await screen.findByText(/^Sent by radio at .+, heard by 4 listeners$/)).toBeTruthy();
  expect(screen.getByText('Sent 2 times in all')).toBeTruthy();
  expect(screen.getByLabelText('Map of where it was heard: Hilltop, Chatham')).toBeTruthy();
  await fireEvent.press(screen.getByRole('switch', { name: /Tell me once after each radio send/ }));
  await waitFor(() => expect(mocked.updateRadioPrefs).toHaveBeenCalledWith({ followup: true }));
});

it('says so gently before any listener reports it, and shows nothing before it goes out', async () => {
  mocked.radioSummary.mockResolvedValue(summary({ sends: 1, latest: { sentAt: '2026-10-29T21:30:00Z', callSign: null, heardBy: 0, places: [] } }));
  await renderApp(<RadioSummaryCard postId="p1" />);
  expect(await screen.findByText(/No listener has reported it yet\.$/)).toBeTruthy();
  expect(screen.queryByLabelText(/Map of where/)).toBeNull();

  mocked.radioSummary.mockResolvedValue(summary({ latest: null, sends: 0 }));
  await renderApp(<RadioSummaryCard postId="p2" />);
  await waitFor(() => expect(mocked.radioSummary).toHaveBeenCalledWith('p2'));
  expect(screen.queryByTestId('radio-summary')).toBeNull();
});

it('places the station and nodes in the box, north up', () => {
  const [st, hill, chat] = layout([{ name: '', lat: 39.8, lon: -89.7, station: true }, { name: 'Hilltop', lat: 39.8, lon: -89.5 }, { name: 'Chatham', lat: 39.7, lon: -89.7 }], 280, 150);
  expect(hill!.x).toBeGreaterThan(st!.x);
  expect(chat!.y).toBeGreaterThan(st!.y);
  for (const s of [st!, hill!, chat!]) {
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.x).toBeLessThanOrEqual(280);
    expect(s.y).toBeGreaterThanOrEqual(0);
    expect(s.y).toBeLessThanOrEqual(150);
  }
});

it('offers members only the choices whose switch is on', async () => {
  mocked.radioPrefs.mockResolvedValue({ followup: null, namesPrivate: false });
  mocked.updateRadioPrefs.mockResolvedValue({ followup: null, namesPrivate: true });
  await renderApp(<RadioPrefsSection />);
  await fireEvent.press(await screen.findByRole('switch', { name: /Keep names off the radio/ }));
  await waitFor(() => expect(mocked.updateRadioPrefs).toHaveBeenCalledWith({ namesPrivate: true }));
  expect(screen.queryByText('Tell me once after each radio send')).toBeNull();
});

it('lets an admin switch each one', async () => {
  mocked.admin.radioLoop.mockResolvedValue({ followup: false, readAloud: false, namePrivacy: false });
  mocked.admin.updateRadioLoop.mockResolvedValue({ followup: false, readAloud: true, namePrivacy: false });
  await renderApp(<RadioLoopSection />);
  await fireEvent.press(await screen.findByRole('switch', { name: /Offer reading aloud on the Listen screen/ }));
  await waitFor(() => expect(mocked.admin.updateRadioLoop).toHaveBeenCalledWith({ readAloud: true }));
});

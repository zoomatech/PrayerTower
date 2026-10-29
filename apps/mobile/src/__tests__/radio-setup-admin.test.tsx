// Admin → Radio: setup wizard, coverage map and weekly digest (all off by default on the server).
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { CoverageMap, CoverageSection, RadioDigestSection, RadioSetupSection } from '@/components/radio-setup-admin';
import { api, type RadioCoverage, type RadioSetup } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const mockAdmin = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api: { admin: mockAdmin } };
});

const admin = api.admin as unknown as Record<keyof typeof api.admin, jest.Mock>;

const setup = (over: Partial<RadioSetup> = {}): RadioSetup => ({
  enabled: true,
  choice: { rig: 'ic-7300', band: 'hf', port: '/dev/ttyUSB0' },
  rigs: [
    { id: 'vox', label: 'VOX', model: null },
    { id: 'ic-7300', label: 'Icom IC-7300', model: 3073 },
  ],
  env: { rigctld: ['RIG_MODEL=3073', 'RIG_DEVICE=/dev/ttyUSB0'], station: ['BURST_MODE=audio', 'RIG_CONTROL=rigctld'] },
  checks: [{ call_sign: 'W1AW', checks: [{ name: 'rig', ok: true, detail: '14.100000 MHz, receive' }], reported_at: '2026-10-29T06:00:00Z' }],
  tests: [],
  ...over,
});

const heardBurst = {
  id: 't1', kind: 'burst' as const, status: 'heard' as const, seconds: 10, code: 'ABC', call_sign: 'W1AW', preset: 'hf-standard', peak_dbfs: null,
  heard_by: 'Hilltop', heard_snr_db: 21.5, heard_peak_dbfs: -0.4, error: null, created_at: '', sent_at: '2026-10-29T06:01:00Z', heard_at: '2026-10-29T06:01:05Z', advice: 'hot' as const,
};

it('walks the setup steps: settings lines, station checks, a test tone, and a decoded burst with level advice', async () => {
  admin.radioSetup.mockResolvedValue(setup({ tests: [heardBurst] }));
  admin.requestSetupTest.mockResolvedValue({ test: {} });
  await renderApp(<RadioSetupSection />);
  expect(await screen.findByText(/RIG_MODEL=3073/)).toBeTruthy();
  expect(screen.getByText(/rig: 14.100000 MHz, receive/)).toBeTruthy();
  expect(screen.getByText('Decoded! Heard by Hilltop.')).toBeTruthy();
  expect(screen.getByText('Signal: 21.5 dB')).toBeTruthy();
  expect(screen.getByText(/clipping \(-0.4 dBFS peak\)/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Play a 10-second test tone'));
  await waitFor(() => expect(admin.requestSetupTest).toHaveBeenCalledWith('tone'));
});

it('saves the radio details and offers a hand confirmation when no listener reported', async () => {
  const failed = setup({ tests: [{ ...heardBurst, status: 'failed', heard_by: null, heard_snr_db: null, heard_peak_dbfs: null, advice: null, error: 'No listener reported hearing it' }] });
  admin.radioSetup.mockResolvedValue(failed);
  admin.updateRadioSetup.mockResolvedValue(failed);
  admin.confirmSetupTest.mockResolvedValue({ test: heardBurst });
  await renderApp(<RadioSetupSection />);
  await fireEvent.changeText(await screen.findByLabelText('Frequency in MHz'), '14.1');
  await fireEvent.press(screen.getByText('Save details'));
  await waitFor(() => expect(admin.updateRadioSetup).toHaveBeenCalledWith({ choice: { port: '/dev/ttyUSB0', frequencyHz: 14_100_000 } }));
  await fireEvent.press(screen.getByText('I decoded it on another device'));
  await waitFor(() => expect(admin.confirmSetupTest).toHaveBeenCalledWith('t1'));
});

it('shows only the switch while the wizard is off', async () => {
  admin.radioSetup.mockResolvedValue(setup({ enabled: false }));
  await renderApp(<RadioSetupSection />);
  expect(await screen.findByText('Setup wizard on')).toBeTruthy();
  expect(screen.queryByText('1. Pick the radio')).toBeNull();
});

const coverage: RadioCoverage = {
  enabled: true,
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  station: { lat: 40.1, lon: -88.2 },
  points: [{ id: 'n1', name: 'Hilltop', place: 'Springfield', lat: 39.8, lon: -89.7, snrDb: 18, reports: 3, lastHeardAt: null, lastSeenAt: null, quality: 'fair' }],
  unplaced: [{ id: 'n2', name: 'Valley' }],
};

it('draws the map with tiles and their credit line', async () => {
  await renderApp(<CoverageMap data={coverage} width={320} />);
  expect(screen.getByLabelText('Coverage map with 1 listener nodes')).toBeTruthy();
  expect(screen.getByText('© OpenStreetMap contributors')).toBeTruthy();
});

it('credits OpenStreetMap only for its own tile servers', async () => {
  await renderApp(<CoverageMap data={{ ...coverage, tileUrl: 'https://openstreetmap.org.evil.test/{z}/{x}/{y}.png' }} width={320} />);
  expect(screen.queryByText('© OpenStreetMap contributors')).toBeNull();
});

it('places an unplaced node by hand', async () => {
  admin.radioCoverage.mockResolvedValue(coverage);
  admin.placeRadioNode.mockResolvedValue(coverage);
  await renderApp(<CoverageSection />);
  expect(await screen.findByText(/Hilltop \(Springfield\): 18 dB typical, 3 reports/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Place Valley on the map'));
  await fireEvent.changeText(screen.getByLabelText(/Where is Valley\?/), '41.88, -87.63, Chicago');
  await fireEvent.press(screen.getByText('Save place'));
  await waitFor(() => expect(admin.placeRadioNode).toHaveBeenCalledWith('n2', { lat: 41.88, lon: -87.63, place: 'Chicago' }));
});

it('shows the weekly digest, newest first', async () => {
  const week = (week_start: string, aired: number) => ({ week_start, aired, heard: 2, answered: 1, thanksgiving: 1, praying_too: 4, failed: 0 });
  admin.radioDigest.mockResolvedValue({ enabled: true, email: false, weeks: [week('2026-10-19', 5), week('2026-10-26', 9)] });
  admin.updateRadioDigest.mockResolvedValue({ enabled: true, email: true, weeks: [] });
  await renderApp(<RadioDigestSection />);
  expect(await screen.findByLabelText('Week of 2026-10-26: 9 aired, 2 heard, 1 answered')).toBeTruthy();
  expect(screen.getByText('This week')).toBeTruthy();
  expect(screen.getByText(/1 thanksgiving bursts, 4 "I'm praying too" taps/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Email it to admins on Mondays'));
  await waitFor(() => expect(admin.updateRadioDigest).toHaveBeenCalledWith({ email: true }));
});

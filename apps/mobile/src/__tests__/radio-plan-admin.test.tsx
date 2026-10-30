// Admin → Radio: the band plan and urgent prayers (both off by default on the server).
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { BandOutlookCard, BandPlanSection, bandsText, parseBands, UrgentRadioButton, UrgentRadioSection } from '@/components/radio-plan-admin';
import { api, ApiError, type BandPlan, type UrgentRadio } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  const fns: Record<string, jest.Mock> = {};
  const mockAdmin = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { ApiError: actual.ApiError, api: { admin: mockAdmin } };
});

const admin = api.admin as unknown as Record<keyof typeof api.admin, jest.Mock>;
const hour = (h: number, band: string, onAir = true) => ({ at: `2026-10-29T${String(h).padStart(2, '0')}:00:00Z`, band, mufMhz: null, onAir });

const plan = (over: Partial<BandPlan> = {}): BandPlan => ({
  enabled: true,
  bands: [
    { label: '40 m', freqHz: 7_103_000, mode: 'usb' },
    { label: '20 m', freqHz: 14_103_000, mode: 'usb', preset: 'hf-standard' },
  ],
  spaceWeather: { sfi: 152.3, kp: 2.7, fluxAt: '2026-10-29T20:00:00Z', fetchedAt: '2026-10-29T21:00:00Z' },
  outlook: {
    now: { band: { label: '20 m', freqHz: 14_103_000, mode: 'usb' }, reason: 'hf', mufMhz: 24.6, workingMhz: 19.7 },
    spaceWeather: { sfi: 152.3, kp: 2.7, fluxAt: '2026-10-29T20:00:00Z', fetchedAt: '2026-10-29T21:00:00Z' },
    hours: [hour(18, '20 m'), hour(19, '20 m'), hour(20, '40 m', false), hour(21, '40 m')],
  },
  ...over,
});

const urgent = (over: Partial<UrgentRadio> = {}): UrgentRadio => ({
  enabled: true, repeats: 3, preset: 'auto', confirmMinutes: 15, maxRetries: 2, presetNow: 'hf-robust', nextWindowAt: '2026-10-29T19:00:00Z',
  prayers: [
    { id: 'u1', postId: 'p1', text: 'Pray for the crew in the mine.', status: 'transmitted', repeats: 3, flaggedAt: '', transmittedAt: '2026-10-29T19:01:00Z', confirmedAt: '2026-10-29T19:02:00Z', heardCount: 2, retries: 0 },
    { id: 'u2', postId: 'p2', text: 'Pray for the flood.', status: 'queued', repeats: 3, flaggedAt: '', transmittedAt: null, confirmedAt: null, heardCount: 0, retries: 1 },
  ],
  ...over,
});

it('reads and writes the bands as one line each', () => {
  const bands = parseBands('20 m, 14.103, usb, hf-standard\n\n2 m FM, 146.52, fm');
  expect(bands).toEqual([
    { label: '20 m', freqHz: 14_103_000, mode: 'usb', preset: 'hf-standard' },
    { label: '2 m FM', freqHz: 146_520_000, mode: 'fm' },
  ]);
  expect(bandsText(bands!)).toBe('20 m, 14.103, usb, hf-standard\n2 m FM, 146.52, fm');
  expect(parseBands('20 m, fourteen, usb')).toBeNull();
  expect(parseBands('20 m, 14.103, cw')).toBeNull();
});

it('saves the band plan and shows the band now and when it changes', async () => {
  admin.bandPlan.mockResolvedValue(plan());
  admin.updateBandPlan.mockResolvedValue(plan());
  await renderApp(<BandPlanSection />);
  expect(await screen.findByText(/Now: 20 m, 14.103 MHz · estimated MUF 24.6 MHz/)).toBeTruthy();
  expect(screen.getByText(/Solar flux 152.3, Kp 2.7/)).toBeTruthy();
  expect(screen.getByText(/: 40 m · outside the windows$/)).toBeTruthy();
  fireEvent.press(screen.getByText('Save bands'));
  await waitFor(() => expect(admin.updateBandPlan).toHaveBeenCalledWith({ bands: plan().bands }));
});

it('waits for space weather before the first reading', async () => {
  await renderApp(<BandOutlookCard outlook={{ now: null, spaceWeather: null, hours: [] }} />);
  expect(screen.getByText('Waiting for the first space weather reading.')).toBeTruthy();
});

it('lists urgent prayers: confirmed, waiting, and unflags a waiting one', async () => {
  admin.urgentRadio.mockResolvedValue(urgent());
  admin.unflagUrgent.mockResolvedValue(urgent({ prayers: [] }));
  await renderApp(<UrgentRadioSection />);
  expect(await screen.findByText(/Confirmed by a listener at/)).toBeTruthy();
  expect(screen.getByText(/Waiting for the next window · sent again once/)).toBeTruthy();
  expect(screen.getByText(/Next window: .*, on hf-robust/)).toBeTruthy();
  fireEvent.press(screen.getByText('Not urgent'));
  await waitFor(() => expect(admin.unflagUrgent).toHaveBeenCalledWith('u2'));
  expect(await screen.findByText('No urgent prayers in the last two days.')).toBeTruthy();
});

it('sends a request as urgent from the request, only while that is on', async () => {
  admin.urgentRadio.mockResolvedValue(urgent());
  admin.flagUrgent.mockResolvedValue({ id: 'u3', nextWindowAt: '2026-10-29T19:00:00Z' });
  await renderApp(<UrgentRadioButton postId="p9" />);
  fireEvent.press(await screen.findByText('Send as an urgent prayer'));
  await waitFor(() => expect(admin.flagUrgent).toHaveBeenCalledWith('p9'));
  expect(await screen.findByText(/Marked urgent. It goes out first at/)).toBeTruthy();

  admin.flagUrgent.mockRejectedValue(new ApiError(400, 'bad_request', 'no'));
  fireEvent.press(screen.getByText('Send as an urgent prayer'));
  expect(await screen.findByText('This request can’t go on the air.')).toBeTruthy();

});

it('shows no urgent button while urgent prayers are off', async () => {
  admin.urgentRadio.mockClear().mockResolvedValue(urgent({ enabled: false }));
  await renderApp(<UrgentRadioButton postId="p9" />);
  await waitFor(() => expect(admin.urgentRadio).toHaveBeenCalled());
  expect(screen.queryByText('Send as an urgent prayer')).toBeNull();
});

// Admin → Radio: listener requests, thank-you cards and the weekly station report (all off by default on the server).
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';

import { renderApp } from '@/__tests__/helpers';
import { ListenerSignupSection, QslCardsSection, StationReportSection } from '@/components/listener-admin';
import { api, type ListenerSignup, type StationReport } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const mockAdmin = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api: { admin: mockAdmin } };
});

const admin = api.admin as unknown as Record<keyof typeof api.admin, jest.Mock>;

const signup = (over: Partial<ListenerSignup> = {}): ListenerSignup => ({
  id: 's1', name: 'Ann', email: 'ann@example.com', place: 'Chatham', lat: null, lon: null, receiver: 'rtl-sdr', platform: 'pi', callSign: 'K9ABC',
  note: 'On a hill', edition: 'prayer-tower', status: 'pending', setupExpiresAt: null, nodeId: null, createdAt: '2026-10-29T20:00:00Z', ...over,
});

const week = (over: Partial<StationReport> = {}): StationReport => ({
  weekStart: '2026-10-19',
  bursts: { sent: 42, failed: 1, airSeconds: 600, prayers: 300, presets: { 'fm-standard': 42 } },
  prayers: { delivered: 300, heard: 240, failed: 2, waiting: 3 },
  listeners: { nodes: 4, reporting: 3, quiet: ['Lake cabin'], placed: 3, signups: 2, joined: 1, cards: 5, perNode: [] },
  problems: { total: 3, byKind: { ptt_failed: 1 }, burstErrors: [{ error: 'PTT did not key', count: 1 }] },
  ...over,
});

it('approves a listener and, with no email set up, offers the setup link to share', async () => {
  admin.listenerSignups.mockResolvedValue({ enabled: true, emailReady: false, signups: [signup(), signup({ id: 's2', name: 'Bo', status: 'joined' })] });
  admin.approveListener.mockResolvedValue({ signup: signup({ status: 'approved' }), setupUrl: 'https://api.example.org/listeners/setup/abc', emailed: false });
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  await renderApp(<ListenerSignupSection />);
  expect(await screen.findByText('1 request waiting')).toBeTruthy();
  expect(screen.getByText('Ann, Chatham')).toBeTruthy();
  expect(screen.getByText(/ann@example.com · RTL-SDR dongle · Raspberry Pi · K9ABC/)).toBeTruthy();
  expect(screen.getByText('Bo: listening')).toBeTruthy();
  fireEvent.press(screen.getByText('Approve and send setup link'));
  await waitFor(() => expect(admin.approveListener).toHaveBeenCalledWith('s1'));
  await waitFor(() => expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('https://api.example.org/listeners/setup/abc') }));
  expect(await screen.findByText(/Email is not set up/)).toBeTruthy();
});

it('turns listener sign-up on', async () => {
  admin.listenerSignups.mockResolvedValue({ enabled: false, emailReady: false, signups: [] });
  admin.setListenerSignups.mockResolvedValue({ enabled: true, emailReady: false, signups: [] });
  await renderApp(<ListenerSignupSection />);
  fireEvent.press(await screen.findByText('Listener sign-up on'));
  await waitFor(() => expect(admin.setListenerSignups).toHaveBeenCalledWith(true));
  expect(await screen.findByText('No requests waiting.')).toBeTruthy();
});

it('lists thank-you cards while they are on', async () => {
  admin.qslCards.mockResolvedValue({
    enabled: true,
    cards: [{ token: 't', path: '/qsl/t', node: 'Hilltop', callSign: 'W1AW', day: '2026-10-29', serial: 7, preset: 'fm-standard', bestSnrDb: 21.3, prayers: 12, firstHeardAt: '', lastHeardAt: '', edition: 'prayer-tower' }],
  });
  await renderApp(<QslCardsSection />);
  expect(await screen.findByText('No. 7 · Hilltop · W1AW · 2026-10-29 · 12 heard · 21.3 dB')).toBeTruthy();
});

it('shows last week and this week, and the console shows it read-only only while on', async () => {
  admin.stationReport.mockResolvedValue({ enabled: true, email: false, lastWeek: week(), thisWeek: week({ weekStart: '2026-10-26' }), history: [] });
  await renderApp(<StationReportSection />);
  expect(await screen.findByText('Week of 2026-10-19')).toBeTruthy();
  expect(screen.getByText('This week so far')).toBeTruthy();
  expect(screen.getAllByLabelText('Air time: 10 min')).toHaveLength(2);
  expect(screen.getAllByText('Quiet listeners: Lake cabin')).toHaveLength(2);
  expect(screen.getByText('Email it to admins and radio operators on Mondays')).toBeTruthy();

  await renderApp(<StationReportSection operator />);
  expect(await screen.findByText('Weekly station report')).toBeTruthy();
  admin.stationReport.mockResolvedValue({ enabled: false, email: false, lastWeek: null, thisWeek: null, history: [] });
  await renderApp(<StationReportSection operator />);
  await waitFor(() => expect(admin.stationReport).toHaveBeenCalledTimes(3));
});

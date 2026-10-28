// What sits above the feed: staff announcements (dismissable) and live video rooms.
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

import { renderApp } from '@/__tests__/helpers';
import { Announcements } from '@/components/announcements';
import { LiveNow } from '@/components/live-now';
import { api, type Announcement, type LiveRoom } from '@/lib/api';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: (f: () => void) => require('react').useEffect(f, [f]) }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));
jest.mock('@/lib/api', () => ({ api: { announcements: jest.fn(), dismissAnnouncement: jest.fn(async () => ({})), liveNow: jest.fn() } }));

const note = (over: Partial<Announcement>): Announcement => ({
  id: 'a1', kind: 'banner', title: 'Welcome to the pilot', body: '', titleEs: null, bodyEs: null, startsAt: '2026-10-28T00:00:00Z', endsAt: null, createdAt: '2026-10-28T00:00:00Z', ...over,
});
const room: LiveRoom = { id: 'r1', title: 'Evening prayer', roomUrl: 'https://meet.example/abc', hostName: 'Pastor Dan', isMine: false, startedAt: '2026-10-28T20:00:00Z' };

describe('Announcements', () => {
  it('shows a banner and a notice, and dismisses one', async () => {
    jest.mocked(api.announcements).mockResolvedValue({
      announcements: [note({}), note({ id: 'a2', kind: 'notice', title: 'Maintenance Saturday', body: 'The app is down 2–3 a.m.' })],
    } as Awaited<ReturnType<typeof api.announcements>>);
    await renderApp(<Announcements />);
    expect(await screen.findByText('Welcome to the pilot')).toBeTruthy();
    expect(screen.getByText('The app is down 2–3 a.m.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss: Welcome to the pilot' }));
    expect(api.dismissAnnouncement).toHaveBeenCalledWith('a1');
    expect(screen.queryByText('Welcome to the pilot')).toBeNull();
    expect(screen.getByText('Maintenance Saturday')).toBeTruthy();
  });

  it('never shows Spanish text to an English member', async () => {
    jest.mocked(api.announcements).mockResolvedValue({ announcements: [note({ titleEs: 'Bienvenidos' })] } as Awaited<ReturnType<typeof api.announcements>>);
    await renderApp(<Announcements />);
    expect(await screen.findByText('Welcome to the pilot')).toBeTruthy();
    expect(screen.queryByText('Bienvenidos')).toBeNull();
  });
});

describe('LiveNow', () => {
  it('lists live rooms and joins one', async () => {
    jest.mocked(api.liveNow).mockResolvedValue({ enabled: true, canHost: false, canCreateRoom: false, rooms: [room] });
    await renderApp(<LiveNow />);
    expect(await screen.findByText('Evening prayer')).toBeTruthy();
    expect(screen.getByText('Hosted by Pastor Dan')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Join' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://meet.example/abc');
    expect(screen.queryByRole('button', { name: 'Live video' })).toBeNull();
  });

  it('gives hosts the way in to start a room', async () => {
    jest.mocked(api.liveNow).mockResolvedValue({ enabled: true, canHost: true, canCreateRoom: true, rooms: [room] });
    await renderApp(<LiveNow />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Live video' }));
    expect(router.push).toHaveBeenCalledWith('/live');
  });
});

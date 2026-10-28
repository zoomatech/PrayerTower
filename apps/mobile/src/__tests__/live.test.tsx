// Live video: the "Live now" strip on the feed, and the host screen.
import { fireEvent, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { renderApp } from '@/__tests__/helpers';
import Live from '@/app/live';
import { LiveNow } from '@/components/live-now';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'opened' })) }));

const mocked = api as unknown as Record<keyof typeof api, jest.Mock>;
const room = { id: 'r1', title: 'Evening prayer', roomUrl: 'https://meet.example.org/PrayerTower-abc', hostName: 'Pastor Ann', isMine: false, startedAt: '2026-10-28T18:00:00Z' };

describe('Live now', () => {
  it('shows nothing while no room is live', async () => {
    mocked.liveNow.mockResolvedValue({ enabled: true, canHost: false, canCreateRoom: true, rooms: [] });
    await renderApp(<LiveNow />);
    expect(screen.queryByText('Live now')).toBeNull();
  });

  it('lists live rooms and opens one in the in-app browser', async () => {
    mocked.liveNow.mockResolvedValue({ enabled: true, canHost: false, canCreateRoom: true, rooms: [room] });
    await renderApp(<LiveNow />);
    expect(await screen.findByText('Live now')).toBeTruthy();
    expect(screen.getByText('Hosted by Pastor Ann')).toBeTruthy();
    await fireEvent.press(screen.getByText('Join'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(room.roomUrl);
  });
});

describe('Live video for hosts', () => {
  it('asks for a link when there is no video server', async () => {
    mocked.liveNow.mockResolvedValue({ enabled: true, canHost: true, canCreateRoom: false, rooms: [] });
    mocked.startLive.mockResolvedValue({ id: 'r2', roomUrl: 'https://zoom.us/j/1' });
    await renderApp(<Live />);
    expect(await screen.findByText('No video server is set up, so paste a meeting link.')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Evening prayer'), 'Bible study');
    await fireEvent.changeText(screen.getByLabelText('Meeting link (optional)'), 'https://zoom.us/j/1');
    await fireEvent.press(screen.getByText('Go live'));
    expect(mocked.startLive).toHaveBeenCalledWith('Bible study', 'https://zoom.us/j/1');
  });
});

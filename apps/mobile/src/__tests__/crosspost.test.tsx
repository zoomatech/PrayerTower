// Cross-posting a member's own Facebook and Threads posts here.
import { fireEvent, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { renderApp } from '@/__tests__/helpers';
import Crosspost from '@/app/crosspost';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({ api: { crosspost: { status: jest.fn(), newKey: jest.fn(), connect: jest.fn(), update: jest.fn(), revokeKey: jest.fn(), disconnect: jest.fn() } } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn().mockResolvedValue({ type: 'dismiss' }) }));

// The first render of this screen loads several modules; give it time on slow CI machines.
jest.setTimeout(30_000);

const status = {
  enabled: true,
  connectable: { facebook: false, threads: true },
  accounts: [],
  postType: null,
  postTypes: ['prayer_request', 'praise', 'testimony'],
  paused: false,
  extensionKeyHint: null,
  recent: [{ source: 'facebook', via: 'extension', status: 'posted', reason: null, postId: 'p1', permalink: null, createdAt: '2026-10-28T12:00:00Z' }],
};

it('makes an extension key, shows it once, and connects Threads', async () => {
  (api.crosspost.status as jest.Mock).mockResolvedValue(status);
  (api.crosspost.newKey as jest.Mock).mockResolvedValue({ key: 'ptx_abc123' });
  (api.crosspost.connect as jest.Mock).mockResolvedValue({ url: 'https://threads.com/oauth/authorize?x=1' });
  await renderApp(<Crosspost />);
  expect(await screen.findByText('Cross-posting')).toBeTruthy();
  expect(screen.getByText(/Connecting Facebook is not set up yet/)).toBeTruthy();
  expect(screen.getByText(/Copied/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Make my extension key' }));
  expect(await screen.findByText('ptx_abc123')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Connect Threads' }));
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://threads.com/oauth/authorize?x=1');
});

it('says when cross-posting is off', async () => {
  (api.crosspost.status as jest.Mock).mockResolvedValue({ ...status, enabled: false });
  await renderApp(<Crosspost />);
  expect(await screen.findByText('Cross-posting is not turned on right now.')).toBeTruthy();
});

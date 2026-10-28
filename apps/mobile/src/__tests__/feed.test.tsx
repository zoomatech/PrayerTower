// The feed: a new member's first screen.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import Feed from '@/app/(tabs)/index';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me', display_name: 'Ruth' } }) }));
jest.mock('@/lib/pray-widget', () => ({ updatePrayWidget: jest.fn() }));

const mocked = api as unknown as Record<keyof typeof api, jest.Mock>;
const first = sampleCard();
const second = sampleCard({ id: 'p2', body: 'Pray for peace in our town.', author: { id: 'u2', displayName: 'Sam', handle: null, anonymous: false, tier: null, pastor: null } });

beforeEach(async () => {
  await AsyncStorage.setItem('tour:seen:v1:me', '1');
  mocked.feed.mockResolvedValue({ posts: [first, second], nextPage: null, pinnedId: null, theme: null });
  mocked.macroNeeds.mockResolvedValue({ needs: [] });
  mocked.prompt.mockResolvedValue({ prompt: null });
  mocked.features.mockResolvedValue({ features: {} });
  mocked.announcements.mockResolvedValue({ announcements: [] });
});

describe('Feed', () => {
  it('greets the member and shows the requests', async () => {
    await renderApp(<Feed />);
    expect(await screen.findByText('Pray for peace in our town.')).toBeTruthy();
    expect(screen.getByText("Welcome, Ruth! Let's talk to the Lord.")).toBeTruthy();
    expect(screen.getByText(first.body)).toBeTruthy();
  });

  it('opens the composer from the box at the top', async () => {
    await renderApp(<Feed />);
    await fireEvent.press(await screen.findByText('Type your prayer here…'));
    expect(router.push).toHaveBeenCalledWith('/compose');
  });

  it('shows the short tour the first time on this device', async () => {
    await AsyncStorage.removeItem('tour:seen:v1:me');
    await renderApp(<Feed />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/tour'));
  });

  it('removes a post the member marks "not for me" and tells the server', async () => {
    mocked.hidePost.mockResolvedValue({ hidden: true });
    await renderApp(<Feed />);
    await screen.findByText(second.body);
    await fireEvent.press(screen.getAllByRole('button', { name: /not for me/i })[1]!);
    expect(screen.queryByText(second.body)).toBeNull();
    expect(mocked.hidePost).toHaveBeenCalledWith('p2');
  });

  it('switches to testimonies only', async () => {
    await renderApp(<Feed />);
    await fireEvent.press(await screen.findByText('Testimonies'));
    await waitFor(() => expect(mocked.feed).toHaveBeenCalledWith(0, 'testimonies'));
    expect(screen.getByText(/Answered prayers, in the words of the people who asked/)).toBeTruthy();
  });

  it('shows the error when the feed cannot load', async () => {
    mocked.feed.mockRejectedValue(new Error('Something went wrong'));
    await renderApp(<Feed />);
    expect(await screen.findByText('Something went wrong')).toBeTruthy();
  });

  it('answers a "when did you last pray for…" prompt', async () => {
    mocked.prompt.mockResolvedValue({ prompt: { id: 'q1', postId: 'p2', question: 'When was the last time you prayed for Sam?' } });
    await renderApp(<Feed />);
    await fireEvent.press(await screen.findByRole('button', { name: 'I prayed' }));
    expect(mocked.answerPrompt).toHaveBeenCalledWith('q1', 'prayed');
    expect(screen.queryByText('When was the last time you prayed for Sam?')).toBeNull();
  });
});

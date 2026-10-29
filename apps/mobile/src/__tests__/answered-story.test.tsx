// "How it turned out" stories: the person who asked posts a short follow-up from their
// request, which opens the new story; both cards link to each other while the switch is on.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import PostScreen from '@/app/post/[id]';
import { PostCard } from '@/components/post-card';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me' }, roles: [], refreshProfile: jest.fn(), signOut: jest.fn() }) }));

const mocked = api as unknown as Record<string, jest.Mock>;
const on = (answeredStories: boolean) => mocked.features!.mockResolvedValue({ features: { answeredStories } });
const settle = async () => {
  for (let i = 0; i < 4; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const mine = sampleCard({ id: 'p1', isMine: true, state: 'answered' });

beforeEach(() => {
  resetFeatures();
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'p1' });
  mocked.post!.mockReset().mockResolvedValue({ post: mine });
  mocked.comments!.mockReset().mockResolvedValue({ comments: [] });
  mocked.prayers!.mockReset().mockResolvedValue({ count: 0, people: [] });
  mocked.tokens!.mockReset().mockResolvedValue(null);
  mocked.powerPrayerStatus!.mockReset().mockResolvedValue(null);
  mocked.answeredStory!.mockReset().mockResolvedValue({ post: sampleCard({ id: 's1' }), crisis: false });
});
afterEach(() => (useLocalSearchParams as jest.Mock).mockReturnValue({}));

describe('Answered-prayer stories', () => {
  it('stays hidden while off', async () => {
    on(false);
    await renderApp(<PostScreen />);
    await settle();
    expect(screen.queryByText('Share how God answered')).toBeNull();
  });

  it('lets the asker post the story and opens it', async () => {
    on(true);
    await renderApp(<PostScreen />);
    await settle();
    await act(async () => fireEvent.press(screen.getByText('Share how God answered')));
    await act(async () => fireEvent.changeText(screen.getByPlaceholderText('What happened?'), 'The surgery went well.'));
    await act(async () => fireEvent.press(screen.getByText('Share the story')));
    expect(api.answeredStory).toHaveBeenCalledWith('p1', 'The surgery went well.');
    expect(router.push).toHaveBeenCalledWith('/post/s1');
  });

  it('offers no second story once one exists', async () => {
    on(true);
    mocked.post!.mockResolvedValue({ post: { ...mine, storyId: 's1' } });
    await renderApp(<PostScreen />);
    await settle();
    expect(screen.queryByText('Share how God answered')).toBeNull();
    expect(screen.getAllByText(/Read how it turned out/).length).toBeGreaterThan(0);
  });

  it('links a story card back to its request', async () => {
    on(true);
    await renderApp(<PostCard card={sampleCard({ id: 's1', answers: { id: 'p1', preview: 'Please pray for my mom' } })} onAction={() => {}} />);
    await settle();
    await act(async () => fireEvent.press(screen.getByText(/Answers: “Please pray for my mom”/)));
    expect(router.push).toHaveBeenCalledWith('/post/p1');
  });
});

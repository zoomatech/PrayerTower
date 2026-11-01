// Groups (Steve, 2026-10-31): open topic groups like Facebook groups, starting with Cancer
// survivors. A feed, not a chat room: join, share, comment and pray. Open Circle wording swaps
// prayer for "Thinking of you".
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { renderApp } from '@/__tests__/helpers';
import GroupPage from '@/app/topic-groups/[id]';
import Groups from '@/app/topic-groups/index';
import { api, type TopicGroupView } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});

const mocked = api as unknown as Record<string, jest.Mock>;
const settle = async () => {
  for (let i = 0; i < 4; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

const cancer = { id: 'g1', name: 'Cancer survivors', about: 'For cancer survivors to pray for, encourage and get to know one another.', members: 14, joined: false, isLeader: false, leader: null };
const view = (joined: boolean): TopicGroupView => ({
  group: { ...cancer, joined },
  posts: [
    {
      id: 'p1',
      author: { id: 'u2', displayName: 'Ana' },
      body: 'Five years clear this week.',
      createdAt: '2026-10-31T00:00:00Z',
      prayed: 3,
      prayedByMe: false,
      canRemove: false,
      comments: [{ id: 'c1', author: { id: 'u3', displayName: 'Ben' }, body: 'So happy for you!', createdAt: '2026-10-31T01:00:00Z', canRemove: false }],
    },
  ],
});

beforeEach(() => {
  resetFeatures();
  mocked.features!.mockResolvedValue({ features: { kindCloud: true } });
  mocked.precheck!.mockResolvedValue({ warn: false });
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'g1' });
});
afterEach(async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  await act(() => setWording('faith'));
});

describe('Groups', () => {
  it('lists Cancer survivors and starts a new group', async () => {
    mocked.topicGroups!.mockResolvedValue({ groups: [cancer] });
    mocked.createTopicGroup!.mockResolvedValue({ id: 'g9' });
    await renderApp(<Groups />);
    await settle();
    expect(screen.getByText('Cancer survivors')).toBeTruthy();
    expect(screen.getByText('14 members')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('start-topic-group')));
    await act(async () => fireEvent.changeText(screen.getByLabelText('Group name'), 'Caregivers'));
    await act(async () => fireEvent.press(screen.getByText('Start the group')));
    expect(mocked.createTopicGroup).toHaveBeenCalledWith('Caregivers', undefined);
    expect(router.push).toHaveBeenCalledWith('/topic-groups/g9');
  });

  it('shows the feed to anyone, and lets members share, comment and pray', async () => {
    mocked.topicGroup!.mockReset().mockResolvedValue(view(false));
    await renderApp(<GroupPage />);
    await settle();
    expect(screen.getByText('Five years clear this week.')).toBeTruthy();
    expect(screen.getByText('So happy for you!')).toBeTruthy();
    expect(screen.queryByTestId('topic-group-pray-p1')).toBeNull();

    mocked.topicGroup!.mockResolvedValue(view(true));
    await act(async () => fireEvent.press(screen.getByTestId('join-topic-group')));
    await settle();
    expect(mocked.joinTopicGroup).toHaveBeenCalledWith('g1');

    await act(async () => fireEvent.changeText(screen.getByLabelText('What would you like to share?'), 'Starting chemo Monday.'));
    await act(async () => fireEvent.press(screen.getByText('Post')));
    expect(mocked.topicGroupPost).toHaveBeenCalledWith('g1', 'Starting chemo Monday.');

    await act(async () => fireEvent.press(screen.getByTestId('topic-group-pray-p1')));
    expect(mocked.topicGroupPray).toHaveBeenCalledWith('p1');

    await act(async () => fireEvent.press(screen.getByText('Comment')));
    await act(async () => fireEvent.changeText(screen.getByLabelText('Write a comment'), 'Praying with you.'));
    await act(async () => fireEvent.press(screen.getByText('Send')));
    expect(mocked.topicGroupComment).toHaveBeenCalledWith('p1', 'Praying with you.');
  });

  it('says "Thinking of you" in Open Circle', async () => {
    await act(() => setWording('neutral'));
    mocked.topicGroup!.mockReset().mockResolvedValue(view(true));
    await renderApp(<GroupPage />);
    await settle();
    expect(screen.getByText(/Thinking of you/)).toBeTruthy();
    expect(screen.getByText('3 are thinking of them')).toBeTruthy();
  });
});

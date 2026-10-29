// Prayer circles: start or join a circle, share inside it with the kind cloud, pray with one
// tap, and reply with a starter. Only the asker sees how many prayed; Open Circle wording swaps
// prayer for "Thinking of you".
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { renderApp } from '@/__tests__/helpers';
import CircleScreen from '@/app/circles/[id]';
import Circles from '@/app/circles/index';
import { api, type CircleView } from '@/lib/api';
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

const view = (over: Partial<CircleView> = {}): CircleView => ({
  circle: { id: 'c1', name: 'Tuesday friends', about: 'We pray on Tuesdays.', isOwner: true, ownerId: 'me', full: false },
  members: [
    { id: 'me', displayName: 'Me' },
    { id: 'u2', displayName: 'Ana' },
  ],
  invite: { code: 'ABCD2345', expiresAt: '2026-11-05T00:00:00Z' },
  posts: [
    { id: 'p1', author: { id: 'u2', displayName: 'Ana' }, body: 'Please pray for my interview.', createdAt: '2026-10-29T00:00:00Z', prayedByMe: false, replies: [] },
    { id: 'p2', author: { id: 'me', displayName: 'Me' }, body: 'My mother is unwell.', createdAt: '2026-10-28T00:00:00Z', prayedByMe: false, prayed: 3, replies: [{ id: 'r1', author: { id: 'u2', displayName: 'Ana' }, body: 'Holding you close.', createdAt: '2026-10-28T01:00:00Z' }] },
  ],
  ...over,
});

beforeEach(() => {
  resetFeatures();
  mocked.features!.mockResolvedValue({ features: { prayerCircles: true, kindCloud: true } });
  mocked.precheck!.mockResolvedValue({ warn: false });
  mocked.conversationPrefs!.mockResolvedValue({ prefs: {} });
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'c1' });
  mocked.circle!.mockReset().mockResolvedValue(view());
});
afterEach(async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  await act(() => setWording('faith'));
});

describe('Prayer circles', () => {
  it('lists circles, starts one and joins with a code', async () => {
    mocked.myCircles!.mockResolvedValue({ enabled: true, circles: [{ id: 'c1', name: 'Tuesday friends', about: null, isOwner: true, members: 2, lastPostAt: null }] });
    mocked.createCircle!.mockResolvedValue({ id: 'c9' });
    mocked.joinCircle!.mockResolvedValue({ id: 'c8' });
    await renderApp(<Circles />);
    await settle();
    expect(screen.getByText('Tuesday friends')).toBeTruthy();
    expect(screen.getByText(/2 people · You started this circle/)).toBeTruthy();
    await act(async () => fireEvent.changeText(screen.getByLabelText('Circle name'), 'Night shift'));
    await act(async () => fireEvent.press(screen.getByText('Start it')));
    expect(api.createCircle).toHaveBeenCalledWith('Night shift', undefined);
    expect(router.push).toHaveBeenCalledWith('/circles/c9');
    await act(async () => fireEvent.changeText(screen.getByLabelText('Invite code'), 'wxyz2345'));
    await act(async () => fireEvent.press(screen.getByText('Join')));
    expect(api.joinCircle).toHaveBeenCalledWith('WXYZ2345');
  });

  it('shares, prays and shows the count only on your own post', async () => {
    await renderApp(<CircleScreen />);
    await settle();
    expect(screen.getByText('Invite code: ABCD2345')).toBeTruthy();
    expect(screen.getByText('3 prayed for this')).toBeTruthy();
    expect(screen.getAllByText('🙏 I prayed')).toHaveLength(1);
    await act(async () => fireEvent.press(screen.getByText('🙏 I prayed')));
    expect(api.circlePray).toHaveBeenCalledWith('p1');
    await act(async () => fireEvent.changeText(screen.getByLabelText('What would you like prayer for?'), 'Pray for rain.'));
    await act(async () => fireEvent.press(screen.getByText('Share')));
    expect(api.circlePost).toHaveBeenCalledWith('c1', 'Pray for rain.');
    expect(screen.getByText('Holding you close.')).toBeTruthy();
  });

  it('replies to a post', async () => {
    await renderApp(<CircleScreen />);
    await settle();
    await act(async () => fireEvent.press(screen.getAllByText('Reply')[0]!));
    await act(async () => fireEvent.changeText(screen.getByLabelText('A kind word'), 'Praying for you.'));
    await act(async () => fireEvent.press(screen.getByText('Send')));
    expect(api.circleReply).toHaveBeenCalledWith('p1', 'Praying for you.');
  });

  it('a member who did not start the circle cannot invite or remove others', async () => {
    mocked.circle!.mockResolvedValue(view({ circle: { id: 'c1', name: 'Tuesday friends', about: null, isOwner: false, ownerId: 'u2', full: false }, invite: null }));
    await renderApp(<CircleScreen />);
    await settle();
    expect(screen.queryByText('Make an invite code')).toBeNull();
    expect(screen.queryByText('Remove from circle')).toBeNull();
    expect(screen.getByText('Leave this circle')).toBeTruthy();
  });

  it('uses Open Circle wording there', async () => {
    await act(() => setWording('neutral'));
    await renderApp(<CircleScreen />);
    await settle();
    expect(screen.getByText('🙏 Thinking of you')).toBeTruthy();
    expect(screen.getByText('3 are thinking of you')).toBeTruthy();
  });
});

// Circle updates: the person who shared adds how it's going or marks it answered, everyone in
// the circle sees it, and three good things can be shared to a circle. Off by default.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import { renderApp } from '@/__tests__/helpers';
import CircleScreen from '@/app/circles/[id]';
import { GratitudeCard } from '@/components/gratitude-card';
import { api, type CirclePost, type CircleView } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});

const mocked = api as unknown as Record<string, jest.Mock>;
const settle = async () => {
  for (let i = 0; i < 4; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const features = (f: Record<string, boolean>) => mocked.features!.mockResolvedValue({ features: f });
const post = (extra: Partial<CirclePost>): CirclePost => ({
  id: 'p1',
  author: { id: 'me', displayName: 'Me' },
  body: 'Job interview on Friday.',
  createdAt: '2026-10-27T10:00:00Z',
  prayedByMe: false,
  prayed: 2,
  replies: [],
  ...extra,
});
const view = (p: CirclePost): CircleView => ({
  circle: { id: 'c1', name: 'Tuesday friends', about: null, isOwner: false, ownerId: 'u2', full: false },
  members: [{ id: 'me', displayName: 'Me' }],
  invite: null,
  posts: [p],
});

beforeEach(() => {
  resetFeatures();
  mocked.precheck!.mockResolvedValue({ warn: false });
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'c1' });
});
afterEach(() => (useLocalSearchParams as jest.Mock).mockReturnValue({}));

it('offers no update while off', async () => {
  features({ prayerCircles: true });
  mocked.circle!.mockResolvedValue(view(post({})));
  await renderApp(<CircleScreen />);
  await settle();
  expect(screen.getByText('Job interview on Friday.')).toBeTruthy();
  expect(screen.queryByText('Share how it’s going')).toBeNull();
});

it('lets the person who shared mark it answered, and shows the update', async () => {
  features({ prayerCircles: true, circleUpdates: true });
  mocked.circle!.mockResolvedValueOnce(view(post({}))).mockResolvedValue(view(post({ update: { text: 'I got the job!', answered: true, at: '2026-10-29T10:00:00Z' } })));
  mocked.circleUpdate!.mockResolvedValue({ ok: true });
  await renderApp(<CircleScreen />);
  await settle();
  await act(async () => fireEvent.press(screen.getByText('Share how it’s going')));
  await act(async () => fireEvent.changeText(screen.getByLabelText('How it’s going'), 'I got the job!'));
  await act(async () => fireEvent.press(screen.getByText('It was answered')));
  await act(async () => fireEvent.press(screen.getByText('Share the update')));
  await settle();
  expect(api.circleUpdate).toHaveBeenCalledWith('p1', 'I got the job!', true);
  expect(screen.getByTestId('circle-update-p1')).toHaveTextContent(/Answered.*I got the job!/);
});

it('shares three good things to a chosen circle', async () => {
  features({ gratitudeCard: true, circleUpdates: true });
  mocked.gratitude!.mockResolvedValue({ enabled: true, weekday: null, weekStart: '2026-10-26', items: ['A long walk'] });
  mocked.myCircles!.mockResolvedValue({ circles: [{ id: 'c1', name: 'Tuesday friends', about: null, members: 3, isOwner: false }] });
  await renderApp(<GratitudeCard />);
  await settle();
  await act(async () => fireEvent.press(screen.getByText('Share with Tuesday friends')));
  await settle();
  expect(api.circlePost).toHaveBeenCalledWith('c1', 'A long walk');
  expect(screen.getByText('Shared with Tuesday friends.')).toBeTruthy();
});

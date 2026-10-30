// Batch E kindness tools: who can reply (the asker's choice, a gentle note for others), the
// path back after a removal (own words back into the composer), and the circle welcome.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { renderApp } from '@/__tests__/helpers';
import Notices from '@/app/notifications';
import CircleScreen from '@/app/circles/[id]';
import { ReplyChoiceGate } from '@/components/reply-choice';
import { api, type CircleView } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';
import { Text } from 'react-native';

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

beforeEach(() => {
  resetFeatures();
  mocked.precheck!.mockResolvedValue({ warn: false });
  mocked.conversationPrefs!.mockResolvedValue({ prefs: {} });
});
afterEach(async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  await act(() => setWording('faith'));
});

describe('Who can reply', () => {
  it('shows the composer as before while off', async () => {
    features({});
    await renderApp(<ReplyChoiceGate postId="p1"><Text>composer</Text></ReplyChoiceGate>);
    await settle();
    expect(screen.getByText('composer')).toBeTruthy();
    expect(api.replyChoice).not.toHaveBeenCalled();
  });

  it('lets the asker choose, and keeps the composer', async () => {
    features({ replyChoice: true });
    mocked.replyChoice!.mockResolvedValue({ enabled: true, audience: 'everyone', canComment: true, isMine: true });
    mocked.setReplyChoice!.mockResolvedValue({ enabled: true, audience: 'none', canComment: true, isMine: true });
    await renderApp(<ReplyChoiceGate postId="p1"><Text>composer</Text></ReplyChoiceGate>);
    await settle();
    await act(async () => fireEvent.press(screen.getByText('No comments, just prayers')));
    expect(api.setReplyChoice).toHaveBeenCalledWith('p1', 'none');
    expect(screen.getByText('You can still post updates.')).toBeTruthy();
    expect(screen.getByText('composer')).toBeTruthy();
  });

  it('shows others a gentle note instead of the composer', async () => {
    features({ replyChoice: true });
    mocked.replyChoice!.mockResolvedValue({ enabled: true, audience: 'supporters', canComment: false, isMine: false });
    await renderApp(<ReplyChoiceGate postId="p1"><Text>composer</Text></ReplyChoiceGate>);
    await settle();
    expect(screen.queryByText('composer')).toBeNull();
    expect(screen.getByText(/chose comments from people who prayed/)).toBeTruthy();
  });

  it('uses Open Circle wording there', async () => {
    features({ replyChoice: true });
    await act(() => setWording('neutral'));
    mocked.replyChoice!.mockResolvedValue({ enabled: true, audience: 'none', canComment: false, isMine: false });
    await renderApp(<ReplyChoiceGate postId="p1"><Text>composer</Text></ReplyChoiceGate>);
    await settle();
    expect(screen.getByText(/would like support here, without comments/)).toBeTruthy();
  });
});

describe('Path back', () => {
  const notice = (pathBack: boolean) => ({
    id: 'n1', kind: 'moderation_notice', title: 'Your request was removed', body: 'We removed your request…', created_at: '2026-10-29T00:00:00Z', read_at: null,
    data: { itemId: 'i1', rule: 'abuse', appealable: true, ...(pathBack ? { pathBack: true } : {}) },
  });

  it('opens the author’s own words in the composer', async () => {
    features({ pathBack: true });
    mocked.notifications!.mockResolvedValue({ notifications: [notice(true)] });
    mocked.removedWords!.mockResolvedValue({ target: 'post', body: 'Pray for my brother & his health', postType: 'prayer_request' });
    await renderApp(<Notices />);
    await settle();
    await act(async () => fireEvent.press(screen.getByText('Post again with changes')));
    expect(api.removedWords).toHaveBeenCalledWith('i1');
    expect(router.push).toHaveBeenCalledWith(`/compose?body=${encodeURIComponent('Pray for my brother & his health')}`);
  });

  it('sends a removed comment back to its post', async () => {
    features({ pathBack: true });
    mocked.notifications!.mockResolvedValue({ notifications: [notice(true)] });
    mocked.removedWords!.mockResolvedValue({ target: 'comment', body: 'Kinder words', postId: 'p9' });
    await renderApp(<Notices />);
    await settle();
    await act(async () => fireEvent.press(screen.getByText('Post again with changes')));
    expect(router.push).toHaveBeenCalledWith('/post/p9?draft=Kinder%20words');
  });

  it('is not offered without it', async () => {
    mocked.notifications!.mockResolvedValue({ notifications: [notice(false)] });
    await renderApp(<Notices />);
    await settle();
    expect(screen.queryByText('Post again with changes')).toBeNull();
  });
});

describe('Circle welcome', () => {
  const view = (welcome: CircleView['welcome'], isOwner = false): CircleView => ({
    circle: { id: 'c1', name: 'Tuesday friends', about: null, isOwner, ownerId: isOwner ? 'me' : 'u2', full: false },
    members: [{ id: 'me', displayName: 'Me' }],
    invite: null,
    ...(welcome ? { welcome } : {}),
    posts: [],
  });
  beforeEach(() => {
    features({ prayerCircles: true, circleWelcome: true });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'c1' });
  });

  it('shows a first-time poster the welcome, with the default words, until dismissed', async () => {
    mocked.circle!.mockResolvedValueOnce(view({ text: null, show: true })).mockResolvedValue(view({ text: null, show: false }));
    await renderApp(<CircleScreen />);
    await settle();
    expect(screen.getByText(/be a goldfish/)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('Got it')));
    await settle();
    expect(api.circleWelcomeSeen).toHaveBeenCalledWith('c1');
    expect(screen.queryByTestId('circle-welcome')).toBeNull();
  });

  it('lets the starter write the welcome', async () => {
    mocked.circle!.mockResolvedValue(view({ text: null, show: false }, true));
    await renderApp(<CircleScreen />);
    await settle();
    await act(async () => fireEvent.changeText(screen.getByLabelText('Welcome for people new to this circle'), 'Be kind, be brief.'));
    await act(async () => fireEvent.press(screen.getByText('Save the welcome')));
    expect(api.setCircleWelcome).toHaveBeenCalledWith('c1', 'Be kind, be brief.');
  });
});

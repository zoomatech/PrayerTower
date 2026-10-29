// Comment kindness: the asker's heart, a private thank-you, and quiet counts. No numbers.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { CommentKindness, QuietCountsCard, resetQuietCounts, useCommentKindness } from '@/components/comment-kindness';
import { PostCard } from '@/components/post-card';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me' }, roles: [] }) }));

const mocked = api as unknown as Record<string, jest.Mock>;
const on = (f: Record<string, boolean>) => mocked.features!.mockResolvedValue({ features: f });
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

function Under({ isAsker }: { isAsker: boolean }) {
  const k = useCommentKindness('p1');
  return (
    <View>
      <CommentKindness k={k} commentId="c1" isAsker={isAsker} isMine={false} />
    </View>
  );
}

beforeEach(() => {
  resetFeatures();
  resetQuietCounts();
  mocked.commentKindness!.mockReset().mockResolvedValue({ hearts: [], thanked: [] });
  mocked.heartComment!.mockReset().mockResolvedValue({ on: true });
  mocked.thankComment!.mockReset().mockResolvedValue({ thanked: true });
});
afterEach(() => act(() => setWording('faith')));

describe('Comment kindness', () => {
  it('shows nothing while off', async () => {
    on({});
    await renderApp(<Under isAsker />);
    await settle();
    expect(screen.queryByText(/Love this|Thank/)).toBeNull();
  });

  it('lets the asker heart a comment, and others see it loved', async () => {
    on({ authorHearts: true });
    await renderApp(<Under isAsker />);
    await settle();
    await act(async () => fireEvent.press(screen.getByText('♡ Love this')));
    expect(api.heartComment).toHaveBeenCalledWith('c1', true);
    expect(screen.getByText('❤️ You loved this')).toBeTruthy();
  });

  it('shows others "Loved by the person who asked"', async () => {
    on({ authorHearts: true });
    mocked.commentKindness!.mockResolvedValue({ hearts: ['c1'], thanked: [] });
    await renderApp(<Under isAsker={false} />);
    await settle();
    expect(screen.getByText('❤️ Loved by the person who asked')).toBeTruthy();
  });

  it('sends a private thank-you once', async () => {
    on({ commentThanks: true });
    await renderApp(<Under isAsker={false} />);
    await settle();
    await act(async () => fireEvent.press(screen.getByText('Thank')));
    expect(api.thankComment).toHaveBeenCalledWith('c1');
    expect(screen.getByText('✓ Thanked')).toBeTruthy();
  });

  it('hides prayer numbers when the author chose quiet counts', async () => {
    on({ quietCounts: true });
    mocked.quietCounts!.mockResolvedValue({ enabled: true, hideSeen: false, hideMine: false });
    const card = sampleCard({ id: 'p2', countsQuiet: true, counts: { ...sampleCard().counts, prayers: 7 } });
    await renderApp(<PostCard card={card} onAction={jest.fn()} />);
    await settle();
    expect(screen.getByText(/People are praying with you/)).toBeTruthy();
    expect(screen.queryByText(/7/)).toBeNull();
  });

  it('lets a member choose quiet counts on Me, in Open Circle wording there', async () => {
    await act(() => setWording('neutral'));
    on({ quietCounts: true });
    mocked.quietCounts!.mockResolvedValue({ enabled: true, hideSeen: false, hideMine: false });
    mocked.setQuietCounts!.mockResolvedValue({ enabled: true, hideSeen: true, hideMine: false });
    await renderApp(<QuietCountsCard />);
    await settle();
    await act(async () => fireEvent.press(screen.getByText('Hide support numbers on posts I see')));
    expect(api.setQuietCounts).toHaveBeenCalledWith({ hideSeen: true });
  });
});

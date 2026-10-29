// Kind norms: the promise card, the notes above the reply box, "This helped" and
// "Offer a private sorry", each hidden while its switch is off.
import type { Comment } from '@prayer-tower/shared';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { renderApp } from '@/__tests__/helpers';
import { HelpedButton, KindnessPromise, OfferSorry, ReplyNotes } from '@/components/kind-norms';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/lib/api', () => ({
  api: { features: jest.fn(), kindnessPromise: jest.fn(), agreeKindnessPromise: jest.fn(), replyBox: jest.fn(), setHelped: jest.fn(), sorryOffer: jest.fn(), offerSorry: jest.fn() },
}));

const on = (features: object) => jest.mocked(api.features).mockResolvedValue({ features } as unknown as Awaited<ReturnType<typeof api.features>>);
const comment = (extra: Partial<Comment> = {}): Comment => ({
  id: 'c1',
  parentId: null,
  body: 'You are not alone.',
  isUpdate: false,
  createdAt: '2026-10-29T08:00:00Z',
  author: { id: 'u2', displayName: 'Ruth' } as Comment['author'],
  ...extra,
});

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.kindnessPromise).mockReset().mockResolvedValue({ enabled: true, text: null, agreed: false });
  jest.mocked(api.agreeKindnessPromise).mockReset().mockResolvedValue({ agreed: true });
  jest.mocked(api.replyBox).mockReset().mockResolvedValue({ reminder: true, resting: { until: '2026-10-29T09:00:00Z', gapMinutes: 10 } });
  jest.mocked(api.setHelped).mockReset().mockResolvedValue({ helped: true });
});

describe('Kind norms', () => {
  it('shows nothing while switched off', async () => {
    on({});
    await renderApp(
      <>
        <KindnessPromise />
        <ReplyNotes postId="p1" />
        <HelpedButton comment={comment()} />
      </>,
    );
    expect(screen.queryByTestId('kindness-promise')).toBeNull();
    expect(screen.queryByTestId('resting-note')).toBeNull();
    expect(screen.queryByText('This helped')).toBeNull();
    expect(api.kindnessPromise).not.toHaveBeenCalled();
    expect(api.replyBox).not.toHaveBeenCalled();
  });

  it('asks for the promise once, in the default words, and thanks the member', async () => {
    on({ kindnessPromise: true });
    await renderApp(<KindnessPromise />);
    expect(await screen.findByText('I’ll speak gently, pray sincerely, and protect others’ stories.')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('I promise')));
    expect(api.agreeKindnessPromise).toHaveBeenCalled();
    expect(screen.getByText(/That’s what makes this a kind place/)).toBeTruthy();
  });

  it('stays away once agreed', async () => {
    on({ kindnessPromise: true });
    jest.mocked(api.kindnessPromise).mockResolvedValue({ enabled: true, text: null, agreed: true });
    await renderApp(<KindnessPromise />);
    expect(screen.queryByTestId('kindness-promise')).toBeNull();
  });

  it('notes a resting thread and the first-replies reminder', async () => {
    on({ replyReminder: true, restingThreads: true });
    await renderApp(<ReplyNotes postId="p1" />);
    expect(await screen.findByText(/This conversation is resting for a moment\. Each person can reply once every 10 minutes/)).toBeTruthy();
    expect(screen.getByText(/A gentle reminder: speak kindly/)).toBeTruthy();
  });

  it('marks a comment that helped, and notes one many kinds of members found helpful', async () => {
    on({ thisHelped: true });
    await renderApp(<HelpedButton comment={comment({ widelyAppreciated: true })} />);
    await act(async () => fireEvent.press(await screen.findByText('This helped')));
    expect(api.setHelped).toHaveBeenCalledWith('c1', true);
    expect(screen.getByText('This helped ✓')).toBeTruthy();
    expect(screen.getByText('Helpful to many kinds of members')).toBeTruthy();
  });

  it('never offers "This helped" on your own comment', async () => {
    on({ thisHelped: true });
    await renderApp(<HelpedButton comment={comment({ isMine: true })} />);
    expect(screen.queryByText('This helped')).toBeNull();
  });

  it('offers the author a private sorry after a gentle note, and opens Mend', async () => {
    on({ offerSorry: true });
    jest.mocked(api.sorryOffer).mockResolvedValue({ available: true, mendId: null });
    jest.mocked(api.offerSorry).mockResolvedValue({ mendId: 'm1' });
    await renderApp(<OfferSorry commentId="c1" />);
    await act(async () => fireEvent.press(await screen.findByText('Offer a private sorry')));
    expect(api.offerSorry).toHaveBeenCalledWith('c1');
    expect(router.push).toHaveBeenCalledWith('/mend/m1');
  });

  it('shows nothing when no note came in', async () => {
    on({ offerSorry: true });
    jest.mocked(api.sorryOffer).mockResolvedValue({ available: false, mendId: null });
    await renderApp(<OfferSorry commentId="c1" />);
    expect(screen.queryByText('Offer a private sorry')).toBeNull();
  });
});

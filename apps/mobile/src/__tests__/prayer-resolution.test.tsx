// Prayer resolution: "Has this prayer been answered?" on the author's own request. Yes opens the
// two-answer survey; "Not yet" offers repost, reword and a free broadcast token.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { ResolutionCard } from '@/components/resolution-card';
import { api, type ResolutionStatus } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({
  api: { features: jest.fn(), resolution: jest.fn(), answerResolution: jest.fn(), repostResolution: jest.fn(), claimResolutionToken: jest.fn() },
}));

const on = (prayerResolution: boolean) =>
  jest.mocked(api.features).mockResolvedValue({ features: { prayerResolution } } as Awaited<ReturnType<typeof api.features>>);
const status = (s: Partial<ResolutionStatus>): ResolutionStatus => ({
  enabled: true, pending: true, answered: null, outcome: null, canRepost: false, freeTokens: 0, tokenClaimed: false, repostedPostId: null, ...s,
});

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.resolution).mockResolvedValue(status({}));
});

describe('Prayer resolution', () => {
  it('shows nothing while off, or to anyone but the author', async () => {
    on(false);
    await renderApp(<ResolutionCard postId="p1" isMine />);
    expect(screen.queryByTestId('resolution-card')).toBeNull();
    on(true);
    resetFeatures();
    await renderApp(<ResolutionCard postId="p1" isMine={false} />);
    expect(screen.queryByTestId('resolution-card')).toBeNull();
    expect(api.resolution).not.toHaveBeenCalled();
  });

  it('answered: the two-answer survey', async () => {
    on(true);
    jest.mocked(api.answerResolution).mockResolvedValue(status({ pending: false, answered: true, outcome: 'his_will' }));
    await renderApp(<ResolutionCard postId="p1" isMine />);
    expect(await screen.findByText('Has this prayer been answered?')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('resolution-yes')));
    expect(screen.getByText('The Lord answered my prayer in a way I had hoped')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('The Lord answered my prayer according to his will, not my will')));
    expect(api.answerResolution).toHaveBeenCalledWith('p1', { answered: true, outcome: 'his_will' });
    expect(screen.getByText('Thank you for letting us know. Everyone who prayed will hear the good news.')).toBeTruthy();
  });

  it('not yet: reword the prayer, and take the free broadcast token', async () => {
    on(true);
    jest.mocked(api.answerResolution).mockResolvedValue(status({ pending: false, answered: false, canRepost: true, freeTokens: 1 }));
    jest.mocked(api.repostResolution).mockResolvedValue({ post: { id: 'p9' } } as Awaited<ReturnType<typeof api.repostResolution>>);
    jest.mocked(api.claimResolutionToken).mockResolvedValue({ amount: 1, priestly: 3 });
    await renderApp(<ResolutionCard postId="p1" isMine />);
    await act(async () => fireEvent.press(await screen.findByTestId('resolution-not-yet')));
    expect(api.answerResolution).toHaveBeenCalledWith('p1', { answered: false });
    expect(screen.getByText("We'll check in again later. Would you like to repost your prayer, or reword it?")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('resolution-token')));
    expect(api.claimResolutionToken).toHaveBeenCalledWith('p1');
    await act(async () => fireEvent.press(screen.getByTestId('resolution-reword')));
    await act(async () => fireEvent.changeText(screen.getByLabelText('Your prayer request, in new words'), 'Please pray I find steady work.'));
    await act(async () => fireEvent.press(screen.getByTestId('resolution-reword-send')));
    expect(api.repostResolution).toHaveBeenCalledWith('p1', 'Please pray I find steady work.');
    expect(screen.getByText('Your prayer was posted again.')).toBeTruthy();
  });
});

// Sharing outside only with the author's consent: off keeps the old button; on, other
// members send only what the author allowed, and the author picks the level.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Share } from 'react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { OutsideShareButton, ShareChoice } from '@/components/outside-share';
import { api, type ShareState } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/links', () => ({ shareLink: (path: string) => `https://prayertower.example${path}` }));
jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), shareState: jest.fn(), setShareLevel: jest.fn() } }));

const on = (shareConsent: boolean) =>
  jest.mocked(api.features).mockResolvedValue({ features: { shareConsent } } as Awaited<ReturnType<typeof api.features>>);
const state = (s: Partial<ShareState>): ShareState => ({ mine: false, level: 'private', canShare: false, cardAllowed: true, words: false, path: '/post/p1', ...s });
let share: jest.SpyInstance;

beforeEach(() => {
  resetFeatures();
  share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
});

describe('the share button', () => {
  it('works as before while the switch is off', async () => {
    on(false);
    await renderApp(<OutsideShareButton card={sampleCard({ id: 'p1', preview: 'Pray for my mom' })} />);
    await act(async () => fireEvent.press(await screen.findByText('Share outside Prayer Tower')));
    expect(share.mock.calls[0]![0].message).toContain('Pray for my mom');
    expect(api.shareState).not.toHaveBeenCalled();
  });

  it("says the post stays inside when the author hasn't allowed sharing", async () => {
    on(true);
    jest.mocked(api.shareState).mockResolvedValue({ share: state({}) });
    await renderApp(<OutsideShareButton card={sampleCard({ id: 'p1' })} />);
    expect(await screen.findByText('The person who posted this keeps it inside the app.')).toBeTruthy();
    expect(screen.queryByText('Share outside Prayer Tower')).toBeNull();
  });

  it('sends only the link, never the words, when the author allowed a link', async () => {
    on(true);
    jest.mocked(api.shareState).mockResolvedValue({ share: state({ level: 'link', canShare: true }) });
    await renderApp(<OutsideShareButton card={sampleCard({ id: 'p1', preview: 'Pray for my mom' })} />);
    await act(async () => fireEvent.press(await screen.findByText('Share outside Prayer Tower')));
    const message = share.mock.calls[0]![0].message as string;
    expect(message).not.toContain('Pray for my mom');
    expect(message).toContain('/post/p1');
  });

  it('sends the words and the card link when the author allowed a card', async () => {
    on(true);
    jest.mocked(api.shareState).mockResolvedValue({ share: state({ level: 'card', canShare: true, words: true, path: '/card/abcdefghijklmnopqrstuv' }) });
    await renderApp(<OutsideShareButton card={sampleCard({ id: 'p1', preview: 'Pray for my mom' })} />);
    await act(async () => fireEvent.press(await screen.findByText('Share outside Prayer Tower')));
    const message = share.mock.calls[0]![0].message as string;
    expect(message).toContain('Pray for my mom');
    expect(message).toContain('/card/abcdefghijklmnopqrstuv');
  });
});

describe('the author choice', () => {
  it('shows nothing while off or on someone else’s post', async () => {
    on(true);
    await renderApp(<ShareChoice card={sampleCard({ id: 'p1', isMine: false })} />);
    expect(screen.queryByText('Who can share this outside the app?')).toBeNull();
    expect(api.shareState).not.toHaveBeenCalled();
  });

  it('lets the author choose a card, and hides the card for a crisis post', async () => {
    on(true);
    jest.mocked(api.shareState).mockResolvedValue({ share: state({ mine: true, canShare: true }) });
    jest.mocked(api.setShareLevel).mockResolvedValue({ share: state({ mine: true, canShare: true, level: 'card', words: true, path: '/card/x' }) });
    await renderApp(<ShareChoice card={sampleCard({ id: 'p1', isMine: true })} />);
    await act(async () => fireEvent.press(await screen.findByText('Anyone can share a card')));
    expect(api.setShareLevel).toHaveBeenCalledWith('p1', 'card');
    expect(await screen.findByText(/A card is a web page anyone can open/)).toBeTruthy();
  });

  it('offers no card for a crisis post', async () => {
    on(true);
    jest.mocked(api.shareState).mockResolvedValue({ share: state({ mine: true, canShare: true, cardAllowed: false }) });
    await renderApp(<ShareChoice card={sampleCard({ id: 'p1', isMine: true })} />);
    expect(await screen.findByText("A post that mentions crisis can't be shared as a card.")).toBeTruthy();
    expect(screen.queryByText('Anyone can share a card')).toBeNull();
  });
});

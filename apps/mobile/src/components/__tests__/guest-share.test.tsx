// Growth switches on the asker's own request: a guest prayer link and sending it to their prayer chain.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Share } from 'react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { GuestShare } from '@/components/guest-share';
import { api } from '@/lib/api';

jest.mock('@/lib/links', () => ({ shareLink: (path: string) => `https://example.test${path}` }));
jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(async () => ({ features: { guestPrayer: true, prayerChain: true } })),
    guestLink: jest.fn(),
    createGuestLink: jest.fn(),
    revokeGuestLink: jest.fn(async () => ({})),
    sendToPrayerChain: jest.fn(async () => ({ recipients: 4 })),
  },
}));

describe('GuestShare', () => {
  beforeEach(() => jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' }));

  it("shows nothing on someone else's request", async () => {
    await renderApp(<GuestShare card={sampleCard({ isMine: false })} />);
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.queryByRole('button', { name: 'Let friends without the app pray' })).toBeNull();
    expect(api.guestLink).not.toHaveBeenCalled();
  });

  it('makes a guest link and shares it', async () => {
    jest.mocked(api.guestLink).mockResolvedValue({ link: null } as never);
    jest.mocked(api.createGuestLink).mockResolvedValue({ link: { token: 't', path: '/pray/t', guestPrayers: 0 } } as never);
    const card = sampleCard({ isMine: true });
    await renderApp(<GuestShare card={card} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Let friends without the app pray' }));
    expect(api.createGuestLink).toHaveBeenCalledWith(card.id);
    expect(Share.share).toHaveBeenCalledWith({ message: expect.stringContaining('https://example.test/pray/t') });
    expect(await screen.findByRole('button', { name: 'Share the link again' })).toBeTruthy();
  });

  it('counts guest prayers, turns the link off and sends to the prayer chain', async () => {
    jest.mocked(api.guestLink).mockResolvedValue({ link: { token: 't', path: '/pray/t', guestPrayers: 3 } } as never);
    await renderApp(<GuestShare card={sampleCard({ isMine: true })} />);
    expect(await screen.findByText('3 people prayed from your link')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Send to my prayer chain' }));
    expect(await screen.findByText('Sent to 4 people on your prayer chain.')).toBeTruthy();
    jest.mocked(api.guestLink).mockResolvedValue({ link: null } as never);
    await fireEvent.press(screen.getByRole('button', { name: 'Turn off the link' }));
    expect(await screen.findByText('The link no longer works.')).toBeTruthy();
  });
});

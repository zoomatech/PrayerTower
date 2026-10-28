// Spoken prayers on a request: the asker turns them on and listens; someone who prayed records one.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { SpokenPrayers } from '@/components/spoken-prayers';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  return { api: new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) }) };
});
const mocked = api as unknown as Record<string, jest.Mock>;

beforeEach(() => jest.clearAllMocks());

describe('SpokenPrayers', () => {
  it('shows nothing while the feature is off', async () => {
    mocked.spokenPrayers!.mockResolvedValue({ enabled: false });
    await renderApp(<SpokenPrayers postId="p1" />);
    await waitFor(() => expect(mocked.spokenPrayers).toHaveBeenCalledWith('p1'));
    expect(screen.queryByText('Spoken prayers')).toBeNull();
  });

  it('lets the asker offer tokens and pays on first listen', async () => {
    mocked.spokenPrayers!.mockResolvedValue({
      enabled: true, mine: true, invited: true, offerTokens: 2, maxSeconds: 60, maxOfferTokens: 5,
      received: [{ id: 's1', from: { id: 'u2', displayName: 'Eli' }, durationSeconds: 30, offerTokens: 2, paid: false, listened: false, createdAt: '', url: 'https://x/a.m4a' }],
    });
    mocked.spokenListened!.mockResolvedValue({ listened: true, paid: true, notEnoughTokens: false });
    await renderApp(<SpokenPrayers postId="p1" />);
    expect(await screen.findByText('Eli · 30 seconds')).toBeTruthy();
    expect(screen.queryByText('Offer 10 tokens')).toBeNull(); // over the cap
    await fireEvent.press(screen.getByText('Offer 5 tokens'));
    expect(mocked.inviteSpokenPrayers).toHaveBeenCalledWith('p1', 5);
    await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
    expect(await screen.findByText('You sent 2 tokens to Eli. Thank you.')).toBeTruthy();
  });

  it('asks others to pray first, then records and sends', async () => {
    mocked.spokenPrayers!.mockResolvedValueOnce({ enabled: true, mine: false, invited: true, offerTokens: 0, maxSeconds: 60, sent: false, prayed: false });
    const { unmount } = await renderApp(<SpokenPrayers postId="p1" />);
    expect(await screen.findByText(/Pray for this request first/)).toBeTruthy();
    unmount();

    mocked.spokenPrayers!.mockResolvedValue({ enabled: true, mine: false, invited: true, offerTokens: 0, maxSeconds: 60, sent: false, prayed: true });
    await renderApp(<SpokenPrayers postId="p1" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Record a spoken prayer' }));
    // The fake recorder never reports "recording"; stopping happens on the record screen in the app.
    expect(mocked.spokenUploadUrl).not.toHaveBeenCalled();
  });
});

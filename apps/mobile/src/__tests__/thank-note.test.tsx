// Thank the pray-ers: the asker writes one note with a starter's help; a pray-er reads it
// and answers "Glad to"; only the asker sees how many did.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { ThankNoteCard } from '@/components/thank-note';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});

const mocked = api as unknown as Record<string, jest.Mock>;
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

beforeEach(() => {
  resetFeatures();
  mocked.features!.mockResolvedValue({ features: { thankNote: true } });
  mocked.precheck!.mockResolvedValue({ warn: false });
});
afterEach(() => act(() => setWording('faith')));

describe('Thank the pray-ers', () => {
  it('stays hidden while off', async () => {
    mocked.features!.mockResolvedValue({ features: {} });
    await renderApp(<ThankNoteCard postId="p1" asker="Ana" />);
    await settle();
    expect(screen.queryByTestId('thank-note')).toBeNull();
  });

  it('lets the asker write one note from a starter and send it', async () => {
    mocked.thankNote!.mockResolvedValue({ enabled: true, note: null, canWrite: true });
    mocked.sendThankNote!.mockResolvedValue({ sent: 4 });
    await renderApp(<ThankNoteCard postId="p1" asker="Ana" />);
    await settle();
    await act(async () => fireEvent.press(screen.getByText('Write a thank-you')));
    await act(async () => fireEvent.press(screen.getByText('Thank you for carrying this with me.')));
    await act(async () => fireEvent.press(screen.getByText('Send to everyone who prayed')));
    expect(api.sendThankNote).toHaveBeenCalledWith('p1', 'Thank you for carrying this with me.');
    expect(screen.getByText('Your thank-you')).toBeTruthy();
  });

  it('lets a pray-er answer "Glad to"', async () => {
    mocked.thankNote!.mockResolvedValue({ enabled: true, note: { body: 'Thank you all.', createdAt: '2026-10-29T00:00:00Z', gladByMe: false }, canWrite: false });
    await renderApp(<ThankNoteCard postId="p1" asker="Ana" />);
    await settle();
    expect(screen.getByText('A thank-you from Ana')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText('❤️ Glad to')));
    expect(api.gladThankNote).toHaveBeenCalledWith('p1');
    expect(screen.getByText(/You said you were glad to/)).toBeTruthy();
  });

  it('uses Open Circle wording there', async () => {
    await act(() => setWording('neutral'));
    mocked.thankNote!.mockResolvedValue({ enabled: true, note: null, canWrite: true });
    await renderApp(<ThankNoteCard postId="p1" asker="Ana" />);
    await settle();
    expect(screen.getByText('Thank everyone who supported you')).toBeTruthy();
  });
});

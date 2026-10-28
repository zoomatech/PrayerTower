// Notebook extras on the feed card, with their switches on: long-press quick reactions and the author's town.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { PostCard } from '@/components/post-card';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(async () => ({ features: { reactionTray: true, memberTown: true } })),
    quickReact: jest.fn(async () => ({ candles: 1, standing: 0, mine: ['candle'] })),
  },
}));

describe('Quick reactions and towns', () => {
  it('opens the tray on a long press, lights a candle and shows the new count', async () => {
    const card = sampleCard();
    await renderApp(<PostCard card={card} onAction={jest.fn()} />);
    await fireEvent(await screen.findByText(card.body), 'longPress');
    await fireEvent.press(await screen.findByRole('button', { name: 'Light a candle, 0' }));
    expect(api.quickReact).toHaveBeenCalledWith(card.id, 'candle', true);
    await waitFor(() => expect(screen.getByText(/🕯️ 1/)).toBeTruthy());
    await fireEvent.press(screen.getByRole('button', { name: 'Close quick reactions' }));
    expect(screen.queryByRole('button', { name: /Light a candle/ })).toBeNull();
  });

  it('names the author’s town when the server sends one', async () => {
    const base = sampleCard();
    await renderApp(<PostCard card={{ ...base, author: { ...base.author, town: 'Albuquerque' } }} onAction={jest.fn()} />);
    expect(await screen.findByText(/in Albuquerque/)).toBeTruthy();
  });
});

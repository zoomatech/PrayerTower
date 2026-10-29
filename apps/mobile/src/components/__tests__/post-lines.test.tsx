// Post anatomy lines (Mockups 1 and 2), with the switch on: the post type sits above a line
// from the poster's name, and a line runs down the left of the post. Off by default.
import { screen } from '@testing-library/react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { PostCard } from '@/components/post-card';
import { api } from '@/lib/api';
import { resetFeatures } from '@/lib/features';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn() } }));

describe('Post anatomy lines', () => {
  beforeEach(() => resetFeatures());

  it('draws the lines when an admin turns them on', async () => {
    jest.mocked(api.features).mockResolvedValue({ features: { postLines: true } } as Awaited<ReturnType<typeof api.features>>);
    const card = sampleCard();
    await renderApp(<PostCard card={card} onAction={jest.fn()} />);
    expect(await screen.findByTestId('post-lines')).toBeTruthy();
    expect(screen.getByText(card.body)).toBeTruthy();
    expect(screen.getByText('Prayer Request')).toBeTruthy();
  });

  it('leaves the card as it was while the switch is off', async () => {
    jest.mocked(api.features).mockResolvedValue({ features: {} } as Awaited<ReturnType<typeof api.features>>);
    await renderApp(<PostCard card={sampleCard()} onAction={jest.fn()} />);
    expect(await screen.findByText('Prayer Request')).toBeTruthy();
    expect(screen.queryByTestId('post-lines')).toBeNull();
  });
});

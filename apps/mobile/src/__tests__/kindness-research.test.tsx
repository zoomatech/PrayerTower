// The members' kindness research page: anonymous totals as simple bar charts, with
// emoji meanings in words and the folded "other" line.
import { screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import KindnessResearch from '@/app/kindness-research';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), kindnessResearch: jest.fn(), reactionMeanings: jest.fn() } }));

beforeEach(() => {
  jest.mocked(api.features).mockResolvedValue({ features: {} } as unknown as Awaited<ReturnType<typeof api.features>>);
  jest.mocked(api.reactionMeanings).mockResolvedValue({ emoji: [{ key: 'praying', emoji: '🙏', meanings: [{ key: 'praying_for_you', label: 'Praying for you', neutralLabel: 'Thinking of you' }] }] });
});

describe('Kindness research page', () => {
  it('shows each pattern as a bar with its count, and folds the rest', async () => {
    jest.mocked(api.kindnessResearch).mockResolvedValue({
      counts: {
        weeks: 12,
        minShown: 5,
        chains: [{ moves: ['greeting', 'greeting', 'howAreYou'], n: 9 }],
        otherChains: 3,
        emoji: [{ emoji: 'praying', meaning: 'praying_for_you', toMove: 'trouble', n: 6 }],
        otherEmoji: 0,
      },
    });
    await renderApp(<KindnessResearch />);
    expect(await screen.findByTestId('research-chains')).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy();
    expect(screen.getByText(/fewer than 5 each\): 3/)).toBeTruthy();
    expect(await screen.findByText(/🙏 Praying for you in reply to/)).toBeTruthy();
  });

  it('says so when there is nothing yet', async () => {
    jest.mocked(api.kindnessResearch).mockResolvedValue({ counts: { weeks: 12, minShown: 5, chains: [], otherChains: 0, emoji: [], otherEmoji: 0 } });
    await renderApp(<KindnessResearch />);
    expect(await screen.findByText('Nothing to show yet.')).toBeTruthy();
  });
});

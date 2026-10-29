// Emoji meanings: a tap adds the first meaning as a leaf, press-and-hold offers up to
// five, Open Circle sees neutral words, and nothing shows while the switch is off.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { MeaningReactions } from '@/components/meaning-reactions';
import { api, type MeaningEmoji, type MeaningLeaf } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), reactionMeanings: jest.fn(), meanings: jest.fn(), chooseMeaning: jest.fn(), removeMeaning: jest.fn() } }));

const tree: MeaningEmoji[] = [
  { key: 'praying', emoji: '🙏', meanings: [{ key: 'praying_for_you', label: 'Praying for you', neutralLabel: 'Thinking of you' }] },
  {
    key: 'strength',
    emoji: '💪',
    meanings: [
      { key: 'feel_better', label: 'Feel better', neutralLabel: 'Feel better' },
      { key: 'healing', label: 'Praying for healing', neutralLabel: 'Get well soon' },
    ],
  },
];
const leaf = (meaning: string, label: string, neutralLabel: string, mine = true): MeaningLeaf => ({ emoji: 'strength', icon: '💪', meaning, label, neutralLabel, count: 1, mine });
const on = (meaningReactions: boolean) => jest.mocked(api.features).mockResolvedValue({ features: { meaningReactions } } as Awaited<ReturnType<typeof api.features>>);

beforeEach(() => {
  resetFeatures();
  jest.mocked(api.reactionMeanings).mockResolvedValue({ emoji: tree });
  jest.mocked(api.meanings).mockResolvedValue({ leaves: [] });
  jest.mocked(api.chooseMeaning).mockReset();
});
afterEach(() => act(() => setWording('faith')));

describe('Emoji meanings', () => {
  it('a tap adds the first meaning as a leaf', async () => {
    on(true);
    jest.mocked(api.chooseMeaning).mockResolvedValue({ leaves: [leaf('feel_better', 'Feel better', 'Feel better')] });
    await renderApp(<MeaningReactions postId="p1" />);
    await act(async () => fireEvent.press(await screen.findByTestId('meaning-strength')));
    expect(api.chooseMeaning).toHaveBeenCalledWith('p1', 'strength', 'feel_better');
    expect(screen.getByText('Feel better')).toBeTruthy();
  });

  it('press and hold opens the meanings to choose from', async () => {
    on(true);
    jest.mocked(api.chooseMeaning).mockResolvedValue({ leaves: [leaf('healing', 'Praying for healing', 'Get well soon')] });
    await renderApp(<MeaningReactions postId="p1" />);
    const strength = await screen.findByTestId('meaning-strength');
    await act(async () => fireEvent(strength, 'longPress'));
    await act(async () => fireEvent.press(await screen.findByTestId('meaning-strength-healing')));
    expect(api.chooseMeaning).toHaveBeenCalledWith('p1', 'strength', 'healing');
    expect(screen.getByText('Praying for healing')).toBeTruthy();
  });

  it('shows neutral words in Open Circle', async () => {
    on(true);
    await act(() => setWording('neutral'));
    jest.mocked(api.meanings).mockResolvedValue({ leaves: [leaf('healing', 'Praying for healing', 'Get well soon', false)] });
    await renderApp(<MeaningReactions postId="p1" />);
    expect(await screen.findByText('Get well soon')).toBeTruthy();
    expect(screen.queryByText('Praying for healing')).toBeNull();
  });

  it('keeps to one row of icons: with meanings on the action icons, only the added words show here', async () => {
    jest.mocked(api.features).mockResolvedValue({ features: { meaningReactions: true, meaningIconRow: true } } as Awaited<ReturnType<typeof api.features>>);
    jest.mocked(api.meanings).mockResolvedValue({ leaves: [leaf('feel_better', 'Feel better', 'Feel better', false)] });
    await renderApp(<MeaningReactions postId="p1" />);
    expect(await screen.findByText('Feel better')).toBeTruthy();
    expect(screen.queryByTestId('meaning-strength')).toBeNull();
    expect(screen.queryByLabelText('Say it with an emoji')).toBeNull();
  });

  it('shows nothing while off', async () => {
    on(false);
    await renderApp(<MeaningReactions postId="p1" />);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(api.reactionMeanings).not.toHaveBeenCalled();
    expect(screen.queryByTestId('meaning-strength')).toBeNull();
  });
});

// Emoji meanings in the card's single icon row: off unless both switches are on, a tap
// adds the first meaning, press and hold offers up to five, and hovering shows words.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp } from '@/__tests__/helpers';
import { MeaningIcons, resetMeaningTree } from '@/components/meaning-icon-row';
import { api, type MeaningEmoji } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => ({ api: { features: jest.fn(), reactionMeanings: jest.fn(), chooseMeaning: jest.fn(), conversationPrefs: jest.fn(), talkCount: jest.fn() } }));

const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({ key: k, label: `Meaning ${k}`, neutralLabel: `Plain ${k}` }));
const tree: MeaningEmoji[] = [
  { key: 'praying', emoji: '🙏', meanings: [{ key: 'praying_for_you', label: 'Praying for you', neutralLabel: 'Thinking of you' }] },
  { key: 'strength', emoji: '💪', meanings: six },
];
const on = (meaningReactions: boolean, meaningIconRow: boolean) =>
  jest.mocked(api.features).mockResolvedValue({ features: { meaningReactions, meaningIconRow } } as unknown as Awaited<ReturnType<typeof api.features>>);

beforeEach(() => {
  resetFeatures();
  resetMeaningTree();
  jest.mocked(api.reactionMeanings).mockReset().mockResolvedValue({ emoji: tree });
  jest.mocked(api.chooseMeaning).mockReset().mockResolvedValue({ leaves: [] });
});
afterEach(() => act(() => setWording('faith')));

describe('Meanings in the icon row', () => {
  it('shows nothing unless both switches are on', async () => {
    on(true, false);
    await renderApp(<MeaningIcons postId="p1" />);
    expect(screen.queryByTestId('row-meaning-p1-praying')).toBeNull();
    expect(api.reactionMeanings).not.toHaveBeenCalled();
  });

  it('a tap adds the first meaning', async () => {
    on(true, true);
    await renderApp(<MeaningIcons postId="p1" />);
    const icon = await screen.findByTestId('row-meaning-p1-praying');
    await act(async () => fireEvent.press(icon));
    expect(api.chooseMeaning).toHaveBeenCalledWith('p1', 'praying', 'praying_for_you');
    expect(screen.getByTestId('row-meaning-p1-praying').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('press and hold offers at most five meanings', async () => {
    on(true, true);
    await renderApp(<MeaningIcons postId="p1" />);
    const icon = await screen.findByTestId('row-meaning-p1-strength');
    await act(async () => fireEvent(icon, 'longPress'));
    expect(screen.getByTestId('row-meaning-p1-strength-e')).toBeTruthy();
    expect(screen.queryByTestId('row-meaning-p1-strength-f')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('row-meaning-p1-strength-c')));
    expect(api.chooseMeaning).toHaveBeenCalledWith('p1', 'strength', 'c');
  });

  it('hovering shows the words, in Open Circle wording there', async () => {
    on(true, true);
    await act(() => setWording('neutral'));
    await renderApp(<MeaningIcons postId="p1" />);
    const icon = await screen.findByTestId('row-meaning-p1-praying');
    await act(async () => fireEvent(icon, 'hoverIn'));
    expect(screen.getByText('Thinking of you')).toBeTruthy();
    await act(async () => fireEvent(icon, 'hoverOut'));
    expect(screen.queryByText('Thinking of you')).toBeNull();
  });
});

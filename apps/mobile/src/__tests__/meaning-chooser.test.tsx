// Emoji meanings on the card's one row of action icons: the row keeps its icons (no
// extra ones), an action with a matching emoji shows its meanings on hover, a long press
// opens up to five to choose from, and a tap still does the action.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { resetMeaningTree } from '@/components/meaning-chooser';
import { PostCard } from '@/components/post-card';
import { api, type MeaningEmoji } from '@/lib/api';
import { resetFeatures } from '@/lib/features';
import { setWording } from '@/lib/i18n';

jest.mock('@/lib/api', () => {
  const fns: Record<string, jest.Mock> = {};
  const api = new Proxy(fns, { get: (target, key: string) => (target[key] ??= jest.fn(async () => ({}))) });
  return { api };
});
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'me' }, roles: [], refreshProfile: jest.fn(), signOut: jest.fn() }) }));

const mocked = api as unknown as Record<string, jest.Mock>;
const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => ({ key: k, label: `Meaning ${k}`, neutralLabel: `Plain ${k}` }));
const tree: MeaningEmoji[] = [
  { key: 'praying', emoji: '🙏', meanings: six },
  { key: 'love', emoji: '❤️', meanings: [{ key: 'love_you', label: 'Love you', neutralLabel: 'Love you' }] },
];
const on = (meaningIconRow: boolean) => mocked.features!.mockResolvedValue({ features: { meaningReactions: true, meaningIconRow } });
const card = sampleCard({ id: 'p1' });
// The action buttons by their spoken names.
const button = (name: string) => screen.getAllByRole('button').find((b) => b.props.accessibilityLabel === name)!;
// Switches and the meaning tree load after the first render.
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

beforeEach(() => {
  resetFeatures();
  resetMeaningTree();
  mocked.reactionMeanings!.mockReset().mockResolvedValue({ emoji: tree });
  mocked.chooseMeaning!.mockReset().mockResolvedValue({ leaves: [] });
});
afterEach(() => act(() => setWording('faith')));

describe('Meanings on the action row', () => {
  it('does nothing while off', async () => {
    on(false);
    await renderApp(<PostCard card={card} onAction={jest.fn()} />);
    await settle();
    await act(async () => fireEvent(button('Praying Now'), 'longPress'));
    expect(screen.queryByTestId('row-meaning-p1-praying-a')).toBeNull();
    expect(mocked.reactionMeanings).not.toHaveBeenCalled();
  });

  it('adds no icons to the row', async () => {
    on(true);
    await renderApp(<PostCard card={card} onAction={jest.fn()} />);
    await settle();
    expect(mocked.reactionMeanings).toHaveBeenCalled();
    expect(screen.getAllByRole('button').map((b) => b.props.accessibilityLabel)).toEqual(['Praying Now', 'Commit to Pray', 'Encourage', 'Well Wishes', 'Share', 'Gift Tokens']);
  });

  it('long press opens up to five meanings; a tap still does the action', async () => {
    on(true);
    const onAction = jest.fn();
    await renderApp(<PostCard card={card} onAction={onAction} />);
    await settle();
    const pray = button('Praying Now');
    await act(async () => fireEvent.press(pray));
    expect(onAction).toHaveBeenCalledWith(card, 'praying_now');
    await act(async () => fireEvent(pray, 'longPress'));
    expect(await screen.findByTestId('row-meaning-p1-praying-e')).toBeTruthy();
    expect(screen.queryByTestId('row-meaning-p1-praying-f')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('row-meaning-p1-praying-c')));
    expect(mocked.chooseMeaning).toHaveBeenCalledWith('p1', 'praying', 'c');
  });

  it('hover shows the meanings, in Open Circle wording there', async () => {
    on(true);
    await act(() => setWording('neutral'));
    await renderApp(<PostCard card={card} onAction={jest.fn()} />);
    await settle();
    const love = button('Well Wishes');
    await act(async () => fireEvent(love, 'hoverIn'));
    expect(screen.getByText(/❤️ Love you/)).toBeTruthy();
  });
});

// The Ceramic Figurine skin (Steve, 2026-10-31): plaques that grow, placards that flop down,
// the first reply hanging exposed, no Reply on replies, and the member's own figurines.
import { contrastRatio } from '@prayer-tower/shared';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { api } from '@/lib/api';
import { CeramicLayout, lookAt } from '@/layouts/ceramic';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(async () => ({ features: {} })),
    comments: jest.fn(async () => ({ comments: [] })),
  },
}));

const comment = (id: string, body: string, name: string, parentId: string | null = null, minute = 0) => ({
  id,
  parentId,
  body,
  isUpdate: false,
  createdAt: `2026-10-31T10:${String(minute).padStart(2, '0')}:00Z`,
  author: { displayName: name },
});

const feed = (cards = [sampleCard()]) => (
  <CeramicLayout
    cards={cards}
    theme={null}
    pinnedId={null}
    renderCard={(c) => <Text>{`plaque ${c.body}`}</Text>}
    refreshing={false}
    onRefresh={() => undefined}
    onEndReached={() => undefined}
    atEnd
  />
);

describe('Ceramic Figurine', () => {
  it('mixes all five figurines through the feed, or uses the one the member picks', () => {
    expect(new Set([0, 1, 2, 3, 4].map((n) => lookAt('mix', n))).size).toBe(5);
    expect(lookAt('shepherd', 3)).toBe('shepherd');
  });

  it('keeps every word readable on the pastel ceramic (4.5:1)', () => {
    for (const bg of ['#F7F1EE', '#E6DEF0', '#DCE6EF', '#F3DDD7', '#DDEADF', '#F2EBD2', '#EDE3E6']) {
      expect(contrastRatio('#4B3F47', bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio('#64555E', bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('hangs the comments as a closed stack, flops them down on a tap, and folds them on another', async () => {
    const comments = [
      comment('c1', 'Praying for steady hands for his surgeon.', 'Evelyn', null, 5),
      comment('c2', 'Thank you, Evelyn.', 'Margaret', 'c1', 6),
      comment('c3', 'He was reading the paper in a week.', 'Evelyn', 'c2', 7),
      comment('c4', 'Lifting you both up tonight.', 'Dorothy', null, 1),
    ];
    (api.comments as jest.Mock).mockResolvedValue({ comments });
    const card = sampleCard({ counts: { ...sampleCard().counts, comments: 2 } });
    await renderApp(feed([card]));
    // Closed: only the first comment's first line reads, with how many more are behind it.
    const stack = await screen.findByTestId(`ceramic-open-${card.id}`);
    expect(within(stack).getByText('+1')).toBeTruthy();
    await fireEvent.press(stack);
    expect(await screen.findByTestId('ceramic-comment-c1')).toBeTruthy();
    expect(screen.getByTestId('ceramic-comment-c4')).toBeTruthy();
    // The first reply hangs exposed under its comment, with how many more there are.
    const firstReply = screen.getByTestId('ceramic-first-reply-c1');
    expect(within(firstReply).getByText('+1')).toBeTruthy();
    await fireEvent.press(firstReply);
    // Every reply, however deep, flops down; none has a Reply button.
    expect(within(screen.getByTestId('ceramic-reply-c2')).queryByText('Reply')).toBeNull();
    expect(within(screen.getByTestId('ceramic-reply-c3')).queryByText('Reply')).toBeNull();
    expect(screen.getAllByText('Reply').length).toBe(2);
    // Tapping a reply folds the replies back up; tapping a comment folds the comments.
    await fireEvent.press(screen.getByText('Thank you, Evelyn.'));
    expect(screen.queryByTestId('ceramic-reply-c2')).toBeNull();
    await fireEvent.press(screen.getByText('Lifting you both up tonight.'));
    expect(screen.queryByTestId('ceramic-comment-c1')).toBeNull();
    expect(screen.getByTestId(`ceramic-open-${card.id}`)).toBeTruthy();
  });

  it('lets the member choose their figurines', async () => {
    await renderApp(feed());
    await fireEvent.press(screen.getByTestId('ceramic-figurines'));
    expect(screen.getByTestId('ceramic-picker')).toBeTruthy();
    const shepherd = screen.getByTestId('ceramic-pick-shepherd');
    await fireEvent.press(shepherd);
    expect(shepherd).toHaveProp('aria-pressed', true);
  });
});

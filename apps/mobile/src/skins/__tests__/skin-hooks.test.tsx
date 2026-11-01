// The shared skin hooks: a skin that draws its buttons any way it likes still gets the
// same buttons doing the same things, and comment clusters open and close the same way.
import type { Card } from '@prayer-tower/shared';
import { act, fireEvent, renderHook, screen } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { api } from '@/lib/api';
import { useActionRow } from '@/skins/action-row';
import { clusterSlice, commentTree, repliesAt, useCommentCluster } from '@/skins/comments';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(async () => ({ features: {} })),
    quickReact: jest.fn(async () => ({ thumbsUp: 1, mine: ['thumbs_up'] })),
  },
}));

/** A made-up skin: its buttons are plain words, nothing like the usual round icons. */
function WordSkin({ card, act }: { card: Card; act: (card: Card, action: string) => void }) {
  const row = useActionRow(card, act);
  return (
    <View>
      {row.buttons.map((b) => (
        <Pressable key={b.action} onPress={b.press} accessibilityRole="button" accessibilityLabel={b.name} accessibilityState={{ selected: b.active }}>
          <Text>{b.name}</Text>
        </Pressable>
      ))}
      <Text>{`likes ${row.thumbsUp}`}</Text>
    </View>
  );
}

describe('skin hooks', () => {
  it('give any skin the same buttons, doing the same things', async () => {
    const act = jest.fn();
    const card = sampleCard({ actions: ['thumbs_up', 'praying_now', 'commit', 'share', 'gift_tokens'] });
    await renderApp(<WordSkin card={card} act={act} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Praying Now' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Commit to Pray' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    expect(act.mock.calls.map((c) => c[1])).toEqual(['praying_now', 'commit', 'share']);
    expect(act.mock.calls.every((c) => c[0] === card)).toBe(true);
  });

  it('toggle a like at once, in any skin', async () => {
    const act = jest.fn();
    await renderApp(<WordSkin card={sampleCard({ actions: ['thumbs_up', 'praying_now'] })} act={act} />);
    await fireEvent.press(await screen.findByRole('button', { name: /thumbs up|like/i }));
    expect(api.quickReact).toHaveBeenCalledWith(expect.any(String), 'thumbs_up', true);
    expect(await screen.findByText('likes 1')).toBeTruthy();
    expect(act).not.toHaveBeenCalled();
  });

  it('open and close a comment cluster', async () => {
    const { result } = await renderHook(() => useCommentCluster());
    expect(result.current.state.spread).toBe(false);
    await act(() => result.current.toggle());
    expect(result.current.state.spread).toBe(true);
    await act(() => result.current.toggleReplies(1, 2));
    expect(result.current.state.open).toBe(2);
    await act(() => result.current.toggleReplies(2, 0));
    expect(result.current.state.open2).toBe(0);
    // Opening another comment's replies closes the reply that was open.
    await act(() => result.current.toggleReplies(1, 3));
    expect(result.current.state).toMatchObject({ open: 3, open2: null });
    await act(() => result.current.showPage(1));
    expect(result.current.state).toMatchObject({ spread: true, page: 1, open: null });
    expect(result.current.cycle).toBe(1);
    await act(() => result.current.toggle());
    expect(result.current.state.spread).toBe(false);
  });

  it('show one comment closed and five open', () => {
    const list = [1, 2, 3, 4, 5, 6, 7];
    expect(clusterSlice(list, false, 5, 4)).toEqual({ shown: [1], behind: 4, more: 0 });
    expect(clusterSlice(list, true, 5, 4)).toEqual({ shown: [1, 2, 3, 4, 5], behind: 0, more: 2 });
  });
});

describe('repliesAt', () => {
  const c = (id: string, parentId?: string) => ({ id, parentId, body: id, createdAt: '2026-10-31T00:00:00Z', author: { displayName: id } }) as never;
  it('shows every reply however deep, side by side at the last level', () => {
    const { kids } = commentTree([c('a'), c('b', 'a'), c('c', 'b'), c('d', 'c'), c('e', 'd')]);
    expect(repliesAt(kids, 'a', 1, 2).map((r) => r.id)).toEqual(['b']);
    expect(repliesAt(kids, 'b', 2, 2).map((r) => r.id)).toEqual(['c', 'd', 'e']);
  });
});

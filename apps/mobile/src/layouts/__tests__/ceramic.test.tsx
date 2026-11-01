// The Ceramic Figurines skin (Steve, 2026-10-31): angels hauling plaques on pulleys, ceramic placards for comments.
import { contrastRatio } from '@prayer-tower/shared';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { CardNameFont } from '@/components/post-card';
import { api } from '@/lib/api';
import { angelSide, CeramicLayout, ceramicTokens, initials, LOOKS, lookFor, MUTED, NAME_FONT, PLAQUE_TINTS, pointerAt, ropeGeometry, TOP } from '@/layouts/ceramic';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(async () => ({ features: {} })),
    comments: jest.fn(async () => ({ comments: [] })),
  },
}));

const layout = async () =>
  fireEvent(await screen.findByTestId('ceramic-layout'), 'layout', { nativeEvent: { layout: { width: 390, height: 844 } } });

const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('Ceramic Figurines drawing', () => {
  it('mixes all five figurine styles by turns, or keeps the one a member picked', () => {
    const seen = new Set([0, 1, 2, 3, 4].map((i) => lookFor('mix', i, 0)));
    expect(seen.size).toBe(LOOKS.length);
    expect(lookFor('mix', 0, 0)).not.toBe(lookFor('mix', 0, 1));
    expect(lookFor('choir', 7, 1)).toBe('choir');
  });

  it('puts a still pointing statue at every third post, and the hauling angel on alternate sides', () => {
    expect([0, 1, 2, 3, 4, 5].filter((i) => pointerAt(i))).toEqual([1, 4]);
    expect([0, 1, 2].map(angelSide)).toEqual(['left', 'right', 'left']);
  });

  it('runs the hauling rope from the pulley to the angel’s hands, and the bridle down to both side ropes', () => {
    for (const w of [320, 390, 560]) {
      for (const side of ['left', 'right'] as const) {
        const g = ropeGeometry(side, w);
        const haul = nums(g.haul);
        // It leaves the pulley's rim on the angel's side and ends at the angel's hands.
        expect(Math.abs(haul[0]! - w / 2)).toBeCloseTo(13, 0);
        expect(Math.sign(haul[0]! - w / 2)).toBe(side === 'left' ? -1 : 1);
        expect(haul[2]).toBeCloseTo(g.handX, 0);
        expect(g.handX).toBeGreaterThan(0);
        expect(g.handX).toBeLessThan(w);
        // The load rope comes down the other side of the wheel to the ring.
        expect(Math.sign(g.loadX - w / 2)).toBe(side === 'left' ? 1 : -1);
        const bridle = nums(g.bridle);
        expect(bridle).toContain(g.ropeL);
        expect(bridle).toContain(g.ropeR);
        expect(Math.max(...bridle.filter((_, i) => i % 2 === 1))).toBe(TOP);
      }
    }
  });

  it('keeps every word readable on the pastel ceramic (4.5:1)', () => {
    const t = ceramicTokens(null);
    for (const bg of [...PLAQUE_TINTS, t.placard, t.reply, t.frame]) {
      expect(contrastRatio(t.ink, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(MUTED, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('shows initials in the oval until a member adds a photo', () => {
    expect(initials('Margaret Hale')).toBe('MH');
    expect(initials('June')).toBe('J');
  });
});

describe('Ceramic Figurines comments', () => {
  it('stacks the placards with the first comment showing, flops them down on a tap, and folds them on a tap', async () => {
    const comments = [
      { id: 'c1', parentId: null, body: 'Praying for steady hands tonight.', isUpdate: false, createdAt: '2026-10-31T10:00:00Z', author: { displayName: 'Evelyn R' } },
      { id: 'c2', parentId: 'c1', body: 'Thank you, Evelyn.', isUpdate: false, createdAt: '2026-10-31T10:05:00Z', author: { displayName: 'Margaret H' } },
      { id: 'c3', parentId: 'c1', body: 'He is in good hands.', isUpdate: false, createdAt: '2026-10-31T10:06:00Z', author: { displayName: 'Ruth A' } },
      { id: 'c4', parentId: null, body: 'Lifting you both up.', isUpdate: false, createdAt: '2026-10-31T09:00:00Z', author: { displayName: 'Dorothy L' } },
    ];
    (api.comments as jest.Mock).mockResolvedValue({ comments });
    const card = sampleCard({ counts: { ...sampleCard().counts, comments: 2 } });
    await renderApp(
      <CeramicLayout
        cards={[card]}
        theme={null}
        pinnedId={null}
        renderCard={(c) => <Text>{`card ${c.id}`}</Text>}
        refreshing={false}
        onRefresh={() => undefined}
        onEndReached={() => undefined}
        atEnd
      />,
    );
    await layout();
    // Closed: one placard with the newest comment's first line, the rest stacked behind it.
    const stack = await screen.findByTestId(`ceramic-stack-${card.id}`);
    expect(within(stack).getByText(/Praying for steady hands tonight\./)).toBeTruthy();
    expect(within(stack).getByText('+1')).toBeTruthy();
    expect(screen.queryByText('Lifting you both up.')).toBeNull();

    await fireEvent.press(stack);
    expect(await screen.findByTestId('ceramic-comment-c1')).toBeTruthy();
    expect(screen.getByText('Lifting you both up.')).toBeTruthy();
    // The first reply hangs under the comment that has replies.
    const first = screen.getByTestId('ceramic-first-c1');
    expect(within(first).getByText(/Thank you, Evelyn\./)).toBeTruthy();
    expect(within(first).getByText('+1')).toBeTruthy();

    await fireEvent.press(first);
    const reply = await screen.findByTestId('ceramic-reply-c3');
    expect(within(reply).getByText('He is in good hands.')).toBeTruthy();
    // Replies never get a Reply button; each top-level comment does.
    expect(within(reply).queryByText('Reply')).toBeNull();
    expect(screen.getAllByText('Reply').length).toBe(2);

    // A tap on a reply folds the replies back to the first one.
    await fireEvent.press(within(reply).getByLabelText(/Folds the replies back up/));
    expect(await screen.findByTestId('ceramic-first-c1')).toBeTruthy();

    // A tap on a comment folds the placards back into the stack.
    await fireEvent.press(screen.getAllByLabelText(/Folds the comments back up/)[0]!);
    expect(await screen.findByTestId(`ceramic-stack-${card.id}`)).toBeTruthy();
  });

  it('lets a member pick their own figurines', async () => {
    await renderApp(
      <CeramicLayout cards={[sampleCard()]} theme={null} pinnedId={null} renderCard={() => <Text>card</Text>} refreshing={false} onRefresh={() => undefined} onEndReached={() => undefined} atEnd />,
    );
    await layout();
    await fireEvent.press(await screen.findByTestId('ceramic-pick'));
    await fireEvent.press(await screen.findByTestId('ceramic-look-choir'));
    expect(screen.getByTestId('ceramic-look-choir')).toHaveProp('aria-pressed', true);
    expect(screen.getByText('Figurines: Choir Kids')).toBeTruthy();
  });
});

describe('Ceramic Figurines names', () => {
  it('sets people’s names in the greeting-card script, on the plaque and on every placard', async () => {
    const comments = [
      { id: 'n1', parentId: null, body: 'Holding you close in prayer.', isUpdate: false, createdAt: '2026-10-31T10:00:00Z', author: { displayName: 'Evelyn R' } },
      { id: 'n2', parentId: 'n1', body: 'Thank you.', isUpdate: false, createdAt: '2026-10-31T10:05:00Z', author: { displayName: 'Margaret H' } },
    ];
    (api.comments as jest.Mock).mockResolvedValue({ comments });
    const card = sampleCard({ counts: { ...sampleCard().counts, comments: 1 } });
    await renderApp(
      <CeramicLayout
        cards={[card]}
        theme={null}
        pinnedId={null}
        renderCard={() => <CardNameFont.Consumer>{(f) => <Text>{`font ${f}`}</Text>}</CardNameFont.Consumer>}
        refreshing={false}
        onRefresh={() => undefined}
        onEndReached={() => undefined}
        atEnd
      />,
    );
    await layout();
    expect(await screen.findByText(`font ${NAME_FONT}`)).toBeTruthy();
    await fireEvent.press(await screen.findByTestId(`ceramic-stack-${card.id}`));
    const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as { fontFamily?: string };
    expect(flat(await screen.findByText('Evelyn R')).fontFamily).toBe(NAME_FONT);
    expect(flat(screen.getByText('Margaret H')).fontFamily).toBe(NAME_FONT);
  });
});

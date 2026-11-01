// The Full Screen Sparkler skin (Steve, 2026-11-01).
import { contrastRatio } from '@prayer-tower/shared';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import SparklerBackgrounds from '@/app/sparkler-backgrounds';
import { api } from '@/lib/api';
import { flowerPoints, petalPath, SPARKLER_BACKGROUNDS, SPARKLER_GROUPS, sparklerBackground, starPoints } from '@/lib/sparkler-backgrounds';
import { inkFor, sparklerTokens, SparklerLayout, sparks } from '@/layouts/sparkler';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(async () => ({ features: {} })),
    comments: jest.fn(async () => ({ comments: [] })),
  },
}));

const layout = (cards: ReturnType<typeof sampleCard>[]) => (
  <SparklerLayout cards={cards} theme={null} pinnedId={null} renderCard={(c) => <Text>{`card ${c.id}`}</Text>} refreshing={false} onRefresh={() => undefined} onEndReached={() => undefined} atEnd />
);

describe('Full Screen Sparkler', () => {
  it('separates posts with a black line with a light blue line through its middle', () => {
    const t = sparklerTokens(null);
    expect(t.backdrop).toBe('#000000');
    expect(t.stripe).toBe('#8FD3FF');
  });

  it('offers solid colors, starfields, flowers and textures, every one with readable words', () => {
    expect(SPARKLER_GROUPS).toEqual(['solid', 'stars', 'flowers', 'texture']);
    for (const g of SPARKLER_GROUPS) expect(SPARKLER_BACKGROUNDS.some((b) => b.group === g)).toBe(true);
    for (const b of SPARKLER_BACKGROUNDS) {
      const ink = inkFor(b);
      expect(contrastRatio(ink.text, b.base)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(ink.muted, b.base)).toBeGreaterThanOrEqual(4.5);
      expect(ink.bump).toBe(1);
    }
    expect(sparklerBackground('nope').id).toBe('white');
  });

  it('draws its starfields and flowers to the real size of the post, the same each time', () => {
    expect(starPoints(390, 600, 3)).toEqual(starPoints(390, 600, 3));
    expect(starPoints(390, 600, 3).length).toBeGreaterThan(starPoints(390, 200, 3).length);
    for (const s of starPoints(390, 600, 3)) expect(s.x >= 0 && s.x <= 390 && s.y >= 0 && s.y <= 600).toBe(true);
    for (const f of flowerPoints(390, 300, 2)) expect(f.y).toBeGreaterThanOrEqual(10);
    expect(petalPath(20, 20, 8, 0).match(/M /g)).toHaveLength(5);
  });

  it('throws sparks out from the burning tip', () => {
    const spray = sparks(() => 0.5);
    expect(spray).toHaveLength(16);
    for (const s of spray) expect(Math.hypot(s.x2 - s.x1, s.y2 - s.y1)).toBeGreaterThan(5);
  });
});

describe('Full Screen Sparkler feed', () => {
  it('puts the poster\'s picture in the corner of each square, a separator after each, and the first reply under each comment', async () => {
    const comments = [
      { id: 'c1', parentId: null, body: 'Praying with you.', isUpdate: false, createdAt: '2026-11-01T10:00:00Z', author: { displayName: 'Daniel' } },
      { id: 'c2', parentId: 'c1', body: 'Thank you, Daniel.', isUpdate: false, createdAt: '2026-11-01T10:05:00Z', author: { displayName: 'Ruth' } },
      { id: 'c3', parentId: 'c1', body: 'Amen.', isUpdate: false, createdAt: '2026-11-01T10:06:00Z', author: { displayName: 'Ann' } },
    ];
    (api.comments as jest.Mock).mockResolvedValue({ comments });
    const card = sampleCard({ counts: { ...sampleCard().counts, comments: 1 } });
    await renderApp(layout([card]));
    expect(screen.getByTestId(`sparkler-pic-${card.id}`, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getAllByTestId('sparkler-separator', { includeHiddenElements: true })).toHaveLength(1);
    expect(await screen.findByTestId('sparkler-reply-c2')).toBeTruthy();
    // Only the first reply until it is tapped; tapped again it folds away.
    expect(screen.queryByTestId('sparkler-reply-c3')).toBeNull();
    await fireEvent.press(screen.getByTestId('sparkler-replies-c1'));
    expect(screen.getByTestId('sparkler-reply-c3')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sparkler-replies-c1'));
    expect(screen.queryByTestId('sparkler-reply-c3')).toBeNull();
  });

  it('gives a comment its Reply button but never a reply, and folds the comments closed on a second tap', async () => {
    const comments = [
      { id: 'c1', parentId: null, body: 'Praying with you.', isUpdate: false, createdAt: '2026-11-01T10:00:00Z', author: { displayName: 'Daniel' } },
      { id: 'c2', parentId: 'c1', body: 'Thank you.', isUpdate: false, createdAt: '2026-11-01T10:05:00Z', author: { displayName: 'Ruth' } },
      { id: 'c3', parentId: 'c1', body: 'Amen.', isUpdate: false, createdAt: '2026-11-01T10:06:00Z', author: { displayName: 'Ann' } },
    ];
    (api.comments as jest.Mock).mockResolvedValue({ comments });
    const card = sampleCard({ counts: { ...sampleCard().counts, comments: 1 } });
    await renderApp(layout([card]));
    const words = await screen.findByText('Praying with you.');
    await fireEvent.press(words);
    expect(screen.getAllByText('Reply')).toHaveLength(1);
    await fireEvent.press(screen.getByTestId('sparkler-replies-c1'));
    // The replies' own buttons have no Reply.
    expect(screen.getAllByText('Reply')).toHaveLength(1);
    await fireEvent.press(words);
    expect(screen.queryByText('Reply')).toBeNull();
  });
});

describe('Background choices', () => {
  it('lists every background by kind and keeps the one chosen', async () => {
    await renderApp(<SparklerBackgrounds />);
    expect(screen.getByText('Starfields')).toBeTruthy();
    expect(screen.getByText('Flowers')).toBeTruthy();
    expect(screen.getByText('Textures')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('background-starfield'));
    });
    expect(screen.getByTestId('background-starfield').props.accessibilityState?.checked ?? screen.getByTestId('background-starfield').props['aria-checked']).toBe(true);
  });
});

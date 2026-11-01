// The Full Screen Sparkler skin (Steve, 2026-11-01).
import { contrastRatio } from '@prayer-tower/shared';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import SparklerBackgrounds from '@/app/sparkler-backgrounds';
import { api } from '@/lib/api';
import { flowerPoints, petalPath, SPARKLER_BACKGROUNDS, SPARKLER_GROUPS, sparklerBackground, starPoints } from '@/lib/sparkler-backgrounds';
import { lineTip } from '@/lib/draw-in';
import { dustBelow, glitter, inkFor, stardust, TRAIL_YELLOWS, TRAIL_YELLOWS_LIGHT, SEPARATOR, sparklerTokens, SparklerLayout, sparks, swipeLead, TIP_AT } from '@/layouts/sparkler';

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

  it('throws sparks out from the burning tip, most of them downward, the way the line goes', () => {
    const spray = sparks(() => 0.5);
    expect(spray).toHaveLength(16);
    for (const s of spray) expect(Math.hypot(s.x2 - s.x1, s.y2 - s.y1)).toBeGreaterThan(5);
    expect(spray.filter((s) => s.y2 > s.y1).length).toBeGreaterThanOrEqual(12);
  });

  it('grows one line with the scroll, its tip near the foot of the screen, never drawing back', () => {
    expect(TIP_AT).toBeGreaterThanOrEqual(0.8);
    expect(lineTip(0, 800, 0, 5000, TIP_AT)).toBeCloseTo(672);
    expect(lineTip(1000, 800, 672, 5000, TIP_AT)).toBeCloseTo(1672);
    // Scrolled back up, it stays as far as it reached; never past the feed's end.
    expect(lineTip(200, 800, 1672, 5000, TIP_AT)).toBeCloseTo(1672);
    expect(lineTip(4800, 800, 0, 5000, TIP_AT)).toBe(5000);
  });
});

const thread = (n: number) => [
  ...Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, parentId: null, body: `Comment ${i + 1} says a little more than one line can hold on a phone.`, isUpdate: false, createdAt: `2026-11-01T10:${String(59 - i).padStart(2, '0')}:00Z`, author: { displayName: `Name${i + 1}` } })),
  { id: 'r1', parentId: 'c1', body: 'Thank you.', isUpdate: false, createdAt: '2026-11-01T11:05:00Z', author: { displayName: 'Ruth' } },
  { id: 'r2', parentId: 'c1', body: 'Amen.', isUpdate: false, createdAt: '2026-11-01T11:06:00Z', author: { displayName: 'Ann' } },
];

describe('Full Screen Sparkler motion', () => {
  it('throws the sparkler ahead in a swipe, at most a tenth of the screen, for the screen to catch up to', () => {
    let lead = 0;
    for (let i = 0; i < 12; i++) lead = swipeLead(lead, 60, 800);
    expect(lead).toBeCloseTo(80, 0);
    // As the swipe slows, the screen catches up.
    for (let i = 0; i < 12; i++) lead = swipeLead(lead, 4, 800);
    expect(lead).toBeLessThan(12);
    expect(swipeLead(0, -400, 800)).toBeCloseTo(-14);
  });

  it('leaves a trail of sparkle behind the sparkler that dies away near the top of the screen', () => {
    const all = glitter(500, 0, 700, 1);
    expect(all.length).toBeGreaterThan(10);
    expect(all.every((g) => g.y >= 50 && g.y < 700)).toBe(true);
    const near = Math.max(...all.filter((g) => g.y > 560).map((g) => g.opacity));
    const mid = Math.max(...all.filter((g) => g.y > 250 && g.y < 350).map((g) => g.opacity));
    expect(near).toBeGreaterThan(mid);
  });

  it('leaves a yellow trail, and stardust behind it in dark mode, fading toward the top', () => {
    for (const c of [...TRAIL_YELLOWS, ...TRAIL_YELLOWS_LIGHT]) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      expect(r! > 200 && g! > 150 && b! < 150).toBe(true);
    }
    const dust = stardust(300, 0, 700, 2);
    expect(dust.length).toBeGreaterThan(40);
    expect(dust.filter((m) => m.y < 30)).toHaveLength(0);
  });

  it('leaves a little stardust below the sparkler as a scroll up throws it upward', () => {
    expect(dustBelow(600, 0, 0, 1)).toHaveLength(0);
    const dust = dustBelow(600, 60, 0, 1);
    expect(dust.length).toBeGreaterThan(0);
    expect(dust.every((m) => m.y > 600 && m.y < 680)).toBe(true);
  });

  it('makes the divider between prayer requests bold', () => {
    expect(SEPARATOR.height).toBeGreaterThanOrEqual(16);
    expect(SEPARATOR.stripe).toBeGreaterThanOrEqual(4);
  });
});

describe('Full Screen Sparkler feed', () => {
  it('puts the poster\'s picture in the corner of each square and a separator after each', async () => {
    (api.comments as jest.Mock).mockResolvedValue({ comments: [] });
    const card = sampleCard();
    await renderApp(layout([card]));
    expect(screen.getByTestId(`sparkler-pic-${card.id}`, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getAllByTestId('sparkler-separator', { includeHiddenElements: true })).toHaveLength(1);
  });

  it('shows only the first line of the first comment closed, unfolds the next 5 on a tap, then 5 more, and folds closed on a tap', async () => {
    (api.comments as jest.Mock).mockResolvedValue({ comments: thread(12) });
    const card = sampleCard({ counts: { ...sampleCard().counts, comments: 12 } });
    await renderApp(layout([card]));
    const first = await screen.findByTestId(`sparkler-first-line-${card.id}`);
    // Plainly comments, and how many.
    expect(screen.getByText(/12 comments/)).toBeTruthy();
    expect(first.props.numberOfLines).toBe(1);
    expect(screen.getByTestId(`sparkler-folds-${card.id}`, { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('sparkler-comment-c2')).toBeNull();
    await fireEvent.press(screen.getByTestId(`sparkler-comments-${card.id}`));
    // The first comment and the next 5.
    for (let i = 1; i <= 6; i++) expect(screen.getByTestId(`sparkler-comment-c${i}`)).toBeTruthy();
    expect(screen.queryByTestId('sparkler-comment-c7')).toBeNull();
    await fireEvent.press(screen.getByText('6 more comments'));
    expect(screen.getByTestId('sparkler-comment-c11')).toBeTruthy();
    // A tap on an open comment folds them all closed again.
    await fireEvent.press(screen.getByText(thread(12)[0]!.body));
    expect(screen.queryByTestId('sparkler-comment-c2')).toBeNull();
    expect(screen.getByTestId(`sparkler-first-line-${card.id}`)).toBeTruthy();
  });

  it('shows the first reply under a comment, the rest on a tap, and gives Reply to comments but never replies', async () => {
    (api.comments as jest.Mock).mockResolvedValue({ comments: thread(2) });
    const card = sampleCard({ counts: { ...sampleCard().counts, comments: 2 } });
    await renderApp(layout([card]));
    await fireEvent.press(await screen.findByTestId(`sparkler-comments-${card.id}`));
    expect(screen.getByTestId('sparkler-reply-r1')).toBeTruthy();
    expect(screen.queryByTestId('sparkler-reply-r2')).toBeNull();
    expect(screen.getAllByText('Reply')).toHaveLength(2);
    await fireEvent.press(screen.getByTestId('sparkler-replies-c1'));
    expect(screen.getByTestId('sparkler-reply-r2')).toBeTruthy();
    // The replies' own buttons have no Reply.
    expect(screen.getAllByText('Reply')).toHaveLength(2);
    await fireEvent.press(screen.getByTestId('sparkler-replies-c1'));
    expect(screen.queryByTestId('sparkler-reply-r2')).toBeNull();
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

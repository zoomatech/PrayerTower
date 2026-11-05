// The Mountain Climber skin (Steve, 2026-10-31): the chase, his side-view poses, the rock and the cliff edge.
import { contrastRatio } from '@prayer-tower/shared';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderApp, sampleCard } from '@/__tests__/helpers';
import { api } from '@/lib/api';
import { ClimbLayout, chaseStep, cliffEdge, climbTokens, climberPose, EDGE_X, nearHand, rockFacets, rockOutline, ropePaths } from '@/layouts/climb';

jest.mock('@/lib/api', () => ({
  api: {
    features: jest.fn(async () => ({ features: {} })),
    comments: jest.fn(async () => ({ comments: [] })),
  },
}));

const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('Mountain Climber', () => {
  it('climbs up when you scroll up and rappels down when you scroll down, quickly, and stops where you stop', () => {
    expect(chaseStep(500, 200).mode).toBe('up');
    expect(chaseStep(200, 500).mode).toBe('down');
    let y = 200;
    for (let i = 0; i < 60; i++) y = chaseStep(y, 900).y;
    // About a second of frames covers 700 points.
    expect(y).toBeCloseTo(900, 0);
    const done = chaseStep(900, 900);
    expect(done.mode).toBe('still');
    expect(done.y).toBe(900);
  });

  it('is seen from the side: close to the wall climbing with the pickaxe, leaning back and kicking out rappelling', () => {
    const up = climberPose('up', 1, 0);
    const down = climberPose('down', 1, 0);
    expect(up.axeInHand).toBe(true);
    expect(down.axeInHand).toBe(false);
    expect(up.off).toBeLessThan(down.off);
    expect(down.lean).toBeLessThan(-25);
    // His legs swing as he climbs.
    expect(climberPose('up', 0.5, 0).nearHip).not.toBe(climberPose('up', 2, 0).nearHip);
  });

  it('runs the rope from above the screen through his hand to the harness, and on past the bottom', () => {
    const pose = climberPose('down', 1, 0);
    const { above, below } = ropePaths(pose, 'down', 20, 300, 800, 0, 4);
    const a = nums(above);
    expect(a[1]).toBeLessThan(0);
    const hand = nearHand(pose);
    expect(a[2]).toBeCloseTo(20 + hand.x, 0);
    expect(a[3]).toBeCloseTo(300 + hand.y, 0);
    expect(nums(below).pop()).toBeGreaterThan(800);
  });

  it('draws the rock in stone facets that fill the band, with a cliff edge that meets the next band', () => {
    const { facets, cracks } = rockFacets(390, 520, 3);
    expect(facets.length).toBeGreaterThan(40);
    expect(cracks.length).toBeGreaterThan(0);
    for (const f of facets) for (const v of nums(f.points)) expect(v).toBeGreaterThanOrEqual(-0.1);
    const { edge } = cliffEdge(520, 3);
    const e = nums(edge);
    expect(e.slice(0, 2)).toEqual([EDGE_X, 0]);
    expect(e.slice(-2)).toEqual([EDGE_X, 520]);
    for (let i = 0; i < e.length; i += 2) expect(Math.abs(e[i]! - EDGE_X)).toBeLessThanOrEqual(11);
  });

  it('draws comment rocks at their real size, never stretched: jags stay small on a wide rock and a tall one', () => {
    for (const [w, h] of [[300, 70], [120, 200]] as const) {
      const pts = rockOutline(w, h, 2);
      for (const [x, y] of pts) {
        expect(Math.min(x, w - x, y, h - y)).toBeLessThanOrEqual(8.01);
        expect(Math.min(x, w - x, y, h - y)).toBeGreaterThanOrEqual(0);
      }
      // About one jag per 28 points round the edge.
      expect(pts.length).toBeGreaterThanOrEqual(Math.floor((2 * (w + h)) / 28) - 4);
    }
  });

  it('keeps the post and comment text readable on the stone (4.5:1)', () => {
    const t = climbTokens(null);
    expect(contrastRatio('#6F6677', t.slab)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#211B14', '#A59882')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Mountain Climber feed', () => {
  it('puts comments on rocks under the post, and opens one full screen below the request it answers', async () => {
    const comments = [
      { id: 'c1', parentId: null, body: 'Praying for steady hands tonight.', isUpdate: false, createdAt: '2026-10-31T10:00:00Z', author: { displayName: 'Daniel' } },
      { id: 'c2', parentId: 'c1', body: 'Thank you, Daniel.', isUpdate: false, createdAt: '2026-10-31T10:05:00Z', author: { displayName: 'Ruth' } },
    ];
    (api.comments as jest.Mock).mockResolvedValue({ comments });
    const card = sampleCard({ body: 'Please pray for my father.\nSurgery is tomorrow.', counts: { ...sampleCard().counts, comments: 1 } });
    await renderApp(
      <ClimbLayout
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
    const rock = await screen.findByTestId('rock-c1');
    expect(screen.getByText('Praying for steady hands tonight.')).toBeTruthy();
    // Its first reply shows under it on the rock.
    expect(screen.getByTestId('rock-first-c1')).toHaveTextContent('Ruth: Thank you, Daniel.');
    await fireEvent.press(rock);
    expect(await screen.findByTestId('climb-closeup')).toBeTruthy();
    const parent = screen.getByTestId('climb-parent');
    expect(within(parent).getByText(card.author.displayName)).toBeTruthy();
    expect(within(screen.getByTestId('climb-reply-c2')).getByText('Thank you, Daniel.')).toBeTruthy();
    // Only the comment gets a Reply button; its replies never do (Steve: no overnesting).
    expect(within(screen.getByTestId('climb-reply-c2')).queryByText('Reply')).toBeNull();
    expect(screen.getAllByText('Reply').length).toBe(1);
    // Tapping the comment again folds it closed.
    await fireEvent.press(screen.getByTestId('climb-fold'));
    expect(screen.queryByTestId('climb-closeup')).toBeNull();
  });
});

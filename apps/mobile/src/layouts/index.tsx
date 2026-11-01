// Feed layouts. The server sends layout-neutral cards plus the viewer's theme;
// a layout decides structure and motion. To add one (vine, Flipboard-style
// flip, carousel), implement FeedLayout and register it below: cards, actions
// and data stay the same.
import type { Card, CardAction, FeedLayoutKind, FeedTheme } from '@prayer-tower/shared';
import type { ReactElement } from 'react';

import { CarouselLayout } from './carousel';
import { CeramicLayout } from './ceramic';
import { CircuitLayout } from './circuit';
import { ClimbLayout } from './climb';
import { ColumnLayout } from './column';
import { FlipLayout } from './flip';
import { TowerLayout } from './tower';
import { BeanstalkLayout } from './beanstalk';
import { VineLayout, vineTokens } from './vine';
import { WallLayout } from './wall';

export interface FeedLayoutProps {
  cards: Card[];
  theme: FeedTheme | null;
  pinnedId: string | null;
  /** Renders one card; every layout must use it so the action row is identical. */
  renderCard: (card: Card) => ReactElement;
  header?: ReactElement | null;
  refreshing: boolean;
  onRefresh: () => void;
  onEndReached: () => void;
  /** True when the server has no more pages: show a resting end, not an endless scroll. */
  atEnd: boolean;
  /** Card actions, for layouts with their own gestures (swipe right to pray). */
  onAction?: (card: Card, action: CardAction) => void;
  /** Cards side by side on very wide windows (iPad landscape, Mac). Layouts with their own structure may ignore it. */
  columns?: number;
}

export type FeedLayout = (props: FeedLayoutProps) => ReactElement;

// Column is the V1 default; vine, flip and swipe-to-pray (carousel) are beta
// styles members can opt into. The Wall and the vine skins (Beanstalk, Golden
// Wood, Moonlit Gate) and the Prayer Tower climb are offered only while
// Admin → Feed skins is on.
/** The Beanstalk skin has its own drawing (layouts/beanstalk.tsx); the other vine skins share the vine. */
function VineOrBeanstalk(props: FeedLayoutProps) {
  return vineTokens(props.theme).vineStyle === 'beanstalk' ? <BeanstalkLayout {...props} /> : <VineLayout {...props} />;
}

const layouts: Partial<Record<FeedLayoutKind, FeedLayout>> = {
  column: ColumnLayout,
  vine: VineOrBeanstalk,
  flip: FlipLayout,
  carousel: CarouselLayout,
  wall: WallLayout,
  tower: TowerLayout,
  circuit: CircuitLayout,
  climb: ClimbLayout,
  ceramic: CeramicLayout,
};

export function layoutFor(theme: FeedTheme | null): FeedLayout {
  return (theme && layouts[theme.layout]) || ColumnLayout;
}

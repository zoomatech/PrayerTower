// Feed layouts. The server sends layout-neutral cards plus the viewer's theme;
// a layout decides structure and motion. To add one (vine, Flipboard-style
// flip, carousel), implement FeedLayout and register it below: cards, actions
// and data stay the same.
import type { Card, FeedLayoutKind, FeedTheme } from '@prayer-tower/shared';
import type { ReactElement } from 'react';

import { ColumnLayout } from './column';

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
}

export type FeedLayout = (props: FeedLayoutProps) => ReactElement;

// V1 ships the column. Other kinds fall back to it until their layout exists.
const layouts: Partial<Record<FeedLayoutKind, FeedLayout>> = {
  column: ColumnLayout,
};

export function layoutFor(theme: FeedTheme | null): FeedLayout {
  return (theme && layouts[theme.layout]) || ColumnLayout;
}

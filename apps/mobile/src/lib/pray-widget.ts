// Keeps the "Pray now" home-screen widget (src/widgets/pray-now.tsx) showing the
// next request to pray for. iOS only; elsewhere these do nothing.
import type { Card, FeedPage } from '@prayer-tower/shared';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import type { T } from '@/lib/i18n';
import type { PrayNowProps } from '@/widgets/pray-now';

// Loaded lazily so Android, the web and Expo Go never touch the widget module.
function widget(): { updateSnapshot(props: PrayNowProps): void } | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return require('@/widgets/pray-now').default;
  } catch {
    return null;
  }
}

/**
 * The request the widget shows: the feed's pinned request, else the first other
 * request. Never the member's own, and never one marked sensitive or about a
 * crisis, since a home screen is seen by others.
 */
export function nextRequest(page: Pick<FeedPage, 'posts' | 'pinnedId'>): Card | null {
  const ok = (c: Card) => c.postType === 'prayer_request' && !c.isMine && !c.isSensitive && !c.crisis && c.state !== 'answered';
  return page.posts.find((c) => c.id === page.pinnedId && ok(c)) ?? page.posts.find(ok) ?? null;
}

export function widgetProps(card: Card | null, t: T): PrayNowProps {
  if (!card) return { heading: t('widget.heading'), text: t('widget.empty'), detail: '', url: Linking.createURL('/') };
  return {
    heading: t('widget.heading'),
    text: card.preview || card.body,
    detail: card.counts.prayers > 0 ? t('card.praying', { count: card.counts.prayers }) : t('card.firstToPray'),
    url: Linking.createURL(`/post/${card.id}`),
  };
}

export function updatePrayWidget(page: Pick<FeedPage, 'posts' | 'pinnedId'> | null, t: T) {
  try {
    widget()?.updateSnapshot(widgetProps(page ? nextRequest(page) : null, t));
  } catch {
    // A build without the widget extension: nothing to update.
  }
}

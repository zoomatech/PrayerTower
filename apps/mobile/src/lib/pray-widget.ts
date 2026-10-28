// Keeps the "Pray now" home-screen widget showing the next request to pray for:
// src/widgets/pray-now.tsx on iOS, src/widgets/pray-now-android.tsx on Android.
// On the web these do nothing.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Card, FeedPage } from '@prayer-tower/shared';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { api, type PrayedFor } from '@/lib/api';
import { loadFeatures } from '@/lib/features';
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

/** "💛 Ana and 2 others prayed for you today": first names only, never anyone who prayed anonymously. */
export function prayedForLine(p: PrayedFor, t: T): string {
  if (!p.enabled || p.people === 0) return '';
  const [first, second] = p.names;
  if (!first) return t('growth.widgetPrayedForCount', { count: p.people });
  if (p.people === 1) return t('growth.widgetPrayedForOne', { name: first });
  if (p.people === 2 && second) return t('growth.widgetPrayedForTwo', { name: first, other: second });
  return t('growth.widgetPrayedForMore', { name: first, count: p.people - 1 });
}

let prayedFor = '';

function push(props: PrayNowProps) {
  if (Platform.OS === 'android') return void updateAndroid(props);
  try {
    widget()?.updateSnapshot(props);
  } catch {
    // A build without the widget extension: nothing to update.
  }
}

export function updatePrayWidget(page: Pick<FeedPage, 'posts' | 'pinnedId'> | null, t: T) {
  if (!page) prayedFor = '';
  const props = { ...widgetProps(page ? nextRequest(page) : null, t), prayedFor };
  push(props);
  // Signed in: also say who prayed for the member today, while an admin has it on.
  if (page && Platform.OS !== 'web') {
    loadFeatures()
      .then((f) => (f.prayedForWidget ? api.prayedFor().then((r) => prayedForLine(r.prayedFor, t)) : ''))
      .then(
        (line) => {
          if (line === prayedFor) return;
          prayedFor = line;
          push({ ...props, prayedFor: line });
        },
        () => undefined,
      );
  }
}

/** Android draws from storage (the widget may redraw while the app is closed), so save, then redraw any placed widgets. */
async function updateAndroid(props: PrayNowProps) {
  try {
    const { ANDROID_WIDGET_KEY, ANDROID_WIDGET_NAME, render } = require('@/widgets/pray-now-android') as typeof import('@/widgets/pray-now-android');
    const { requestWidgetUpdate } = require('react-native-android-widget') as typeof import('react-native-android-widget');
    await AsyncStorage.setItem(ANDROID_WIDGET_KEY, JSON.stringify(props));
    await requestWidgetUpdate({ widgetName: ANDROID_WIDGET_NAME, renderWidget: () => render(props) });
  } catch {
    // Expo Go or a build without the widget: nothing to update.
  }
}

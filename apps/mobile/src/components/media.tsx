// Photos and video on a card. The API signs a fresh URL on every fetch, so
// images are cached on the device by their storage path (cacheKey), not by
// URL: a photo downloads once, scrolls back instantly, and still shows from
// the saved feed when offline. See https://docs.expo.dev/versions/latest/sdk/image/
import type { Card } from '@prayer-tower/shared';
import { Image } from 'expo-image';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { createContext, useContext, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

function VideoPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => p.play());
  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />;
}

/**
 * The full-screen wall (layouts/wall.tsx) tells each page whether it is the one
 * on screen. There a video fills the page, plays by itself, muted and looping
 * like a short-video app, and stops when the member swipes on.
 */
export const WallPage = createContext<{ active: boolean } | null>(null);

/** The playing wall video: muted until tapped, looping at the short-video limit (7 seconds by default). */
function WallPlayer({ url, maxSeconds }: { url: string; maxSeconds: number }) {
  const t = useT();
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });
  // A longer clip from before the limit still loops at the limit.
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (maxSeconds > 0 && currentTime >= maxSeconds) player.currentTime = 0;
  });
  const toggle = () => {
    player.muted = !muted;
    setMuted(!muted);
  };
  return (
    <>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <Pressable onPress={toggle} style={styles.sound} accessibilityRole="button" accessibilityLabel={t(muted ? 'wall.soundOn' : 'wall.soundOff')}>
        <Text style={styles.soundText} maxFontSizeMultiplier={1.3}>
          {muted ? '🔇' : '🔊'}
        </Text>
      </Pressable>
    </>
  );
}

function WallVideo({ url, active }: { url: string; active: boolean }) {
  const t = useT();
  const reduced = useReducedMotion();
  const { videoMaxSeconds } = useFeatures();
  const { height } = useWindowDimensions();
  const [tapped, setTapped] = useState(false);
  // Tall, like a phone video, but leaving room for the words and the icon row.
  const frame = [styles.wallVideo, { height: Math.max(240, Math.round(height * 0.42)) }];
  // With reduced motion nothing plays until the member asks.
  if (active && (!reduced || tapped)) {
    return (
      <View style={frame} testID="wall-video-playing">
        <WallPlayer url={url} maxSeconds={videoMaxSeconds} />
      </View>
    );
  }
  return (
    <Pressable style={[frame, styles.poster]} onPress={() => setTapped(true)} accessibilityRole="button" accessibilityLabel={t('common.playVideo')} testID="wall-video">
      <Text style={styles.play}>▶</Text>
    </Pressable>
  );
}

/** A video player is heavy, so a card only creates one when the member taps play. */
function Video({ url }: { url: string }) {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  if (playing) return <VideoPlayer url={url} />;
  return (
    <Pressable style={[styles.video, styles.poster]} onPress={() => setPlaying(true)} accessibilityRole="button" accessibilityLabel={t('common.playVideo')}>
      <Text style={styles.play}>▶</Text>
    </Pressable>
  );
}

export function CardMedia({ media, expanded }: { media: Card['media']; expanded: boolean }) {
  const t = useT();
  const wall = useContext(WallPage);
  const ready = media.filter((m) => m.url);
  if (ready.length === 0) return null;
  const shown = expanded ? ready : ready.slice(0, 1);
  return (
    <View style={styles.wrap}>
      {shown.map((m) =>
        m.kind === 'video' ? (
          wall ? <WallVideo key={m.storagePath} url={m.url!} active={wall.active} /> : <Video key={m.storagePath} url={m.url!} />
        ) : (
          <Image
            key={m.storagePath}
            source={{ uri: m.url!, cacheKey: m.storagePath }}
            recyclingKey={m.storagePath}
            cachePolicy="memory-disk"
            transition={150}
            style={styles.image}
            contentFit="cover"
            accessibilityLabel={t('common.photo')}
          />
        ),
      )}
      {!expanded && ready.length > 1 ? <Text style={styles.more}>{t('common.morePhotos', { count: ready.length - 1 })}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.border },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: '#000' },
  more: { ...type.small },
  poster: { alignItems: 'center', justifyContent: 'center' },
  play: { color: '#fff', fontSize: 40 },
  wallVideo: { aspectRatio: 9 / 16, maxWidth: '100%', alignSelf: 'center', borderRadius: radius.md, backgroundColor: '#000', overflow: 'hidden' },
  sound: { position: 'absolute', right: space.sm, bottom: space.sm, minWidth: 44, minHeight: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  soundText: { fontSize: 20 },
});

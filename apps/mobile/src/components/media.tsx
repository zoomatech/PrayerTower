// Photos and video on a card. The API signs a fresh URL on every fetch, so
// images are cached on the device by their storage path (cacheKey), not by
// URL: a photo downloads once, scrolls back instantly, and still shows from
// the saved feed when offline. See https://docs.expo.dev/versions/latest/sdk/image/
import type { Card } from '@prayer-tower/shared';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

function VideoPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => p.play());
  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />;
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
  const ready = media.filter((m) => m.url);
  if (ready.length === 0) return null;
  const shown = expanded ? ready : ready.slice(0, 1);
  return (
    <View style={styles.wrap}>
      {shown.map((m) =>
        m.kind === 'video' ? (
          <Video key={m.storagePath} url={m.url!} />
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
});

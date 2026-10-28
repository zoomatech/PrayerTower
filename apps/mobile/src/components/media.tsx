// Photos and video on a card. URLs are signed by the API and expire, so the
// card is re-fetched rather than caching them.
import type { Card } from '@prayer-tower/shared';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '@/lib/theme';

function Video({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />;
}

export function CardMedia({ media, expanded }: { media: Card['media']; expanded: boolean }) {
  const ready = media.filter((m) => m.url);
  if (ready.length === 0) return null;
  const shown = expanded ? ready : ready.slice(0, 1);
  return (
    <View style={styles.wrap}>
      {shown.map((m) =>
        m.kind === 'video' ? (
          <Video key={m.storagePath} url={m.url!} />
        ) : (
          <Image key={m.storagePath} source={{ uri: m.url! }} style={styles.image} contentFit="cover" accessibilityLabel="Photo" />
        ),
      )}
      {!expanded && ready.length > 1 ? <Text style={styles.more}>+{ready.length - 1} more</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.border },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, backgroundColor: '#000' },
  more: { ...type.small },
});

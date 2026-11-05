// A member's profile picture on a post or comment, cached on the device. The server signs a fresh URL on every load
// (the token in the query changes), so the cache is keyed by the photo's path, which doesn't:
// scrolling back or refreshing the feed doesn't download the same picture again.
import { Image } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

/** The signed URL without its token: the same for one photo across loads. */
export function photoCacheKey(url: string) {
  return url.split('?')[0]!;
}

export function CachedPhoto({ url, style }: { url: string; style: StyleProp<ImageStyle> }) {
  const key = photoCacheKey(url);
  return <Image source={{ uri: url, cacheKey: key }} recyclingKey={key} cachePolicy="memory-disk" style={style} contentFit="cover" accessibilityIgnoresInvertColors />;
}

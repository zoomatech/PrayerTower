// FlatList settings shared by the feed layouts. Prayer cards are tall (two or
// three fill a phone screen), so render a few at a time and keep a smaller
// window than the defaults (10 per batch, 21 screens); see
// https://reactnative.dev/docs/optimizing-flatlist-configuration
import { Platform } from 'react-native';

export const feedListTuning = {
  initialNumToRender: 4,
  maxToRenderPerBatch: 4,
  windowSize: 7,
  // Detaching off-screen rows helps Android; on iOS it can drop content, so leave the default there.
  removeClippedSubviews: Platform.OS === 'android',
} as const;

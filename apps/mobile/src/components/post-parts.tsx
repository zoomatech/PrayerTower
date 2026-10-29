// Comments at block breaks (notebook Page 13): a long post shown in parts of about
// 200 words, with "Comment on this part" after each. The comments themselves stay
// together at the end, each marked with its part (comment label below).
import { postParts } from '@prayer-tower/shared';
import { useMemo } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import { useLocale } from '@/lib/i18n';
import { colors, space } from '@/lib/theme';

export interface PartComments {
  /** Comments already on each part, by part number. */
  counts: Record<number, number>;
  /** The part being commented on, if one is picked. */
  picked: number | null;
  onPick: (part: number) => void;
}

/** True when the post is long enough to have parts. */
export function hasParts(body: string) {
  return postParts(body).length > 1;
}

export function PostParts({ body, style, parts }: { body: string; style: TextStyle | TextStyle[]; parts: PartComments }) {
  const { t } = useLocale();
  const pieces = useMemo(() => postParts(body), [body]);
  return (
    <View style={styles.wrap}>
      {pieces.map((piece, i) => (
        <View key={i} style={[styles.part, parts.picked === i && styles.picked]}>
          <Text style={style}>{piece}</Text>
          <View style={styles.row}>
            <Text
              style={styles.link}
              onPress={() => parts.onPick(i)}
              accessibilityRole="button"
              accessibilityLabel={`${t('partComments.commentHere')}, ${i + 1} / ${pieces.length}`}>
              💬 {t('partComments.commentHere')}
            </Text>
            {parts.counts[i] ? <Text style={styles.count}>{t('partComments.count', { count: parts.counts[i] })}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  part: { gap: space.xs, borderLeftWidth: 2, borderLeftColor: 'transparent', paddingLeft: space.xs },
  picked: { borderLeftColor: colors.primary },
  row: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap', alignItems: 'center' },
  // 44-point target, like the other kindness tools.
  link: { color: colors.primary, fontSize: 13, fontWeight: '600', minHeight: 44, lineHeight: 44 },
  count: { color: colors.textMuted, fontSize: 13 },
});

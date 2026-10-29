// "Praying for you now" Live Activity (iOS, docs/GROWTH.md): the member's own open
// request on their Lock Screen and Dynamic Island, updated by the server through Apple
// push as people pray. First names and a count only: a Lock Screen is seen by others.
// Docs: https://docs.expo.dev/versions/v58.0.0/sdk/widgets/
import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type PrayedForProps = {
  /** "Praying for you" (Open Circle: "Thinking of you"). */
  heading: string;
  /** "Ana and 2 others prayed for you". */
  line: string;
  count: number;
};

const PrayedFor = (props: PrayedForProps, environment: LiveActivityEnvironment) => {
  'widget';
  const purple = environment.isLuminanceReduced ? '#B9A6E0' : '#5B3E96';
  return {
    banner: (
      <VStack alignment="leading" spacing={4}>
        <HStack spacing={6}>
          <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle(purple)]}>{`💛 ${props.heading}`}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 20, weight: 'bold' }), foregroundStyle(purple)]}>{String(props.count)}</Text>
        </HStack>
        <Text modifiers={[font({ size: 15, weight: 'medium' }), lineLimit(2)]}>{props.line}</Text>
      </VStack>
    ),
    compactLeading: <Text>💛</Text>,
    compactTrailing: <Text modifiers={[font({ size: 14, weight: 'bold' })]}>{String(props.count)}</Text>,
    minimal: <Text>💛</Text>,
    expandedLeading: <Text modifiers={[font({ size: 14, weight: 'bold' }), foregroundStyle(purple)]}>{`💛 ${props.heading}`}</Text>,
    expandedTrailing: <Text modifiers={[font({ size: 18, weight: 'bold' })]}>{String(props.count)}</Text>,
    expandedBottom: <Text modifiers={[font({ size: 15 }), lineLimit(2)]}>{props.line}</Text>,
  };
};

export default createLiveActivity('PrayedFor', PrayedFor);

// "Pray now" home-screen widget (iOS): the next request to pray for. Tapping it
// opens that request. The app sends the content (src/lib/pray-widget.ts); the
// widget body runs in its own runtime, so it uses only its props and inline
// values. Docs: https://docs.expo.dev/versions/v58.0.0/sdk/widgets/
import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, lineLimit, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type PrayNowProps = {
  /** "Pray now", in the member's language. */
  heading: string;
  /** The request's preview text, or the empty-state line. */
  text: string;
  /** "3 praying", or empty. */
  detail: string;
  /** Opened on tap. */
  url: string;
};

const PrayNow = (props: PrayNowProps, environment: WidgetEnvironment) => {
  'widget';
  const purple = '#5B3E96';
  const small = environment.widgetFamily === 'systemSmall';
  return (
    <VStack
      alignment="leading"
      spacing={6}
      modifiers={[containerBackground('#FBF8F3', 'widget'), widgetURL(props.url)]}>
      <HStack spacing={4}>
        <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(purple)]}>{`🕊 ${props.heading}`}</Text>
        <Spacer />
      </HStack>
      <Text modifiers={[font({ size: small ? 14 : 16, weight: 'medium' }), foregroundStyle('#2B2433'), lineLimit(small ? 4 : 3)]}>{props.text}</Text>
      <Spacer />
      {props.detail ? <Text modifiers={[font({ size: 12 }), foregroundStyle('#6F6677')]}>{props.detail}</Text> : null}
    </VStack>
  );
};

// Shown until the app first sends content. The Open Circle build has its own words and link scheme.
const OPEN_CIRCLE = process.env.EXPO_PUBLIC_EDITION === 'open-circle';
export default createWidget(
  'PrayNow',
  PrayNow,
  OPEN_CIRCLE
    ? { heading: 'Lift someone up', text: 'Open the app to see who could use some support.', detail: '', url: 'opencircle:///' }
    : { heading: 'Pray now', text: 'Open Prayer Tower to see who needs prayer.', detail: '', url: 'prayertower:///' },
);

// "Pray now" home-screen widget (Android): the next request to pray for, matching
// the iOS widget in pray-now.tsx. Tapping it opens that request. Android draws
// widgets from this layout in a background JS task (index.ts), so the props
// come from storage, not from the running app. Library and click actions:
// https://saleksovski.github.io/react-native-android-widget/docs
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlexWidget, TextWidget, type WidgetTaskHandler } from 'react-native-android-widget';

import type { PrayNowProps } from '@/widgets/pray-now';

/** The widget name in app.json (react-native-android-widget plugin). */
export const ANDROID_WIDGET_NAME = 'PrayNow';
/** The last content the app sent, read when Android asks the widget to draw. */
export const ANDROID_WIDGET_KEY = 'widget:pray-now:v1';

export const DEFAULT_PROPS: PrayNowProps = {
  heading: 'Pray now',
  text: 'Open Prayer Tower to see who needs prayer.',
  detail: '',
  url: 'prayertower:///',
};

const THEME = {
  light: { background: '#FBF8F3', heading: '#5B3E96', text: '#2B2433', detail: '#6F6677' },
  dark: { background: '#221C2B', heading: '#C4B0EC', text: '#EEE9F5', detail: '#B5ADC2' },
} as const;

export function PrayNowAndroid({ props, scheme }: { props: PrayNowProps; scheme: keyof typeof THEME }) {
  const c = THEME[scheme];
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: props.url }}
      accessibilityLabel={`${props.heading}. ${props.text}`}
      style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'space-between', padding: 14, borderRadius: 20, backgroundColor: c.background }}>
      <FlexWidget style={{ flexDirection: 'column', flexGap: 6 }}>
        <TextWidget text={`🕊 ${props.heading}`} style={{ fontSize: 13, fontWeight: 'bold', color: c.heading }} />
        <TextWidget text={props.text} maxLines={3} truncate="END" style={{ fontSize: 16, fontWeight: '500', color: c.text }} />
      </FlexWidget>
      {props.detail ? <TextWidget text={props.detail} style={{ fontSize: 12, color: c.detail }} /> : <TextWidget text=" " style={{ fontSize: 12 }} />}
    </FlexWidget>
  );
}

export async function storedProps(): Promise<PrayNowProps> {
  try {
    const raw = await AsyncStorage.getItem(ANDROID_WIDGET_KEY);
    return raw ? { ...DEFAULT_PROPS, ...(JSON.parse(raw) as Partial<PrayNowProps>) } : DEFAULT_PROPS;
  } catch {
    return DEFAULT_PROPS;
  }
}

export const render = (props: PrayNowProps) => ({
  light: <PrayNowAndroid props={props} scheme="light" />,
  dark: <PrayNowAndroid props={props} scheme="dark" />,
});

/** Android asks for a drawing when the widget is added, resized or due for an update. */
export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetAction, renderWidget }) => {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') return;
  renderWidget(render(await storedProps()));
};

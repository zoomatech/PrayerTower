// App entry: Expo Router, plus the background task Android uses to draw the
// "Pray now" home-screen widget (src/widgets/pray-now-android.tsx).
import 'expo-router/entry';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget') as typeof import('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widgets/pray-now-android') as typeof import('./src/widgets/pray-now-android');
  registerWidgetTaskHandler(widgetTaskHandler);
}

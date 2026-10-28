import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, Platform, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api, sendQueued } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LocaleProvider, useLocale } from '@/lib/i18n';
import { useMenuCommands } from '@/lib/menu-commands';
import { updatePrayWidget } from '@/lib/pray-widget';
import { withMonitoring } from '@/lib/monitoring';
import { usePush } from '@/lib/push';
import { Button } from '@/components/ui';
import { colors, space, type } from '@/lib/theme';

function RootStack() {
  const { session, profile, loading, profileError, refreshProfile, signOut } = useAuth();
  const { language, t } = useLocale();
  usePush(!!session && !!profile?.onboarded_at);
  useMenuCommands(!!session && !!profile?.onboarded_at);
  // The server sends notifications in the member's language.
  useEffect(() => {
    if (profile && profile.locale !== language) api.updateMe({ locale: language }).catch(() => undefined);
  }, [profile?.id, profile?.locale, language]); // eslint-disable-line react-hooks/exhaustive-deps
  // Signed out: the home-screen widget stops showing requests.
  useEffect(() => {
    if (!loading && !session) updatePrayWidget(null, t);
  }, [loading, session, t]);
  // Send prayers and posts made offline when the app comes back to the foreground.
  useEffect(() => {
    if (!session) return;
    void sendQueued();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void sendQueued());
    return () => sub.remove();
  }, [session]);
  if (!loading && session && !profile && profileError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl, backgroundColor: colors.background }}>
        <Text style={[type.body, { textAlign: 'center' }]}>{profileError}</Text>
        <Button label="Try again" onPress={() => void refreshProfile()} />
        <Button variant="ghost" label="Sign out" onPress={() => void signOut()} />
      </View>
    );
  }
  if (loading || (session && !profile)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  const signedIn = !!session;
  const onboarded = !!profile?.onboarded_at;
  // On the web every screen sits in one main landmark, so screen readers can jump to it (axe "region").
  return (
    <View role={Platform.OS === 'web' ? 'main' : undefined} style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="compose" options={{ presentation: 'modal' }} />
          <Stack.Screen name="post/[id]" />
          <Stack.Screen name="delete-account" />
          <Stack.Screen name="feedback" />
          <Stack.Screen name="notification-settings" />
          <Stack.Screen name="tour" options={{ presentation: "modal" }} />
          <Stack.Screen name="moderation" />
          <Stack.Screen name="admin" />
          <Stack.Screen name="audit-log" />
          <Stack.Screen name="ops" />
          <Stack.Screen name="invites" />
          <Stack.Screen name="announcements" />
          <Stack.Screen name="feedback-triage" />
          <Stack.Screen name="import" />
          <Stack.Screen name="appeal/[id]" />
          <Stack.Screen name="people/[id]" />
          <Stack.Screen name="rules" />
          <Stack.Screen name="pools" />
          <Stack.Screen name="scheduled" />
          <Stack.Screen name="macro-needs" />
          <Stack.Screen name="prayer-cast" />
          <Stack.Screen name="highlights" />
          <Stack.Screen name="conversation/[id]" />
          <Stack.Screen name="groups" />
          <Stack.Screen name="events" />
          <Stack.Screen name="care" />
          <Stack.Screen name="witness" />
          <Stack.Screen name="event/[id]" />
        </Stack.Protected>
      </Stack>
    </View>
  );
}

function RootLayout() {
  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootStack />
        </AuthProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}

export default withMonitoring(RootLayout);

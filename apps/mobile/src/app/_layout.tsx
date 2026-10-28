import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { sendQueued } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { withMonitoring } from '@/lib/monitoring';
import { usePush } from '@/lib/push';
import { colors } from '@/lib/theme';

function RootStack() {
  const { session, profile, loading } = useAuth();
  usePush(!!session && !!profile?.onboarded_at);
  // Send prayers and posts made offline when the app comes back to the foreground.
  useEffect(() => {
    if (!session) return;
    void sendQueued();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void sendQueued());
    return () => sub.remove();
  }, [session]);
  if (loading || (session && !profile)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  const signedIn = !!session;
  const onboarded = !!profile?.onboarded_at;
  return (
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
        <Stack.Screen name="moderation" />
        <Stack.Screen name="admin" />
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
  );
}

function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootStack />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default withMonitoring(RootLayout);

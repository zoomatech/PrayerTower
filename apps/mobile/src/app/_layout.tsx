import { Stack, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { api, sendQueued } from '@/lib/api';
import { pendingCount } from '@/lib/offline';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LocaleProvider, useLocale } from '@/lib/i18n';
import { useMenuCommands } from '@/lib/menu-commands';
import { updatePrayWidget } from '@/lib/pray-widget';
import { withMonitoring } from '@/lib/monitoring';
import { GENERIC_ERROR, reportError, setErrorScreen } from '@/lib/error-report';
import { usePush } from '@/lib/push';
import { Button } from '@/components/ui';
import { colors, space, type } from '@/lib/theme';

function RootStack() {
  const { session, profile, loading, profileError, refreshProfile, signOut, recovering, needsCode } = useAuth();
  const { language, t } = useLocale();
  usePush(!!session && !!profile?.onboarded_at);
  useErrorLog();
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
    // While something is waiting, try again every half minute, so it sends when the signal
    // comes back even if nothing else in the app reaches the server first.
    const retry = setInterval(() => {
      if (AppState.currentState === 'active' && pendingCount() > 0) void sendQueued();
    }, 30_000);
    return () => {
      sub.remove();
      clearInterval(retry);
    };
  }, [session]);
  if (!loading && session && !profile && profileError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl, backgroundColor: colors.background }}>
        <Text style={[type.body, { textAlign: 'center' }]}>{profileError}</Text>
        <Button label={t('common.tryAgain')} onPress={() => void refreshProfile()} />
        <Button variant="ghost" label={t('profile.signOut')} onPress={() => void signOut()} />
      </View>
    );
  }
  if (loading || (session && !profile && !needsCode)) return <Starting />;
  const signedIn = !!session;
  const onboarded = !!profile?.onboarded_at;
  // Every screen must be listed in one of the groups below. A screen left out is
  // open to everyone, and Expo Router sends a signed-out visitor to it.
  // On the web every screen sits in one main landmark, so screen readers can jump to it (axe "region").
  return (
    <View role={Platform.OS === 'web' ? 'main' : undefined} style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
          {/* Listener mode: shows "Listening isn't turned on" unless an admin turned it on. */}
          <Stack.Screen name="listen-on-air" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && needsCode}>
          <Stack.Screen name="two-step" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !needsCode && !onboarded && !recovering}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !needsCode && onboarded && !recovering}>
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
          <Stack.Screen name="surveys" />
          <Stack.Screen name="legal" />
          <Stack.Screen name="podcasts" />
          <Stack.Screen name="why-gifts" />
          <Stack.Screen name="squire-board" />
          <Stack.Screen name="prayer-list" />
          <Stack.Screen name="safety" />
          <Stack.Screen name="reading-plan" />
          <Stack.Screen name="podcasts-admin" />
          <Stack.Screen name="waitlist" />
          <Stack.Screen name="crosspost" />
          <Stack.Screen name="survey/[id]" />
          <Stack.Screen name="feedback-triage" />
          <Stack.Screen name="error-log" />
          <Stack.Screen name="operator-console" />
          <Stack.Screen name="import" />
          <Stack.Screen name="appeal/[id]" />
          <Stack.Screen name="people/[id]" />
          <Stack.Screen name="rules" />
          <Stack.Screen name="pools" />
          <Stack.Screen name="scheduled" />
          <Stack.Screen name="signal-queue" />
          <Stack.Screen name="prayer-chain" />
          <Stack.Screen name="remembered" />
          <Stack.Screen name="circles/index" />
          <Stack.Screen name="circles/[id]" />
          <Stack.Screen name="mend/[id]" />
          <Stack.Screen name="meaning-words" />
          <Stack.Screen name="highlights" />
          <Stack.Screen name="kindness-research" />
          <Stack.Screen name="prayer-minute" />
          <Stack.Screen name="skin-idea" />
          <Stack.Screen name="skin-gallery" />
          <Stack.Screen name="token-store" />
          <Stack.Screen name="give" />
          <Stack.Screen name="radio-requests" />
          <Stack.Screen name="macro-needs" />
          <Stack.Screen name="prayer-cast" />
          <Stack.Screen name="listen" />
          <Stack.Screen name="highlights" />
          <Stack.Screen name="kindness-research" />
          <Stack.Screen name="awards" />
          <Stack.Screen name="branch" />
          <Stack.Screen name="ai-chat" />
          <Stack.Screen name="circle-prep" />
          <Stack.Screen name="live" />
          <Stack.Screen name="conversation/[id]" />
          <Stack.Screen name="groups" />
          <Stack.Screen name="events" />
          <Stack.Screen name="care" />
          <Stack.Screen name="witness" />
          <Stack.Screen name="event/[id]" />
          <Stack.Screen name="church" />
          <Stack.Screen name="churches" />
          <Stack.Screen name="help-stories" />
        </Stack.Protected>
        {/* After the main screens, so signing in lands on the feed; during a password reset it's the only screen. */}
        <Stack.Protected guard={signedIn && !needsCode && (onboarded || recovering)}>
          <Stack.Screen name="account-security" />
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

/**
 * A screen that crashes while drawing lands here (Expo Router hands it the nearest
 * ErrorBoundary): the member reads one plain sentence and can try again, and the
 * error goes to Admin → Error log. It sits outside the app's providers, so its words are fixed.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => reportError(error), [error]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl, backgroundColor: colors.background }}>
      <Text accessibilityRole="header" style={[type.body, { textAlign: 'center' }]}>
        {GENERIC_ERROR}
      </Text>
      <Button label="Try again" onPress={() => void retry()} />
    </View>
  );
}

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
declare const ErrorUtils: { getGlobalHandler(): GlobalHandler; setGlobalHandler(h: GlobalHandler): void } | undefined;

/** Keeps the error log's screen name current, and sends errors no screen caught (native and web). */
function useErrorLog() {
  const segments = useSegments();
  useEffect(() => setErrorScreen(segments.filter((s) => !s.startsWith('(')).join('/') || 'index'), [segments]);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const onError = (e: ErrorEvent) => reportError(e.error ?? e.message);
      const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);
      window.addEventListener('error', onError);
      window.addEventListener('unhandledrejection', onRejection);
      return () => {
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
      };
    }
    if (typeof ErrorUtils === 'undefined') return;
    const previous = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error, isFatal) => {
      reportError(error);
      previous(error, isFatal);
    });
    return () => ErrorUtils.setGlobalHandler(previous);
  }, []);
}

/** The first screen while the app signs in. On a slow connection it says what it's doing after a few seconds. */
function Starting() {
  const { n } = useLocale();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl, backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} accessibilityLabel={`Loading ${n('Prayer Tower')}`} />
      {slow ? <Text style={[type.small, { textAlign: 'center' }]}>Connecting to {n('Prayer Tower')}. This is taking longer than usual; check your connection.</Text> : null}
    </View>
  );
}

/// <reference types="jest" />
// Shared mocks for the unit tests (npm test -w @prayer-tower/mobile).
// Each test file mocks the API itself; these cover the native modules and
// navigation that every screen touches. Setup follows
// https://docs.expo.dev/develop/unit-testing/ and
// https://react-native-async-storage.github.io/async-storage/docs/advanced/jest
/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en', languageTag: 'en-US' }], getCalendars: () => [{ timeZone: 'UTC' }] }));

// Sign-in goes through Supabase; tests set what each call returns.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: { access_token: 'test-token' } } })),
      signInWithPassword: jest.fn(async () => ({ data: { session: {} }, error: null })),
      signUp: jest.fn(async () => ({ data: { session: null }, error: null })),
      signOut: jest.fn(async () => ({ error: null })),
      resetPasswordForEmail: jest.fn(async () => ({ data: {}, error: null })),
      verifyOtp: jest.fn(async () => ({ data: {}, error: null })),
      updateUser: jest.fn(async () => ({ data: {}, error: null })),
      setSession: jest.fn(async () => ({ data: {}, error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      mfa: {
        getAuthenticatorAssuranceLevel: jest.fn(async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })),
        listFactors: jest.fn(async () => ({ data: { all: [], totp: [], phone: [] }, error: null })),
        enroll: jest.fn(async () => ({ data: null, error: null })),
        challenge: jest.fn(async () => ({ data: { id: 'challenge-1' }, error: null })),
        verify: jest.fn(async () => ({ data: {}, error: null })),
        unenroll: jest.fn(async () => ({ data: {}, error: null })),
      },
    },
  },
}));

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() };
  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: jest.fn(() => ({})),
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    useNavigation: () => ({ setOptions: jest.fn(), addListener: jest.fn(() => jest.fn()) }),
    Link: ({ children }: { children: unknown }) => children,
    Stack: { Screen: () => null },
  };
});

afterEach(() => {
  jest.clearAllMocks();
});

// expo-speech needs the native module; tests check what would be read aloud.
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => undefined) }));

// expo-audio needs the native module; tests drive a fake recorder and player.
jest.mock('expo-audio', () => {
  const recorder = { uri: 'file:///take.m4a', currentTime: 12, prepareToRecordAsync: jest.fn(async () => undefined), record: jest.fn(), stop: jest.fn(async () => undefined) };
  const player = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn() };
  const stream = { start: jest.fn(async () => undefined), stop: jest.fn(), isStreaming: false };
  return {
    useAudioStream: jest.fn(() => ({ stream, isStreaming: false })),
    RecordingPresets: { HIGH_QUALITY: {} },
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
    setAudioModeAsync: jest.fn(async () => undefined),
    useAudioRecorder: () => recorder,
    useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0 }),
    useAudioPlayer: () => player,
    useAudioPlayerStatus: () => ({ playing: false, currentTime: 0 }),
  };
});

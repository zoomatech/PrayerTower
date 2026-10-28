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
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
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

// expo-audio needs the native module; tests drive a fake recorder and player.
jest.mock('expo-audio', () => {
  const recorder = { uri: 'file:///take.m4a', currentTime: 12, prepareToRecordAsync: jest.fn(async () => undefined), record: jest.fn(), stop: jest.fn(async () => undefined) };
  const player = { play: jest.fn(), seekTo: jest.fn() };
  return {
    RecordingPresets: { HIGH_QUALITY: {} },
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
    setAudioModeAsync: jest.fn(async () => undefined),
    useAudioRecorder: () => recorder,
    useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0 }),
    useAudioPlayer: () => player,
  };
});

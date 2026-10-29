// App language: English only for now (Steve, 2026-10-28). The Spanish strings
// stay in src/locales/es.ts and come back with EXPO_PUBLIC_SPANISH=1 (env.spanish),
// which also shows the language picker. With Spanish on, the member picks a
// language on the Me screen, or follows the phone ("System"); the choice is saved
// on this device. Strings live in src/locales/<code>.ts. A key missing from a
// locale falls back to English. Enum labels (post types, realms...) fall back to
// the English labels in @prayer-tower/shared, so English needs no copy of them.
//
// Wording: members of a non-religious community (Open Circle) see the neutral
// English in src/locales/neutral.ts instead of the faith wording. The wording
// follows the member's community from /me (setWording), and the Open Circle
// build (EXPO_PUBLIC_EDITION=open-circle) is always neutral.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { I18n, type TranslateOptions } from 'i18n-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Platform, Text, type StyleProp, type TextStyle } from 'react-native';

import { env } from '@/lib/env';
import en from '@/locales/en';
import es from '@/locales/es';
import { keys as neutralKeys, literals as neutralLiterals } from '@/locales/neutral';
import { neutralEnglish, neutralString } from '@/lib/neutral-tree';

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];
export type LanguageChoice = Language | 'system';

const STORAGE_KEY = 'prayer-tower.language';
type Tree = { [key: string]: unknown };

const i18n = new I18n({ en, es, 'en-neutral': neutralEnglish(en as Tree, neutralKeys, env.openCircleName) });
i18n.defaultLocale = 'en';
i18n.enableFallback = true;

export type Wording = 'faith' | 'neutral';
let wording: Wording = env.edition === 'open-circle' ? 'neutral' : 'faith';
const listeners = new Set<() => void>();
/** Faith or neutral wording; set from the member's community ("secular" = neutral). */
export function setWording(next: Wording) {
  if (env.edition === 'open-circle') next = 'neutral';
  if (next === wording) return;
  wording = next;
  listeners.forEach((l) => l());
}
export const wordingForTradition = (tradition: string | null | undefined): Wording => (tradition === 'secular' ? 'neutral' : 'faith');
/** The wording the member's community asks for (an admin can set any community to neutral); else by its tradition. */
export const wordingFor = (community: { tradition?: string | null; wording?: Wording | null } | null | undefined): Wording =>
  community?.wording ?? wordingForTradition(community?.tradition);
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getWording = () => wording;

function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return LANGUAGES.some((l) => l.code === code) ? (code as Language) : 'en';
}

export type T = (key: string, options?: TranslateOptions) => string;

interface LocaleState {
  language: Language;
  choice: LanguageChoice;
  setChoice: (choice: LanguageChoice) => void;
  t: T;
  /** Label for a shared enum value: the locale's `enums.<group>.<value>`, else the English label. */
  label: (group: string, value: string | null | undefined, english?: string) => string;
  wording: Wording;
  /** Fixed English text a screen writes out directly, in the member's wording. */
  n: (text: string) => string;
}

const LocaleContext = createContext<LocaleState | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<LanguageChoice>('system');
  const [device, setDevice] = useState<Language>(deviceLanguage);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'system' || LANGUAGES.some((l) => l.code === saved)) setChoiceState(saved as LanguageChoice);
      })
      .catch(() => undefined);
    // Android keeps running when the phone's language changes; check again on return.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setDevice(deviceLanguage()));
    return () => sub.remove();
  }, []);

  const setChoice = useCallback((next: LanguageChoice) => {
    setChoiceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const words = useSyncExternalStore(subscribe, getWording, getWording);
  const language: Language = !env.spanish ? 'en' : choice === 'system' ? device : choice;
  // Neutral wording is English only, so Spanish keeps its own text.
  const locale = words === 'neutral' && language === 'en' ? 'en-neutral' : language;
  // Screen readers on the web pick their voice from <html lang> (WCAG 3.1.1).
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.documentElement.lang !== language) document.documentElement.lang = language;
  }, [language]);
  const value = useMemo<LocaleState>(() => {
    i18n.locale = locale;
    const n = (text: string) => (locale === 'en-neutral' ? (neutralLiterals[text] ?? neutralString(text, env.openCircleName)) : text);
    // A default (a server-made name with no key yet) gets the Open Circle wording too; member text passed in options never does.
    const t: T = (key, options) =>
      i18n.t(key, { locale, ...options, ...(typeof options?.defaultValue === 'string' ? { defaultValue: n(options.defaultValue) } : {}) });
    return {
      language,
      choice,
      setChoice,
      t,
      label: (group, v, english) => (v ? i18n.t(`enums.${group}.${v}`, { locale, defaultValue: n(english ?? v) }) : ''),
      wording: words,
      n,
    };
  }, [language, locale, words, choice, setChoice]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleState {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale needs <LocaleProvider>');
  return ctx;
}

/** The translate function for the current language. */
export const useT = () => useLocale().t;

/** A translated line of text, for places that render one fixed string. */
export function Tr({ k, style }: { k: string; style?: StyleProp<TextStyle> }) {
  return <Text style={style}>{useT()(k)}</Text>;
}

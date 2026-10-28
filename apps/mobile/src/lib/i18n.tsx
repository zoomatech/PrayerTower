// App language: English (default) and Spanish. The member picks a language on
// the Me screen, or follows the phone ("System"); the choice is saved on this
// device. Strings live in src/locales/<code>.ts. A key missing from a locale
// falls back to English. Enum labels (post types, realms...) fall back to the
// English labels in @prayer-tower/shared, so English needs no copy of them.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { I18n, type TranslateOptions } from 'i18n-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform, Text, type StyleProp, type TextStyle } from 'react-native';

import en from '@/locales/en';
import es from '@/locales/es';

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];
export type LanguageChoice = Language | 'system';

const STORAGE_KEY = 'prayer-tower.language';
const i18n = new I18n({ en, es });
i18n.defaultLocale = 'en';
i18n.enableFallback = true;

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

  const language = choice === 'system' ? device : choice;
  // Screen readers on the web pick their voice from <html lang> (WCAG 3.1.1).
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.lang = language;
  }, [language]);
  const value = useMemo<LocaleState>(() => {
    i18n.locale = language;
    const t: T = (key, options) => i18n.t(key, { locale: language, ...options });
    return {
      language,
      choice,
      setChoice,
      t,
      label: (group, v, english) => (v ? i18n.t(`enums.${group}.${v}`, { locale: language, defaultValue: english ?? v }) : ''),
    };
  }, [language, choice, setChoice]);

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

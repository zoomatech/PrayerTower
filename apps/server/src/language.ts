// Members see English only (Steve, 2026-10-28). The Spanish text stays in the
// code but is never shown unless SPANISH_ENABLED=1. Tests turn it on to check
// the Spanish text itself.
export const languages = { spanish: process.env.SPANISH_ENABLED === '1' };

/** The language to write to a member in: their saved language, or English while Spanish is off. */
export const memberLang = (locale: string | null | undefined): 'en' | 'es' => (languages.spanish && locale === 'es' ? 'es' : 'en');

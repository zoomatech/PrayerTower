// EXPO_PUBLIC_ variables are inlined at build time (see .env.example).
export const env = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  /**
   * The https address shared links point at (the public site, served by the API host).
   * The app opens these itself once the domain is verified (docs/APP_LINKS.md). Defaults to an https API.
   */
  linkUrl: (process.env.EXPO_PUBLIC_LINK_URL ?? '').replace(/\/$/, ''),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  /** Where the published privacy policy and terms of use live (required by both app stores). */
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? '',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? '',
  /** Published contact address (Apple 1.2 asks apps with user content for one). */
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '',
  /** Which country's crisis line to show (US, CA, GB or IE). Defaults to the US. */
  crisisCountry: process.env.EXPO_PUBLIC_CRISIS_COUNTRY ?? 'US',
  /** Crash reporting (Sentry); unset = off. The DSN is public by design. */
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  /** Members see English only (Steve, 2026-10-28). EXPO_PUBLIC_SPANISH=1 brings back Spanish and the language picker. */
  spanish: process.env.EXPO_PUBLIC_SPANISH === '1',
  /**
   * Which edition this build is. "open-circle" is the separately branded, non-religious app
   * (Steve, 2026-10-28): its wording is always neutral and new members join the Open Circle community.
   * Unset = Prayer Tower, where wording follows the member's community.
   */
  edition: process.env.EXPO_PUBLIC_EDITION === 'open-circle' ? ('open-circle' as const) : ('prayer-tower' as const),
  /** The Open Circle edition's name, a placeholder until Steve picks one (also its app name, app.config.js). */
  openCircleName: process.env.EXPO_PUBLIC_OPEN_CIRCLE_NAME || 'Open Circle',
  sentryEnvironment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? 'production',
};

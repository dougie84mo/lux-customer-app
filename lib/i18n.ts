import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { NAMESPACES, resources } from '@/locales';

// App language (multi-language phase 2, 2026-09-28). English + Spanish;
// a third language = one more folder under locales/ + the 0195 check
// constraints + this union. Conventions: docs/i18n.md.
//
// Kept free of native modules and supabase so any component (and Jest) can
// import it: the device language comes from Hermes' Intl, the saved
// preference + the users.locale sync live in lib/localeSync.ts.

export type AppLocale = 'en' | 'es';
export const APP_LOCALES: readonly AppLocale[] = ['en', 'es'];

export function toAppLocale(tag: unknown): AppLocale | null {
  if (typeof tag !== 'string') return null;
  const base = tag.trim().toLowerCase().slice(0, 2);
  return base === 'en' || base === 'es' ? base : null;
}

/** The phone's language, when we speak it; English otherwise. */
export function deviceLocale(): AppLocale {
  try {
    return toAppLocale(Intl.DateTimeFormat().resolvedOptions().locale) ?? 'en';
  } catch {
    return 'en';
  }
}

i18n.use(initReactI18next).init({
  resources,
  ns: NAMESPACES,
  defaultNS: 'common',
  lng: deviceLocale(),
  fallbackLng: 'en',
  supportedLngs: APP_LOCALES,
  // Resources are bundled, so init is synchronous — the first render is
  // already translated.
  initAsync: false,
  // React escapes on render.
  interpolation: { escapeValue: false },
});

export function currentLocale(): AppLocale {
  return toAppLocale(i18n.language) ?? 'en';
}

/** For strings that MAY be a translation key — Zod messages in
 *  lib/schemas.ts ('auth:validation.email'), thrown Error messages in lib/.
 *  A key is translated; anything else (e.g. a Postgres error from the
 *  server) is shown as-is. */
export function tMessage(message: string | undefined | null): string | undefined {
  if (!message) return undefined;
  return i18n.exists(message) ? (i18n.t as (k: string) => string)(message) : message;
}

export default i18n;

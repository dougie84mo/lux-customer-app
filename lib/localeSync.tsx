import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth';
import i18n, { AppLocale, deviceLocale, toAppLocale } from './i18n';
import { supabase } from './supabase';

// The user's language choice and its server mirror (0195).
//
// The choice ("Phone setting" / English / Español) is per phone, in
// AsyncStorage. users.locale always holds the EFFECTIVE language — never
// null once the app has run signed-in — because the server has no way to
// read the phone's setting: push, email, SMS and Stripe all key off it.

export type LanguagePref = 'system' | AppLocale;

const PREF_KEY = 'lux.languagePref';

export function effectiveLocale(pref: LanguagePref): AppLocale {
  return pref === 'system' ? deviceLocale() : pref;
}

async function readPref(): Promise<LanguagePref> {
  try {
    const v = await AsyncStorage.getItem(PREF_KEY);
    return v === 'system' ? 'system' : toAppLocale(v) ?? 'system';
  } catch {
    return 'system';
  }
}

// Listeners so every mounted useLanguagePref sees a change made elsewhere.
const listeners = new Set<(p: LanguagePref) => void>();

export async function setLanguagePref(pref: LanguagePref): Promise<void> {
  await AsyncStorage.setItem(PREF_KEY, pref).catch(() => {});
  await i18n.changeLanguage(effectiveLocale(pref));
  listeners.forEach((l) => l(pref));
}

/** The saved choice + a setter, for the language picker. */
export function useLanguagePref() {
  const [pref, setPref] = useState<LanguagePref>('system');
  useEffect(() => {
    let alive = true;
    readPref().then((p) => alive && setPref(p));
    listeners.add(setPref);
    return () => {
      alive = false;
      listeners.delete(setPref);
    };
  }, []);
  const update = useCallback((p: LanguagePref) => setLanguagePref(p), []);
  return { pref, setPref: update };
}

let lastSynced: string | null = null;

/** Mount once inside AuthProvider. Applies the saved choice on launch and
 *  keeps users.locale equal to the language on screen. Renders nothing. */
export function LocaleSync() {
  const { session } = useAuth();
  const { i18n: inst } = useTranslation();
  const userId = session?.user.id;
  const language = toAppLocale(inst.language) ?? 'en';

  useEffect(() => {
    readPref().then((p) => {
      const l = effectiveLocale(p);
      if (l !== i18n.language) i18n.changeLanguage(l);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    const key = `${userId}:${language}`;
    if (lastSynced === key) return;
    lastSynced = key;
    // Column grant 0195; RLS scopes it to the caller's own row. Best-effort:
    // a failure only means server messages stay in the previous language.
    supabase
      .from('users')
      .update({ locale: language })
      .eq('id', userId)
      .then(({ error }) => {
        if (error) {
          lastSynced = null;
          console.warn('users.locale sync failed', error.message);
        }
      });
  }, [userId, language]);

  return null;
}

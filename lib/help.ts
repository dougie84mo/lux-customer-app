import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery } from '@tanstack/react-query';
import { helpFeedUrl } from '@/constants/support';
import { currentLocale } from './i18n';
import { supabase } from './supabase';
import { HelpFeed, parseHelpFeed } from './helpLogic';

// Data for the in-app help center (help.tsx, help-article.tsx). The articles
// come from the website's help feed, so the app shows exactly what
// support.theluxmirror.com shows, in the app's language. The last good copy
// is kept on the phone: help is most needed when the connection is bad, and
// a fresh install with no signal falls back to "open on the web".
// Identical in both apps.

const TIMEOUT_MS = 10_000;
const cacheKey = (lang: string) => `lux.help-feed.v1.${lang}`;

async function fetchFeed(lang: string): Promise<HelpFeed> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(helpFeedUrl(lang), { signal: controller.signal });
    if (!res.ok) throw new Error(`help feed answered ${res.status}`);
    const json: unknown = await res.json();
    const feed = parseHelpFeed(json);
    AsyncStorage.setItem(cacheKey(lang), JSON.stringify(json)).catch(() => {});
    return feed;
  } finally {
    clearTimeout(timer);
  }
}

async function cachedFeed(lang: string): Promise<HelpFeed | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(lang));
    return raw ? parseHelpFeed(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** The whole help center in the app's language; the saved copy when offline. */
export function useHelpFeed() {
  const lang = currentLocale();
  return useQuery({
    queryKey: ['help-feed', lang],
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async (): Promise<HelpFeed> => {
      try {
        return await fetchFeed(lang);
      } catch (err) {
        const saved = await cachedFeed(lang);
        if (saved) return saved;
        throw err;
      }
    },
  });
}

/** "Was this helpful?" — the same vote the website's articles record
 *  (submit_support_feedback, 0208). Fire and forget. */
export function useHelpFeedback() {
  return useMutation({
    mutationFn: async (input: { articleId: string; helpful: boolean }) => {
      const { error } = await supabase.rpc('submit_support_feedback', {
        p_slug: input.articleId,
        p_lang: currentLocale(),
        p_helpful: input.helpful,
      });
      if (error) throw error;
    },
  });
}

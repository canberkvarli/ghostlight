/**
 * The app's language: English or Turkish.
 *
 * Canberk, 2026-11-03: the Turkish UI lives here, not on the web. A Turkish
 * actor brings their own script and rehearses it in Turkish; the monologue
 * rooms (search, the book, the board) are for English-speaking actors and are
 * not drawn in Turkish.
 *
 * The phone's language decides (a Turkish iPhone opens in Turkish), and a
 * switch in Settings overrides it, kept on the phone. Every request says which
 * (`X-ActorRise-Locale`, src/api/client.ts), so the server serves the Turkish
 * library only to the Turkish app (actorrise services/library_language.py).
 *
 * Strings are written where they are used, as pairs: `L('Add sides', 'Metin
 * ekle')`. The English is the line that was there before, untouched, and the
 * Turkish sits beside it, so a review reads both at once.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { useCallback, useSyncExternalStore } from 'react';

import { currentLocale, pick, publishLocale, subscribeLocale, type Locale } from './pick';

export { currentLocale, pick, type Locale };
/** What the actor picked in Settings: a language, or the phone's. */
export type LocalePreference = Locale | 'phone';

const KEY = 'ghostlight.locale';

/** The phone's own language: Turkish when its first language is, else English. */
export function phoneLocale(): Locale {
  try {
    const first = getLocales()[0];
    return (first?.languageCode ?? '').toLowerCase() === 'tr' ? 'tr' : 'en';
  } catch {
    return 'en';
  }
}

let preference: LocalePreference = 'phone';
publishLocale(phoneLocale());

function resolve(p: LocalePreference): Locale {
  return p === 'phone' ? phoneLocale() : p;
}

/** Read the stored choice. Called once at launch; until it lands, the phone's language. */
export async function loadLocalePreference(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored === 'en' || stored === 'tr' || stored === 'phone') {
      preference = stored;
      publishLocale(resolve(stored));
    }
  } catch {
    /* storage unavailable: the phone's language stands */
  }
}

export async function setLocalePreference(p: LocalePreference): Promise<void> {
  preference = p;
  publishLocale(resolve(p));
  try {
    await AsyncStorage.setItem(KEY, p);
  } catch {
    /* kept for this launch only */
  }
}

export function localePreference(): LocalePreference {
  return preference;
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, currentLocale, currentLocale);
}

/** `const L = useL(); L('Add sides', 'Metin ekle')`. Re-renders when the language changes. */
export function useL(): (en: string, tr: string) => string {
  const locale = useLocale();
  return useCallback((en: string, tr: string) => (locale === 'tr' ? tr : en), [locale]);
}

/**
 * The monologue rooms (search, the book, the board) are for English-speaking
 * actors: the Turkish app is the scene partner and the actor's own scripts.
 */
export function monologueRoomsShown(locale: Locale): boolean {
  return locale !== 'tr';
}

/**
 * Where "home" is: the search for English, the scene partner for Turkish,
 * which has no monologue rooms. Read when a screen leaves for home.
 */
export function homeHref(locale: Locale = currentLocale()): '/search' | '/rehearse' {
  return monologueRoomsShown(locale) ? '/search' : '/rehearse';
}

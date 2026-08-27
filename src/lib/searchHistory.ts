import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Medium } from '../theme/medium';

/**
 * Recent searches, on this device only.
 *
 * Deliberately not server-backed and deliberately not a subscriber perk: it is
 * too small a thing to police, and gating it would cost more goodwill than it
 * could ever earn. It also means it works before you have an account, which is
 * exactly when the search screen is emptiest and least inviting.
 *
 * Never store the filter selection alongside the text. Re-running a search with
 * filters the actor can no longer see (or no longer pays for) produces results
 * they cannot explain or reproduce.
 *
 * The MEDIUM is stored, and is not a filter. It is which house the search was
 * made in, it is on screen the whole time, and it is the difference between
 * Hamlet and a Fleabag monologue. Re-running a theatre search from inside the
 * Film & TV house used to silently search the wrong catalogue and hand back the
 * wrong results in the wrong colour, which is the one failure a recent-search
 * list must not have: you tapped a thing you had already seen and got something
 * else.
 */

const KEY = 'ghostlight.searchHistory.v2';
/** v1 held bare strings. Read once so nobody's list vanishes on upgrade. */
const LEGACY_KEY = 'ghostlight.searchHistory.v1';
const MAX = 8;

export interface RecentSearch {
  q: string;
  medium: Medium;
}

function coerce(value: unknown): RecentSearch | null {
  // v1 entries were plain strings, and everything predating the toggle was a
  // theatre search, so that's the honest migration.
  if (typeof value === 'string' && value.trim()) return { q: value, medium: 'theatre' };
  if (value && typeof value === 'object') {
    const v = value as { q?: unknown; medium?: unknown };
    if (typeof v.q === 'string' && v.q.trim()) {
      return { q: v.q, medium: v.medium === 'screen' ? 'screen' : 'theatre' };
    }
  }
  return null;
}

export async function loadSearchHistory(): Promise<RecentSearch[]> {
  try {
    const raw = (await AsyncStorage.getItem(KEY)) ?? (await AsyncStorage.getItem(LEGACY_KEY));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(coerce).filter((x): x is RecentSearch => x !== null);
  } catch {
    return [];
  }
}

/**
 * Most recent first, capped at MAX. De-duplication is on the pair, not the text:
 * "hamlet" in the theatre and "hamlet" on screen are different searches with
 * different answers, and collapsing them would lose whichever you ran first.
 */
export async function pushSearchHistory(term: string, medium: Medium): Promise<RecentSearch[]> {
  const q = term.trim();
  if (!q) return loadSearchHistory();
  const prev = await loadSearchHistory();
  const next = [
    { q, medium },
    ...prev.filter((p) => !(p.q.toLowerCase() === q.toLowerCase() && p.medium === medium)),
  ].slice(0, MAX);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A full disk shouldn't break searching.
  }
  return next;
}

export async function clearSearchHistory(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([KEY, LEGACY_KEY]);
  } catch {
    // Nothing to do; the list is cosmetic.
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage';

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
 */

const KEY = 'ghostlight.searchHistory.v1';
const MAX = 8;

export async function loadSearchHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/** Most recent first, de-duplicated case-insensitively, capped at MAX. */
export async function pushSearchHistory(term: string): Promise<string[]> {
  const q = term.trim();
  if (!q) return loadSearchHistory();
  const prev = await loadSearchHistory();
  const next = [q, ...prev.filter((p) => p.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A full disk shouldn't break searching.
  }
  return next;
}

export async function clearSearchHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing to do; the list is cosmetic.
  }
}

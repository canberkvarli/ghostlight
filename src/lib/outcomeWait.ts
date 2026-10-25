import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * "Waiting" on the how-did-it-go sheet: no word yet, so nothing to log. The
 * board stops asking about that audition for a week, then asks again. Kept
 * on the phone; the audition itself is untouched.
 */
const KEY = 'ghostlight:outcome.waiting';
const WEEK_MS = 7 * 86_400_000;

export async function waitingOn(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    for (const k of Object.keys(map)) if (!(map[k] > now)) delete map[k];
    return map;
  } catch { return {}; }
}

export async function waitAWeek(auditionId: number): Promise<void> {
  const map = await waitingOn();
  map[String(auditionId)] = Date.now() + WEEK_MS;
  try { await AsyncStorage.setItem(KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

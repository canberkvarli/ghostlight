import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * When the actor last opened each script of theirs on this phone. The server
 * knows when a scene was run; this knows the looking, which is half of what
 * "working on" means.
 */
const KEY = 'ghostlight:sides.touched.v1';

export async function loadTouched(): Promise<Record<number, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<number, string>) : {};
  } catch {
    return {};
  }
}

export async function markTouched(id: number): Promise<Record<number, string>> {
  const now = await loadTouched();
  now[id] = new Date().toISOString();
  try { await AsyncStorage.setItem(KEY, JSON.stringify(now)); } catch { /* the server's runs still count */ }
  return now;
}

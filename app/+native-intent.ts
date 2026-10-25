import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabaseHost } from '../src/lib/supabase';

/**
 * Where a link from outside lands. The widget and the reminders open
 * /read/ID. For an actor with an account that is the Search room's reader,
 * named so it does not fall into whichever room expo-router picks (it picked
 * the Board, and back went to the auditions). For a stranger it is the
 * reader at the root, so back is the curtain.
 */
export async function redirectSystemPath({ path }: { path: string; initial: boolean }): Promise<string> {
  const m = path.match(/^(?:[a-z]+:\/\/)?\/?read\/([^/?#]+)(\?.*)?$/i);
  if (!m) return path;
  const [, id, query = ''] = m;
  return (await signedIn()) ? `/(search)/read/${id}${query}` : `/peek/${id}${query}`;
}

async function signedIn(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(`sb-${supabaseHost}-auth-token`);
    if (!raw) return false;
    const s = JSON.parse(raw) as { user?: { is_anonymous?: boolean } } | null;
    return Boolean(s?.user) && !s?.user?.is_anonymous;
  } catch { return false; }
}

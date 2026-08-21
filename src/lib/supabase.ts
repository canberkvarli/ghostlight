import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/**
 * The one Supabase client, pointed at the same ActorRise project the web app
 * uses (`ppvqmbzuqvzpiuqaiqfy`). Shared backend, shared users — a monologue an
 * actor saves on the phone is the same row the web app reads.
 *
 * Session lives in AsyncStorage and refreshes itself. `detectSessionInUrl` is
 * off because there is no URL bar on a phone; the OAuth redirect in Step 5 is
 * handled through a deep link, not a query string.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

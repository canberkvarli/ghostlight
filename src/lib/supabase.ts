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

// Missing env must NOT crash the app at import — this module is evaluated at
// startup (expo-router eagerly loads every route), so a throw here would take
// down the whole stage with an unrecoverable error boundary. Instead we warn
// and build a client against a placeholder host: every call fails cleanly and
// the app degrades to session-less, exactly as it does when anonymous sign-ins
// are disabled. Copy .env.example to .env to make it real.
if (!supabaseUrl || !supabaseAnonKey) {
  // log(), not warn() — a LogBox on every launch is noise; the missing data is
  // self-evident. Run Metro with EXPO_NO_DOTENV unset so `.env` loads.
  console.log(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — ' +
      'running session-less. Copy .env.example to .env and rebuild.',
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

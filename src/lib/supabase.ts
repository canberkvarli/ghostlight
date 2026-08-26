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

/**
 * True when the bundle shipped without its environment.
 *
 * This is not hypothetical: two OTA updates went out built against the EAS
 * remote environment, which does not read the local `.env`, so they carried the
 * placeholder host. Every call then failed with iOS's DNS message — "a server
 * with the specified hostname could not be found" — which reads like the user's
 * network is down and says nothing about the actual cause. Surfacing it by name
 * turns a day of guessing into one glance.
 */
export const configMissing = !supabaseUrl || !supabaseAnonKey;

/** Host the running bundle will actually talk to. For the diagnostics row. */
export const supabaseHost = (supabaseUrl || 'placeholder.supabase.co')
  .replace(/^https?:\/\//, '')
  .split('.')[0];

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // Load-bearing. supabase-js v2 defaults to the implicit flow, which
      // returns the session as a URL *fragment* (#access_token=…) and never
      // issues an auth code. src/lib/auth.ts finishes Google sign-in with
      // exchangeCodeForSession(), which exists only in PKCE — so on the default
      // the redirect came back with no `code`, the parse returned null, and
      // Google sign-in failed every single time with "No auth code in
      // redirect." Nothing about that error points at flow type, which is why
      // it survived this long.
      flowType: 'pkce',
    },
  },
);

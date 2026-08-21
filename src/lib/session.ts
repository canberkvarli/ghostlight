import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

/**
 * The anonymous-first session, straight from spec §4.
 *
 * On first launch the app signs in anonymously, so a real `user_id` exists from
 * second zero with no signup wall — the free-read counter has a server-side
 * home, and saves work before the actor ever creates an account. Step 5 later
 * upgrades this same anonymous user to Apple/Google with `linkIdentity()`, so
 * nothing they did is lost.
 *
 * NOTE: this requires "Anonymous sign-ins" to be enabled on the Supabase
 * project (Authentication → Sign In / Providers → Anonymous, or the Management
 * API `external_anonymous_users_enabled: true`). Until it is, the backend
 * returns `anonymous_provider_disabled`; we surface that once and let the app
 * run session-less rather than trapping the user behind an error on launch.
 */

export type SessionState =
  | { status: 'anonymous' | 'authenticated'; session: Session }
  | { status: 'disabled' } // anonymous sign-ins are off on the project
  | { status: 'error'; message: string }
  | { status: 'loading' };

let refreshWired = false;

/**
 * Keep the token fresh only while the app is in the foreground. Supabase's own
 * timer does the work; we just start and stop it so it isn't burning refreshes
 * in the background.
 */
function wireAutoRefresh() {
  if (refreshWired) return;
  refreshWired = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
  supabase.auth.startAutoRefresh();
}

export async function bootstrapSession(): Promise<SessionState> {
  wireAutoRefresh();

  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) {
    return {
      status: existing.session.user.is_anonymous ? 'anonymous' : 'authenticated',
      session: existing.session,
    };
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    if (error.code === 'anonymous_provider_disabled') {
      console.warn(
        '[session] Anonymous sign-ins are disabled on the Supabase project. ' +
          'Enable them (Auth → Providers → Anonymous) so launch can mint a session.',
      );
      return { status: 'disabled' };
    }
    return { status: 'error', message: error.message };
  }

  return { status: 'anonymous', session: data.session! };
}

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';
import { identifyPurchasesUser } from './purchases';

/**
 * The live auth state, driven by Supabase's `onAuthStateChange`. `isAnonymous`
 * is the load-bearing bit: the save gate uses it to decide whether tapping
 * "save" needs the auth screen first (spec §5).
 */
export interface SessionInfo {
  session: Session | null;
  isAnonymous: boolean;
  isAuthenticated: boolean;
  loading: boolean;
}

export function useSession(): SessionInfo {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
      void identifyPurchasesUser(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // RevenueCat is configured once at launch against the anonymous user. If
      // it isn't re-bound here, a purchase made after signing in is credited to
      // the anonymous uuid and the account it was bought for stays locked.
      void identifyPurchasesUser(next?.user.id ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isAnonymous = session?.user.is_anonymous ?? false;
  return {
    session,
    isAnonymous,
    isAuthenticated: Boolean(session) && !isAnonymous,
    loading,
  };
}

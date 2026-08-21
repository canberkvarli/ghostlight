import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

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
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
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

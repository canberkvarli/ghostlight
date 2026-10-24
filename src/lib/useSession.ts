import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';

import { supabase, supabaseHost } from './supabase';
import { identifyPurchasesUser } from './purchases';

/** Where supabase-js keeps the session: `sb-<project ref>-auth-token`. */
const STORED_SESSION_KEY = `sb-${supabaseHost}-auth-token`;

/**
 * The session as it was last written to disk, read straight from storage.
 * `getSession()` refreshes an expired token over the network before it
 * answers, so on a cold start after a few hours the home drew itself signed
 * out and only turned round once Supabase replied, which on a slow morning
 * was ten seconds of the wrong screen. Who you are is already on the phone;
 * only the token needs the network, and `authHeaders()` waits on that itself.
 */
async function storedSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(STORED_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session> | null;
    return parsed && parsed.user && parsed.access_token ? (parsed as Session) : null;
  } catch {
    return null;
  }
}

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

/**
 * The session as the last hook saw it. A room mounting later starts from it,
 * so the book does not say "sign in" for a frame before it knows you.
 */
let known: { session: Session | null } | null = null;

export function useSession(): SessionInfo {
  const [session, setSessionState] = useState<Session | null>(() => known?.session ?? null);
  const [loading, setLoading] = useState(known === null);
  const setSession = (next: Session | null) => { known = { session: next }; setSessionState(next); };

  useEffect(() => {
    let alive = true;
    let live = false; // once Supabase has answered, the stored copy may not overwrite it
    void storedSession().then((stored) => {
      if (!alive || live || !stored) return;
      setSession(stored);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      live = true;
      setSession(data.session);
      setLoading(false);
      void identifyPurchasesUser(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      live = true;
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

import { useSyncExternalStore } from 'react';
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
 * One answer for the whole app. Every room used to keep its own copy of the
 * session and its own race between the stored copy and Supabase's answer; a
 * room mounted early (the Book tab's screen is made at launch, frozen until
 * its tab is pressed) could settle on "stranger" and keep it while every
 * other room knew better. Now there is one store, filled once, and every
 * hook reads it; a change reaches all of them at the same instant.
 */
type Store = { session: Session | null; loading: boolean };
let store: Store = { session: null, loading: true };
const listeners = new Set<() => void>();
let started = false;

function publish(next: Partial<Store>) {
  store = { ...store, ...next };
  listeners.forEach((fn) => fn());
}

function start() {
  if (started) return;
  started = true;
  let live = false; // once Supabase has answered, the stored copy may not overwrite it
  void storedSession().then((stored) => {
    if (live || !stored) return;
    publish({ session: stored, loading: false });
  });
  supabase.auth.getSession().then(({ data }) => {
    live = true;
    publish({ session: data.session, loading: false });
    void identifyPurchasesUser(data.session?.user.id ?? null);
  }).catch(() => { live = true; publish({ loading: false }); });
  supabase.auth.onAuthStateChange((_event, next) => {
    live = true;
    publish({ session: next, loading: false });
    // RevenueCat is configured once at launch against the anonymous user. If
    // it isn't re-bound here, a purchase made after signing in is credited to
    // the anonymous uuid and the account it was bought for stays locked.
    void identifyPurchasesUser(next?.user.id ?? null);
  });
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => store;

export function useSession(): SessionInfo {
  start();
  const { session, loading } = useSyncExternalStore(subscribe, snapshot, snapshot);
  const isAnonymous = session?.user.is_anonymous ?? false;
  return {
    session,
    isAnonymous,
    isAuthenticated: Boolean(session) && !isAnonymous,
    loading,
  };
}

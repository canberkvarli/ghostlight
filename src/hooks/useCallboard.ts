/**
 * The Callboard's live half: the takes on the phone, the Board, what has
 * been seen. The rules are in src/lib/callboard.ts (pure, tested).
 *
 * The takes list is kept in one place and refreshed when the app comes back
 * to the front or when the tape room says something changed
 * (refreshCallboard), so the bell, its page and the tab badges agree.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { badges, callboard, type Call } from '../lib/callboard';
import { allTakes, onTakesChanged, type Take } from '../lib/takes';
import { useAuditions } from './useAuditions';
import { useSession } from '../lib/useSession';
import type { Medium } from '../theme/medium';

/* ─── The takes, shared ──────────────────────────────────────────────── */

let takes: Take[] = [];
let loading = false;
const takeListeners = new Set<() => void>();

async function reloadTakes() {
  if (loading) return;
  loading = true;
  try { takes = await allTakes(); } catch { /* the last list stands */ }
  loading = false;
  takeListeners.forEach((l) => l());
}

/** Something about the takes changed (a take saved, kept, an audition marked sent). */
export function refreshCallboard() { void reloadTakes(); }

let watching = false;
function subscribeTakes(l: () => void) {
  takeListeners.add(l);
  if (!watching) {
    watching = true;
    void reloadTakes();
    AppState.addEventListener('change', (s) => { if (s === 'active') void reloadTakes(); });
    try { onTakesChanged(() => { void reloadTakes(); }); } catch { /* the web preview's takes have no stills */ }
  }
  return () => { takeListeners.delete(l); };
}
const getTakes = () => takes;

export function useTakeList(): Take[] {
  return useSyncExternalStore(subscribeTakes, getTakes, getTakes);
}

/* ─── What has been seen ─────────────────────────────────────────────── */

const SEEN_KEY = 'ghostlight:callboard:seen.v1';
let seen: Set<string> | null = null;
const seenListeners = new Set<() => void>();
let seenVersion = 0;

async function loadSeen() {
  if (seen) return;
  try { seen = new Set(JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) ?? '[]') as string[]); } catch { seen = new Set(); }
  seenVersion++;
  seenListeners.forEach((l) => l());
}

function subscribeSeen(l: () => void) {
  seenListeners.add(l);
  void loadSeen();
  return () => { seenListeners.delete(l); };
}
const getSeenVersion = () => seenVersion;

async function markSeen(keys: string[]) {
  await loadSeen();
  const s = seen!;
  let changed = false;
  for (const k of keys) if (!s.has(k)) { s.add(k); changed = true; }
  if (!changed) return;
  // Kept short: the oldest keys are for lines long gone.
  const list = [...s].slice(-300);
  seen = new Set(list);
  seenVersion++;
  seenListeners.forEach((l) => l());
  try { await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(list)); } catch { /* cosmetic */ }
}

/* ─── The hooks ──────────────────────────────────────────────────────── */

export interface CallboardExtras {
  tonight: { id: string; character: string; source: string } | null;
  left: { id: string; character: string; medium: Medium } | null;
  medium: Medium;
}

/** Every line waiting, and how many the actor has not seen yet. */
export function useCallboard(extras: CallboardExtras): { calls: Call[]; unseen: number; seeAll: () => void; isNew: (key: string) => boolean } {
  const { isAuthenticated } = useSession();
  const { data: auditions } = useAuditions(isAuthenticated);
  const list = useTakeList();
  useSyncExternalStore(subscribeSeen, getSeenVersion, getSeenVersion);
  const [now] = useState(() => new Date());
  const calls = useMemo(
    () => callboard({ auditions: auditions ?? [], takes: list, ...extras }, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auditions, list, extras.tonight?.id, extras.left?.id, extras.medium, now],
  );
  const unseen = seen ? calls.filter((c) => !seen!.has(c.key)).length : 0;
  const seeAll = useCallback(() => { void markSeen(calls.map((c) => c.key)); }, [calls]);
  const isNew = useCallback((key: string) => Boolean(seen) && !seen!.has(key), []);
  return { calls, unseen, seeAll, isNew };
}

/** The tab bar's marks: self-tapes due this week, kept takes waiting to go. */
export function useTabBadges(): { due: number; unsent: number } {
  const { isAuthenticated } = useSession();
  const { data: auditions } = useAuditions(isAuthenticated);
  const list = useTakeList();
  const [tick, setTick] = useState(0);
  // Re-read the clock now and then, so "this week" moves with the days.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30 * 60_000);
    return () => clearInterval(t);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => badges(auditions ?? [], list, new Date()), [auditions, list, tick]);
}

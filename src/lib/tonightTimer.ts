import { useEffect, useState, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';

import type { PracticeKind } from '../api/practice';

/**
 * Tonight's timer: one session at a time, what it is and when it started, and
 * when it ended once End is pressed. It is kept on the phone, so leaving the
 * app, or the app being closed, loses nothing: the clock is the distance from
 * the start, never a count that has to keep running. It is cleared only once
 * the check-in has saved, so a session ended offline is still there to save.
 */
export interface TonightSession {
  kind: PracticeKind;
  startedAt: number;
  endedAt: number | null;
}

// The keep-awake module ships inside expo and is in every build; asked for
// directly so the app needs no new dependency (and no new native build).
const KeepAwake = requireOptionalNativeModule<{ activate(tag: string): Promise<boolean>; deactivate(tag: string): Promise<boolean> }>('ExpoKeepAwake');

const KEY = 'ghostlight.tonight.session.v1';
const AWAKE = 'tonight';

let current: TonightSession | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function set(next: TonightSession | null) {
  current = next;
  // The screen stays on while a session runs: an actor working a speech is not touching the phone.
  if (next && next.endedAt == null) KeepAwake?.activate(AWAKE).catch(() => {});
  else KeepAwake?.deactivate(AWAKE).catch(() => {});
  listeners.forEach((l) => l());
  void (next ? AsyncStorage.setItem(KEY, JSON.stringify(next)) : AsyncStorage.removeItem(KEY)).catch(() => {});
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as TonightSession) : null;
    if (s && typeof s.startedAt === 'number' && s.kind && current === null) set(s);
  } catch {
    // Nothing kept, or it could not be read: no session.
  }
}

export const tonightTimer = {
  get: () => current,
  start(kind: PracticeKind) { set({ kind, startedAt: Date.now(), endedAt: null }); },
  end() { if (current && current.endedAt == null) set({ ...current, endedAt: Date.now() }); },
  /** Put an ended session back on the clock: End was a slip. */
  resume() { if (current?.endedAt != null) set({ ...current, startedAt: current.startedAt + (Date.now() - current.endedAt), endedAt: null }); },
  clear() { set(null); },
};

/** Seconds a session has run, to its end or to now. */
export function secondsOf(s: TonightSession, now = Date.now()): number {
  return Math.max(0, Math.round(((s.endedAt ?? now) - s.startedAt) / 1000));
}

/** "4:07", or "1:04:07" past the hour. */
export function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "12 minutes", "1 minute", "under a minute", "1 hour 5 minutes". */
export function minutesLabel(seconds: number): string {
  const total = Math.floor(seconds / 60);
  if (total < 1) return 'under a minute';
  const h = Math.floor(total / 60);
  const m = total % 60;
  const mins = `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  if (!h) return mins;
  return `${h} ${h === 1 ? 'hour' : 'hours'}${m ? ` ${mins}` : ''}`;
}

/** The session, kept up to date wherever it is shown. */
export function useTonightSession(): TonightSession | null {
  useEffect(() => { void load(); }, []);
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => current,
  );
}

/** The running seconds, once a second while the clock runs; still once it has ended. */
export function useElapsed(s: TonightSession | null): number {
  const [now, setNow] = useState(Date.now());
  const running = s != null && s.endedAt == null;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running, s?.startedAt]);
  return s ? secondsOf(s, now) : 0;
}

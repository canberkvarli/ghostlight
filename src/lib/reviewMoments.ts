import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * When to ask for a rating, and when not to.
 *
 * The note from backstage only appears straight after something went right:
 * a third save, a speech read to the end on a second day, a third day of
 * coming back. Never on the first day, never in a session that hit the
 * paywall or an empty search, never twice inside 60 days, never more than
 * three times a year, and never again after someone has rated.
 *
 * Everything is device-local on purpose. This is a courtesy, not a metric, and
 * a reinstall resetting it costs nothing.
 */

const KEY = 'gl.reviewMoments.v1';

/** The install day and the first hours after it are off limits. */
const SETTLE_MS = 12 * 60 * 60 * 1000;
const COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_PER_YEAR = 3;
/** Gap after the moment itself, so the card never lands under a thumb. */
const AFTER_MOMENT_MS = 800;
/** An open-day nudge waits until the launch sequence is long gone. */
const AFTER_OPEN_MS = 6000;
/** Back from the background after this long counts as a fresh session. */
const NEW_SESSION_AFTER_MS = 30 * 60 * 1000;

export type NoteOutcome = 'rated' | 'later' | 'hi';
export type NoteReason = 'save' | 'read' | 'open';

interface State {
  firstOpenAt: number | null;
  saves: number;
  /** The third-save moment fires once; after that saves only count. */
  saveMomentUsed: boolean;
  finishedReads: number;
  readDays: number;
  lastReadDay: string | null;
  openDays: number;
  lastOpenDay: string | null;
  /** Timestamps of every time the note was shown, trimmed to the last year. */
  shownAt: number[];
  rated: boolean;
}

const EMPTY: State = {
  firstOpenAt: null,
  saves: 0,
  saveMomentUsed: false,
  finishedReads: 0,
  readDays: 0,
  lastReadDay: null,
  openDays: 0,
  lastOpenDay: null,
  shownAt: [],
  rated: false,
};

// Session flags live in memory: they are exactly as long-lived as the session.
let sessionIsInstall = false;
let suppressed = false;
let backgroundedAt: number | null = null;

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function load(): Promise<State> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<State>) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

// Writes are chained so a save and a read finishing together cannot each read
// the old state and overwrite the other's count.
let queue: Promise<unknown> = Promise.resolve();
function update<T>(fn: (s: State) => T): Promise<T> {
  const run = queue.then(async () => {
    const s = await load();
    const out = fn(s);
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // A courtesy counter must never break anything.
    }
    return out;
  });
  queue = run.catch(() => {});
  return run;
}

function eligible(s: State, now: number): boolean {
  if (suppressed || sessionIsInstall || s.rated) return false;
  if (s.firstOpenAt == null) return false;
  if (now - s.firstOpenAt < SETTLE_MS) return false;
  if (dayKey(now) === dayKey(s.firstOpenAt)) return false;
  const recent = s.shownAt.filter((t) => now - t < YEAR_MS);
  if (recent.length >= MAX_PER_YEAR) return false;
  const last = recent.length ? Math.max(...recent) : 0;
  if (last && now - last < COOLDOWN_MS) return false;
  return true;
}

// ── The tiny store the global <BackstageNoteHost /> listens to ──────────────

type Listener = (reason: NoteReason) => void;
let listener: Listener | null = null;
let pending: ReturnType<typeof setTimeout> | null = null;

export function onNoteRequested(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

function request(reason: NoteReason, delay: number) {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    // Re-checked at the moment of showing: the paywall may have opened in the
    // gap, and that session is no longer one to ask in.
    if (suppressed) return;
    listener?.(reason);
  }, delay);
}

// ── Recording ───────────────────────────────────────────────────────────────

/**
 * Call on launch and on every return to the foreground. Counts distinct days,
 * starts a new session after a long absence, and may queue the third-day nudge.
 */
export function recordAppOpen(): Promise<void> {
  const now = Date.now();
  if (backgroundedAt != null && now - backgroundedAt > NEW_SESSION_AFTER_MS) {
    suppressed = false;
    sessionIsInstall = false;
  }
  backgroundedAt = null;
  return update((s) => {
    if (s.firstOpenAt == null) {
      s.firstOpenAt = now;
      sessionIsInstall = true;
    }
    const today = dayKey(now);
    if (s.lastOpenDay !== today) {
      s.lastOpenDay = today;
      s.openDays += 1;
      if (s.openDays >= 3 && s.saves >= 1 && eligible(s, now)) return true;
    }
    return false;
  }).then((fire) => {
    if (fire) request('open', AFTER_OPEN_MS);
  });
}

/** Call when the app leaves the foreground, so a long absence starts a new session. */
export function recordAppBackground() {
  backgroundedAt = Date.now();
}

/** A save that the server accepted. */
export function recordSave(): Promise<void> {
  const now = Date.now();
  return update((s) => {
    s.saves += 1;
    if (!s.saveMomentUsed && s.saves >= 3 && eligible(s, now)) {
      s.saveMomentUsed = true;
      return true;
    }
    return false;
  }).then((fire) => {
    if (fire) request('save', AFTER_MOMENT_MS);
  });
}

/** A speech read to its last line, with real time spent on it. */
export function recordFinishedRead(): Promise<void> {
  const now = Date.now();
  return update((s) => {
    s.finishedReads += 1;
    const today = dayKey(now);
    if (s.lastReadDay !== today) {
      s.lastReadDay = today;
      s.readDays += 1;
    }
    return s.readDays >= 2 && eligible(s, now);
  }).then((fire) => {
    if (fire) request('read', AFTER_MOMENT_MS);
  });
}

/** The paywall, an error, an empty search: not a session to ask in. */
export function suppressThisSession() {
  suppressed = true;
  if (pending) {
    clearTimeout(pending);
    pending = null;
  }
}

export async function shouldOfferNote(): Promise<boolean> {
  return eligible(await load(), Date.now());
}

/**
 * Safe to call twice for one showing (once as it appears, once with the
 * answer): a second call within ten minutes updates the outcome without
 * spending another of the year's three.
 */
export function markNoteShown(outcome: NoteOutcome): Promise<void> {
  const now = Date.now();
  return update((s) => {
    const kept = s.shownAt.filter((t) => now - t < YEAR_MS);
    const last = kept.length ? kept[kept.length - 1] : 0;
    s.shownAt = last && now - last < 10 * 60 * 1000 ? kept : [...kept, now];
    if (outcome === 'rated') s.rated = true;
  });
}

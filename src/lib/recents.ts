import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Monologue } from '../data/monologues';
import type { Medium } from '../theme/medium';
import { clock } from './segments';

/**
 * The pieces you opened last, on this device only.
 *
 * The server remembers the pieces you SAVED and when you last worked on them;
 * it remembers nothing about a piece you only read. The home's pick-it-up card
 * needs the second kind, because inside a trial most of what somebody opens is
 * never saved, and the card's whole job is to be the way back to it.
 *
 * Device-local for the same reasons as the search history: too small to
 * police, useful before there is an account, and never worth a request. It is
 * cleared with the rest on sign out so the next account does not inherit it.
 */

const KEY = 'ghostlight.recents.v1';
const MAX = 8;

export interface RecentPiece {
  id: string;
  character: string;
  source: string;
  medium: Medium;
  /** ISO. The last time the reader opened on it. */
  openedAt: string;
  /** Seconds the saved cut runs, when there is one. */
  cutSeconds?: number;
  /** Times the run sheet reached the curtain on it. */
  runs?: number;
  offBook?: boolean;
}

function coerce(value: unknown): RecentPiece | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || typeof v.character !== 'string' || typeof v.openedAt !== 'string') return null;
  return {
    id: v.id,
    character: v.character,
    source: typeof v.source === 'string' ? v.source : '',
    medium: v.medium === 'screen' ? 'screen' : 'theatre',
    openedAt: v.openedAt,
    cutSeconds: typeof v.cutSeconds === 'number' ? v.cutSeconds : undefined,
    runs: typeof v.runs === 'number' ? v.runs : undefined,
    offBook: v.offBook === true ? true : undefined,
  };
}

export async function loadRecents(): Promise<RecentPiece[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(coerce).filter((x): x is RecentPiece => x !== null);
  } catch {
    return [];
  }
}

async function save(list: RecentPiece[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // A full disk must not break reading.
  }
}

/**
 * The reader opened on a piece: it goes to the front, keeping whatever the
 * trail already knew about it. The house rides along so the card reopens the
 * piece in the colour it was read in.
 */
export async function touchRecent(m: Pick<Monologue, 'id' | 'character' | 'source'>, medium: Medium): Promise<void> {
  const prev = await loadRecents();
  const had = prev.find((p) => p.id === m.id);
  const next: RecentPiece = {
    ...had,
    id: m.id,
    character: m.character,
    source: m.source,
    medium,
    openedAt: new Date().toISOString(),
  };
  await save([next, ...prev.filter((p) => p.id !== m.id)]);
}

/** Something happened to a piece on the trail: a cut kept or cleared, a run finished, off book claimed. */
export async function noteRecent(
  id: string,
  patch: { cutSeconds?: number | null; ran?: boolean; offBook?: boolean },
): Promise<void> {
  const prev = await loadRecents();
  const i = prev.findIndex((p) => p.id === id);
  if (i < 0) return;
  const p = { ...prev[i] };
  if (patch.cutSeconds !== undefined) p.cutSeconds = patch.cutSeconds ?? undefined;
  if (patch.ran) p.runs = (p.runs ?? 0) + 1;
  if (patch.offBook !== undefined) p.offBook = patch.offBook || undefined;
  const next = [...prev];
  next[i] = p;
  await save(next);
}

export async function forgetRecent(id: string): Promise<void> {
  const prev = await loadRecents();
  await save(prev.filter((p) => p.id !== id));
}

export async function clearRecents(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Cosmetic.
  }
}

/** "cut to 1:40 · run twice · off book", or nothing, for the line under the name. */
export function trailOf(p: RecentPiece): string {
  const bits: string[] = [];
  if (p.cutSeconds) bits.push(`cut to ${clock(p.cutSeconds)}`);
  if (p.runs) bits.push(p.runs === 1 ? 'run once' : p.runs === 2 ? 'run twice' : `run ${p.runs} times`);
  if (p.offBook) bits.push('off book');
  return bits.join(' · ');
}

/** Inside this many days a piece still counts as the one you are working on. */
export const RECENT_DAYS = 14;

export function isFresh(p: RecentPiece, now = Date.now()): boolean {
  const t = Date.parse(p.openedAt);
  return Number.isFinite(t) && now - t < RECENT_DAYS * 86_400_000;
}

import type { ScriptSummary } from '../api/rehearsal';

/**
 * The Scene room's shelf of the actor's own sides, made sense of: what they
 * are working on now, the rest in the order they choose, a find that looks
 * inside the scripts, and the genres to narrow by. Pure, so it is tested.
 */

export type ShelfSort = 'recent' | 'newest' | 'title' | 'scenes';

export const SHELF_SORTS: { key: ShelfSort; label: string; short: string }[] = [
  { key: 'recent', label: 'Worked on last', short: 'recent' },
  { key: 'newest', label: 'Newest first', short: 'newest' },
  { key: 'title', label: 'By title', short: 'a to z' },
  { key: 'scenes', label: 'Most scenes', short: 'most scenes' },
];

/** Grouped once the shelf is this long; below it one list is clearer. */
export const GROUP_FROM = 6;
/** A find field and genre chips from here. */
export const FIND_FROM = 8;
/** "Working on" is anything touched in this many days. */
export const WORKING_DAYS = 14;
/** The rest shows this many until asked for all. */
export const REST_FOLDED = 5;

const DAY = 86_400_000;
const stamp = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() || 0 : 0);

/** The last time the actor did anything with it: ran a scene, opened it here, or brought it in. */
export function lastActive(s: ScriptSummary, touched?: string | null): number {
  return Math.max(stamp(s.last_rehearsed_at), stamp(touched), stamp(s.created_at));
}

const reading = (s: ScriptSummary) => s.processing_status !== 'completed' && s.processing_status !== 'failed';

/**
 * Working on: still being read, or touched in the last fortnight. In the
 * order the shelf came in (the actor's own arrangement). The rest: everything
 * else. Below GROUP_FROM nothing is split.
 */
export function groupShelf(
  list: ScriptSummary[],
  touched: Record<number, string>,
  now = Date.now(),
): { working: ScriptSummary[]; rest: ScriptSummary[]; grouped: boolean } {
  if (list.length < GROUP_FROM) return { working: list, rest: [], grouped: false };
  const working: ScriptSummary[] = [];
  const rest: ScriptSummary[] = [];
  for (const s of list) {
    if (reading(s) || now - lastActive(s, touched[s.id]) <= WORKING_DAYS * DAY) working.push(s);
    else rest.push(s);
  }
  // Everything is fresh (a new actor's first week) or nothing is: one list says it better.
  if (working.length === 0 || rest.length === 0) return { working: list, rest: [], grouped: false };
  return { working, rest, grouped: true };
}

export function sortShelf(list: ScriptSummary[], sort: ShelfSort, touched: Record<number, string>): ScriptSummary[] {
  const az = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  const out = [...list];
  switch (sort) {
    case 'newest': return out.sort((a, b) => stamp(b.created_at) - stamp(a.created_at));
    case 'title': return out.sort((a, b) => az(a.title, b.title));
    case 'scenes': return out.sort((a, b) => b.num_scenes_extracted - a.num_scenes_extracted || az(a.title, b.title));
    default: return out.sort((a, b) => lastActive(b, touched[b.id]) - lastActive(a, touched[a.id]));
  }
}

const fold = (t: string) => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Every genre on the shelf, the most common first. */
export function shelfGenres(list: ScriptSummary[], max = 6): string[] {
  const n = new Map<string, number>();
  for (const s of list) {
    const gs = s.genres?.length ? s.genres : s.genre ? [s.genre] : [];
    for (const g of gs) {
      const k = g.trim();
      if (k) n.set(k, (n.get(k) ?? 0) + 1);
    }
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([g]) => g);
}

export function hasGenre(s: ScriptSummary, genre: string): boolean {
  const gs = s.genres?.length ? s.genres : s.genre ? [s.genre] : [];
  return gs.some((g) => fold(g) === fold(genre));
}

/**
 * A find that looks inside: the title first, then who wrote it, a part in it,
 * a scene of it. Each hit says why it came up when the title is not the reason.
 */
export function findInShelf(list: ScriptSummary[], q: string): { script: ScriptSummary; why: string | null }[] {
  const needle = fold(q.trim());
  if (!needle) return list.map((script) => ({ script, why: null }));
  const scored: { script: ScriptSummary; why: string | null; rank: number }[] = [];
  for (const s of list) {
    if (fold(s.title).includes(needle)) { scored.push({ script: s, why: null, rank: fold(s.title).startsWith(needle) ? 0 : 1 }); continue; }
    if (s.author && fold(s.author).includes(needle)) { scored.push({ script: s, why: `by ${s.author}`, rank: 2 }); continue; }
    const part = s.characters.find((c) => c.name && fold(c.name).includes(needle));
    if (part) { scored.push({ script: s, why: `a part: ${part.name}`, rank: 3 }); continue; }
    const scene = s.scene_titles.find((t) => fold(t).includes(needle));
    if (scene) { scored.push({ script: s, why: `a scene: ${scene}`, rank: 4 }); continue; }
    if ((s.genres ?? []).some((g) => fold(g).includes(needle))) scored.push({ script: s, why: null, rank: 5 });
  }
  return scored.sort((a, b) => a.rank - b.rank).map(({ script, why }) => ({ script, why }));
}

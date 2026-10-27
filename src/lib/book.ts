import type { Audition } from '../api/auditions';
import { attachedPiece } from '../api/auditions';
import type { Monologue, Tone } from '../data/monologues';
import { formatDuration } from '../data/monologues';

/**
 * How the book sorts itself.
 *
 * Nobody keeps a filing system in a library app, so there are no folders. The
 * shelves below appear on their own as the book grows, each only when it has
 * something on it, and a piece sits on the first shelf it qualifies for. The
 * one thing done by hand is the tick: off book, into the pocket at the top.
 *
 * Everything here is pure and takes `now`, so it can be read and tested
 * without a screen.
 */

/** Under this many pieces the book is one plain list; the pocket still shows. */
export const SHELVES_FROM = 5;
/** From this many, the shelf gets a tone row and the top gets a find field. */
export const FIND_FROM = 12;
const NEW_DAYS = 30;
const DAY = 86_400_000;

export interface RoomPiece {
  item: Monologue;
  audition: Audition;
}

export interface Book {
  /** Off book. Order: most recently worked on first. */
  pocket: Monologue[];
  /** Attached to an upcoming audition, soonest first. May repeat a pocket piece. */
  room: RoomPiece[];
  /** The rest, by house, the one you last touched first. */
  stage: Monologue[];
  screen: Monologue[];
  /** Everything that is not in the pocket, in the server's order. For the flat book. */
  flat: Monologue[];
  /** Whether the shelves are shown at all, or the book is still one list. */
  shelved: boolean;
  /** The tones present on the shelf, for the chip row. */
  tones: Tone[];
}

function stamp(iso: string | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** How the shelf is ordered. Touched last first is the book's own way; the rest are the actor's. */
export type BookOrder = 'touched' | 'newest' | 'title' | 'work' | 'length' | 'mine';
/** Each order's name in the sheet, and the one word the shelf's head says for it (it has a line, not a paragraph). */
export const BOOK_ORDERS: { key: BookOrder; label: string; short: string }[] = [
  { key: 'mine', label: 'My order', short: 'yours' },
  { key: 'touched', label: 'Touched last', short: 'recent' },
  { key: 'newest', label: 'Newest first', short: 'newest' },
  { key: 'title', label: 'By title', short: 'a to z' },
  { key: 'work', label: 'By play or film', short: 'by work' },
  { key: 'length', label: 'Shortest first', short: 'shortest' },
];

/** The actor's own order: the pages in the order they were put, any new one after them, newest first. */
export function byHand(hand: (string | number)[]): (a: Monologue, b: Monologue) => number {
  const at = new Map(hand.map((id, i) => [String(id), i]));
  const fallback = compareBy('touched');
  return (a, b) => {
    const x = at.get(String(a.id));
    const y = at.get(String(b.id));
    if (x === undefined && y === undefined) return fallback(a, b);
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    return x - y;
  };
}

/** The comparator for an order, for the shelf and for a found list alike. */
export function compareBy(order: BookOrder): (a: Monologue, b: Monologue) => number {
  const touched = (m: Monologue) => Math.max(stamp(m.lastStudiedAt), stamp(m.savedAt));
  const az = (x: string | undefined, y: string | undefined) => (x ?? '').localeCompare(y ?? '', undefined, { sensitivity: 'base' });
  switch (order) {
    case 'newest': return (a, b) => stamp(b.savedAt) - stamp(a.savedAt) || touched(b) - touched(a);
    case 'title': return (a, b) => az(a.title, b.title) || az(a.character, b.character);
    case 'work': return (a, b) => az(a.source, b.source) || az(a.title, b.title);
    case 'length': return (a, b) => a.duration - b.duration || az(a.title, b.title);
    default: return (a, b) => touched(b) - touched(a);
  }
}

export function shelve(items: Monologue[], auditions: Audition[], now = Date.now(), order: BookOrder = 'touched'): Book {
  const pocket = items
    .filter((m) => m.offBook)
    .sort((a, b) => stamp(b.lastStudiedAt) - stamp(a.lastStudiedAt) || stamp(b.savedAt) - stamp(a.savedAt));
  const flat = items.filter((m) => !m.offBook);

  const byId = new Map(items.map((m) => [m.id, m]));
  const room: RoomPiece[] = auditions
    .filter((a) => a.scope === 'upcoming')
    .map((a) => {
      const p = attachedPiece(a);
      const item = p?.monologue_id != null ? byId.get(String(p.monologue_id)) : undefined;
      return item ? { item, audition: a } : null;
    })
    .filter((x): x is RoomPiece => x !== null)
    .sort((a, b) => stamp(a.audition.when ?? undefined) - stamp(b.audition.when ?? undefined));
  const inRoom = new Set(room.map((r) => r.item.id));

  // One shelf for the rest. There were two more, "working on" and "new", cut
  // by how long ago you opened or saved a piece, and a page moved between them
  // on its own as the days passed, which read as the book shuffling itself. The
  // row's own line still says "worked on Tue" or "new"; the shelf just keeps
  // what you touched last at the top.
  const shelf = flat.filter((m) => !inRoom.has(m.id)).sort(compareBy(order));
  const stage = shelf.filter((m) => m.sourceType === 'play');
  const screen = shelf.filter((m) => m.sourceType !== 'play');

  const tones: Tone[] = (['dramatic', 'comedic', 'seriocomic'] as Tone[]).filter((t) => shelf.some((m) => m.tone === t));

  return {
    pocket,
    room,
    stage,
    screen,
    flat,
    shelved: items.length >= SHELVES_FROM,
    tones,
  };
}

/** "find in your book": title, who speaks it, the work, the author. */
export function findInBook(items: Monologue[], q: string): Monologue[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((m) =>
    [m.title, m.character, m.source, m.author].some((f) => f?.toLowerCase().includes(needle)),
  );
}

export const TONE_LABEL: Record<Tone, string> = {
  dramatic: 'dramatic',
  comedic: 'comic',
  seriocomic: 'seriocomic',
};

/** "worked on today", "worked on Tue", "worked on 3 weeks ago". */
export function workedOn(iso: string, now = Date.now()): string {
  const t = stamp(iso);
  const days = Math.floor((now - t) / DAY);
  if (days <= 0) return 'worked on today';
  if (days === 1) return 'worked on yesterday';
  if (days < 7) return `worked on ${new Date(t).toLocaleDateString(undefined, { weekday: 'short' })}`;
  const weeks = Math.round(days / 7);
  return weeks <= 1 ? 'worked on last week' : `worked on ${weeks} weeks ago`;
}

/**
 * The one quiet line under a row: running time, then the most telling thing
 * about your copy of it. Off book pieces say so; otherwise when you last had it
 * open; a piece you saved and never opened is simply new.
 */
export function rowMeta(m: Monologue, now = Date.now()): string {
  const parts = [formatDuration(m.duration)];
  if (m.offBook) parts.push('off book');
  else if (m.lastStudiedAt) parts.push(workedOn(m.lastStudiedAt, now));
  else if (m.savedAt && now - stamp(m.savedAt) < NEW_DAYS * DAY) parts.push('new');
  return parts.join(' · ');
}

/**
 * Takes: the tape room's own shelf, on the phone and nowhere else.
 *
 * The video files live in the app's documents folder (tapes/), the list of
 * them in AsyncStorage. Nothing is uploaded and nothing touches the database:
 * a take is the actor's until they save it to Photos or send it. Deleting the
 * app deletes the takes, which is why starring one offers Photos at once.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';

const KEY = 'ghostlight:takes:v1';
const LAST_KEY = 'ghostlight:tape:last';

/** The room with no piece in it: tape your own sides, no prompter. */
export const FREE_TAPE = 'free';
/** The slate: a take of your own name, height and town, from the slate in the room's settings. */
export const SLATE_TAPE = 'slate';

/** The piece the actor last taped, so the bar's Tape button opens straight on it. */
export async function lastTapePiece(): Promise<string | null> {
  try { return await AsyncStorage.getItem(LAST_KEY); } catch { return null; }
}

export async function rememberTapePiece(id: string): Promise<void> {
  try { await AsyncStorage.setItem(LAST_KEY, id); } catch { /* a convenience */ }
}

export interface Take {
  id: string;
  /** The monologue it is a take of. */
  pieceId: string;
  /** 1, 2, 3… within the piece, never reused. */
  number: number;
  /** The file's name in tapes/. */
  file: string;
  createdAt: number;
  /** How long the file runs, and where the take ends inside it (the cut is past it). */
  durationMs: number;
  endMs: number;
  /** Where the take starts inside the file, once trimmed by hand. */
  startMs?: number;
  starred: boolean;
  /** The piece's name and play when it was taped, for the library. Absent on the earliest takes. */
  character?: string;
  source?: string;
  /** Degrees the phone was turned while taping (0 upright, 90 or -90 on its side). */
  turn?: number;
  /** A still from the take, in tapes/, for the library. */
  thumb?: string;
  /** The audition on the Board it was taped for, if any. */
  auditionId?: number;
}

function tapesDir(): Directory {
  const d = new Directory(Paths.document, 'tapes');
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

export function takeFile(take: Pick<Take, 'file'>): File {
  return new File(tapesDir(), take.file);
}

async function readAll(): Promise<Take[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Take[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeAll(list: Take[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

/** A piece's takes, newest last, with files that are still there. */
export async function takesFor(pieceId: string): Promise<Take[]> {
  const all = await readAll();
  return all.filter((t) => t.pieceId === pieceId && takeFile(t).exists).sort((a, b) => a.number - b.number);
}

/** Keep a fresh recording as the piece's next take. */
export async function addTake(
  pieceId: string,
  recordedUri: string,
  durationMs: number,
  endMs: number,
  meta: { character?: string; source?: string; turn?: number; auditionId?: number } = {},
): Promise<Take> {
  const all = await readAll();
  const number = all.filter((t) => t.pieceId === pieceId).reduce((m, t) => Math.max(m, t.number), 0) + 1;
  const id = `${pieceId}-${Date.now().toString(36)}`;
  const ext = recordedUri.toLowerCase().endsWith('.mp4') ? 'mp4' : 'mov';
  const file = `${id}.${ext}`;
  new File(recordedUri).move(new File(tapesDir(), file));
  const take: Take = { id, pieceId, number, file, createdAt: Date.now(), durationMs, endMs, starred: false, ...meta };
  take.thumb = await stillOf(take);
  await writeAll([...all, take]);
  return take;
}

/** A still from a take, a second in (or halfway through a short one), kept beside it. */
async function stillOf(take: Take): Promise<string | undefined> {
  try {
    const at = Math.min(1000, Math.max(0, take.endMs / 2));
    const { uri } = await VideoThumbnails.getThumbnailAsync(takeFile(take).uri, { time: at, quality: 0.6 });
    const name = `${take.id}.jpg`;
    const dest = new File(tapesDir(), name);
    if (dest.exists) dest.delete();
    new File(uri).move(dest);
    return name;
  } catch {
    return undefined;
  }
}

export function thumbFile(take: Take): File | null {
  return take.thumb ? new File(tapesDir(), take.thumb) : null;
}

/** Every take on the phone, newest first. A take without a still gets one now. */
export async function allTakes(): Promise<Take[]> {
  const all = (await readAll()).filter((t) => takeFile(t).exists);
  let changed = false;
  for (const t of all) {
    if (t.thumb && thumbFile(t)?.exists) continue;
    t.thumb = await stillOf(t);
    changed = changed || Boolean(t.thumb);
  }
  if (changed) await writeAll(all);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** One take by its id. */
export async function getTake(id: string): Promise<Take | null> {
  return (await readAll()).find((t) => t.id === id) ?? null;
}

/** The take's start and end, trimmed by hand in review. */
export async function setTrim(id: string, startMs: number, endMs: number): Promise<void> {
  const all = await readAll();
  await writeAll(all.map((t) => (t.id === id ? { ...t, startMs, endMs } : t)));
}

export async function setStarred(id: string, starred: boolean): Promise<void> {
  const all = await readAll();
  await writeAll(all.map((t) => (t.id === id ? { ...t, starred } : t)));
}

export async function deleteTake(id: string): Promise<void> {
  const all = await readAll();
  const take = all.find((t) => t.id === id);
  if (take) {
    try { takeFile(take).delete(); } catch { /* already gone */ }
    try { thumbFile(take)?.delete(); } catch { /* already gone */ }
  }
  await writeAll(all.filter((t) => t.id !== id));
}

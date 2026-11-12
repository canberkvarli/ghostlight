import AsyncStorage from '@react-native-async-storage/async-storage';

import type { GuidedPick, GuidedScene } from '../api/rehearsal';
import type { ScenePayload } from '../rehearsal/contract';
import { sameCharacter } from '../rehearsal/contract';
import { supabase } from './supabase';

/**
 * The first scenes: what the phone remembers about them, and how each key is
 * spoken of. Three scenes, one a key, live on the server (GET /guided lists
 * them); a server that predates them lists none, and the single guided scene
 * stands in so the door still opens.
 */

const SEEN_KEY = 'ghostlight:demo.seen.v1';
const DONE_KEY = 'ghostlight:demo.done.v1';

/** The stranger has been shown the first scenes (or walked past them). Decided once. */
const HAD_ACCOUNT = 'ghostlight:had-account.v1';

/** This phone has been signed in before: signed out, it goes to Search, not the front door again. */
export async function hadAccount(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(HAD_ACCOUNT)) === '1'; } catch { return false; }
}
export async function markHadAccount(): Promise<void> {
  try { await AsyncStorage.setItem(HAD_ACCOUNT, '1'); } catch { /* the front door again, at worst */ }
}

/** An account counts as new for this long after it was made. Long enough to finish signing up, no longer. */
const NEW_FOR_MS = 60 * 60 * 1000;

/**
 * Whether this account should be asked the welcome's questions: made in the
 * last hour, and never answered on any device. Someone signing in to an
 * account they already had is not a first-timer, wherever they signed in.
 */
export function isNewAccount(user: { created_at?: string; user_metadata?: Record<string, unknown> } | null | undefined, now = Date.now()): boolean {
  if (!user) return false;
  const meta = user.user_metadata ?? {};
  if (meta.welcomed === '1' || meta.working_on) return false;
  const made = Date.parse(user.created_at ?? '');
  return Number.isFinite(made) && now - made <= NEW_FOR_MS;
}

/** This phone has put the welcome to the account signed in now. Keyed by account. */
const WELCOMED = 'ghostlight:welcomed.v1:';
export async function welcomedHere(userId: string): Promise<boolean> {
  try { return (await AsyncStorage.getItem(WELCOMED + userId)) === '1'; } catch { return true; }
}
export async function markWelcomed(userId?: string): Promise<void> {
  try {
    const id = userId ?? (await supabase.auth.getSession()).data.session?.user.id;
    if (id) await AsyncStorage.setItem(WELCOMED + id, '1');
  } catch { /* asked again at worst, and the account's own flag stops that */ }
}

export async function demoSeen(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(SEEN_KEY)) === '1'; } catch { return true; }
}
export async function markDemoSeen(): Promise<void> {
  try { await AsyncStorage.setItem(SEEN_KEY, '1'); } catch { /* the door opens again next time, no harm */ }
}

/** The keys of the first scenes this phone has run to the end. */
export async function demoDone(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(DONE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}
export async function markDemoDone(key: string): Promise<string[]> {
  const done = await demoDone();
  if (!done.includes(key)) done.push(key);
  try { await AsyncStorage.setItem(DONE_KEY, JSON.stringify(done)); } catch { /* ignore */ }
  return done;
}

/** How each key is spoken of on the cards. */
export const KEY_WORDS: Record<string, { eyebrow: string; tone: string }> = {
  fight: { eyebrow: 'A FIGHT', tone: 'something is missing and somebody knows where it went.' },
  flirt: { eyebrow: 'A FLIRT', tone: 'the last table in the place, and one seat at it.' },
  confession: { eyebrow: 'A CONFESSION', tone: 'a letter that was not meant to be read has been read.' },
  late: { eyebrow: 'A FIRST SCENE', tone: 'somebody waited an hour. somebody finally shows up.' },
};

/**
 * The first scenes to offer: the server's three, or the one it always had as a
 * card of its own. That older answer names only the part it would cast; the
 * scene itself, once fetched, names both, so the actor can be the one who
 * waited as well as the one who is late.
 */
export function firstScenes(pick: GuidedPick | undefined, scene?: ScenePayload | null): GuidedScene[] {
  if (!pick) return [];
  if (pick.scenes && pick.scenes.length) return pick.scenes;
  const names = scene?.characters?.length ? scene.characters : [pick.character];
  const characters = names.map(name => ({
    name,
    line: null,
    first_line: scene?.lines.find(l => sameCharacter(l.character, name))?.index ?? null,
  }));
  return [{ key: 'late', scene_id: pick.scene_id, title: 'Late', hook: 'Riley waited an hour. Alex finally shows up.', characters }];
}

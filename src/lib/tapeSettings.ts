/**
 * The tape room's settings, on the phone: the sound cues, the beat after
 * "action", which camera, and the slate. Set once, kept.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'ghostlight:tape:settings:v1';

export interface Slate {
  name: string;
  height: string;
  location: string;
  /** Agent, manager, or nothing. */
  rep: string;
}

export interface TapeSettings {
  /** A tone when it rolls and when it cuts, for a phone across the room. */
  tones: boolean;
  /** Seconds between "action" and rolling, to settle into it. */
  beat: 0 | 2 | 3;
  facing: 'front' | 'back';
  /** On "cut": the take goes to Tapes and the room is ready again, or it plays straight back. */
  afterCut: 'tapes' | 'play';
  slate: Slate;
}

export const DEFAULT_SETTINGS: TapeSettings = {
  tones: true,
  beat: 0,
  facing: 'front',
  afterCut: 'tapes',
  slate: { name: '', height: '', location: '', rep: '' },
};

export async function loadTapeSettings(): Promise<TapeSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const v = JSON.parse(raw) as Partial<TapeSettings>;
    return { ...DEFAULT_SETTINGS, ...v, slate: { ...DEFAULT_SETTINGS.slate, ...(v.slate ?? {}) } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveTapeSettings(s: TapeSettings): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(s)); } catch { /* a convenience */ }
}

/** The slate's lines, as the prompter shows them. Empty until a name is in. */
export function slateLines(s: Slate, role?: string): string[] {
  const name = s.name.trim();
  if (!name) return [];
  const lines = [`Hi, I'm ${name}.`];
  const where = [s.height.trim(), s.location.trim() ? `based in ${s.location.trim()}` : ''].filter(Boolean).join(', ');
  if (where) lines.push(`${where.charAt(0).toUpperCase()}${where.slice(1)}.`);
  if (s.rep.trim()) lines.push(`With ${s.rep.trim()}.`);
  if (role?.trim()) lines.push(`I'll be reading for ${role.trim()}.`);
  return lines;
}

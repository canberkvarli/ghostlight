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
  /** 4K is sharper and about four times the size. */
  quality: '1080p' | '2160p';
  /** Stabilization on the back camera (the front one stays as it is: it crops a face). */
  steady: boolean;
  /** Save and Send put your newest slate in front of the take, as one file. */
  slateFirst: boolean;
  slate: Slate;
}

export const DEFAULT_SETTINGS: TapeSettings = {
  tones: true,
  beat: 0,
  facing: 'front',
  afterCut: 'tapes',
  quality: '1080p',
  steady: true,
  slateFirst: true,
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

/**
 * The file's name the way casting asks: Lastname_Firstname_Role. Without a
 * slate name it falls back to the role and the take.
 */
export function castingName(slate: Slate, role: string | undefined, take: number, joined: boolean): string {
  const clean = (x: string) => x.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '').trim();
  const parts = slate.name.trim().split(/\s+/).filter(Boolean);
  const r = clean(role ?? '');
  if (parts.length) {
    const first = clean(parts[0]);
    const last = clean(parts.slice(1).join('')) || first;
    const name = [last, last === first ? '' : first, r].filter(Boolean).join('_');
    return joined ? name : `${name}_Take${take}`;
  }
  return [r || 'Take', `Take${take}`].join('_');
}

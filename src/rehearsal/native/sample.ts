/**
 * Hearing a voice before casting it: the character's first line in that
 * voice, asked for the way the run asks for every line, so it is the same
 * cached audio the scene will use, synthesised once per voice and never
 * again. One sample sounds at a time; asking for another stops the last.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

import { pollAudio, requestAudio } from '../../api/rehearsal';

const WAIT_MS = 900;
const TRIES = 10;

let current: { player: AudioPlayer; stop: () => void } | null = null;

/** Samples pulled down ahead of the tap, by scene, line and voice. */
const primed = new Map<string, string>();
const priming = new Map<string, Promise<string | null>>();
const sampleDir = () => { const d = new Directory(Paths.cache, 'samples'); if (!d.exists) d.create(); return d; };

async function resolveUrl(sceneId: number, lineIndex: number, voice: string): Promise<string | null> {
  try {
    const first = await requestAudio(sceneId, lineIndex, voice);
    let url = first.url;
    for (let i = 0; !url && i < TRIES; i++) {
      await new Promise(r => setTimeout(r, WAIT_MS));
      url = await pollAudio(first.key);
    }
    return url ?? null;
  } catch { return null; }
}

/**
 * Pull a sample into the cache before anyone asks for it, so the hear icon
 * plays at once. Quiet on failure: the tap falls back to the network.
 */
export function primeSample(sceneId: number, lineIndex: number, voice: string): Promise<string | null> {
  const key = `${sceneId}-${lineIndex}-${voice}`;
  const have = primed.get(key);
  if (have) return Promise.resolve(have);
  const going = priming.get(key);
  if (going) return going;
  const p = (async () => {
    try {
      const file = new File(sampleDir(), `${key}.mp3`);
      if (!file.exists) {
        const url = await resolveUrl(sceneId, lineIndex, voice);
        if (!url) return null;
        await File.downloadFileAsync(url, file);
      }
      primed.set(key, file.uri);
      return file.uri;
    } catch { return null; } finally { priming.delete(key); }
  })();
  priming.set(key, p);
  return p;
}
let asked = 0; // each request is a generation; an older one still waiting gives up

export function stopSample() {
  if (!current) return;
  const { player } = current;
  current = null;
  try { player.pause(); player.remove(); } catch { /* gone */ }
}

/**
 * Plays the line and resolves when it has finished, or when it could not be
 * had. `onState` reports the wait and the sounding so a button can show them.
 */
let modeSet: Promise<void> | null = null;
/** A phone on silent plays nothing unless the session says so; the run sets its own mode later. */
function playableOnSilent(): Promise<void> {
  return (modeSet ??= setAudioModeAsync({ playsInSilentMode: true }).catch(() => { modeSet = null; }));
}

export async function playSample(
  sceneId: number,
  lineIndex: number,
  voice: string,
  onState: (s: 'waiting' | 'sounding' | 'done') => void,
): Promise<void> {
  stopSample();
  const mine = ++asked;
  onState('waiting');
  // From the cache when it was primed; else the network, and the cache for next time.
  const url: string | null = primed.get(`${sceneId}-${lineIndex}-${voice}`) ?? await primeSample(sceneId, lineIndex, voice) ?? await resolveUrl(sceneId, lineIndex, voice);
  if (!url || mine !== asked) { onState('done'); return; }
  await playableOnSilent();
  if (mine !== asked) { onState('done'); return; }
  const player = createAudioPlayer({ uri: url }, { updateInterval: 250 });
  await new Promise<void>(resolve => {
    const finish = () => { sub.remove(); if (current?.player === player) current = null; try { player.remove(); } catch { /* gone */ } onState('done'); resolve(); };
    const sub = player.addListener('playbackStatusUpdate', s => { if (s.didJustFinish || s.error) finish(); });
    current = { player, stop: finish };
    onState('sounding');
    try { player.play(); } catch { finish(); }
  });
}

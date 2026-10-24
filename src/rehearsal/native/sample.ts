/**
 * Hearing a voice before casting it: the character's first line in that
 * voice, asked for the way the run asks for every line, so it is the same
 * cached audio the scene will use, synthesised once per voice and never
 * again. One sample sounds at a time; asking for another stops the last.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { pollAudio, requestAudio } from '../../api/rehearsal';

const WAIT_MS = 900;
const TRIES = 10;

let current: { player: AudioPlayer; stop: () => void } | null = null;
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
export async function playSample(
  sceneId: number,
  lineIndex: number,
  voice: string,
  onState: (s: 'waiting' | 'sounding' | 'done') => void,
): Promise<void> {
  stopSample();
  const mine = ++asked;
  onState('waiting');
  let url: string | null = null;
  try {
    const first = await requestAudio(sceneId, lineIndex, voice);
    url = first.url;
    for (let i = 0; !url && i < TRIES && mine === asked; i++) {
      await new Promise(r => setTimeout(r, WAIT_MS));
      url = await pollAudio(first.key);
    }
  } catch {
    url = null;
  }
  if (!url || mine !== asked) { onState('done'); return; }
  const player = createAudioPlayer({ uri: url }, { updateInterval: 250 });
  await new Promise<void>(resolve => {
    const finish = () => { sub.remove(); if (current?.player === player) current = null; try { player.remove(); } catch { /* gone */ } onState('done'); resolve(); };
    const sub = player.addListener('playbackStatusUpdate', s => { if (s.didJustFinish || s.error) finish(); });
    current = { player, stop: finish };
    onState('sounding');
    try { player.play(); } catch { finish(); }
  });
}

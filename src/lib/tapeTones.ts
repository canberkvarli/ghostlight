/**
 * The tape room's two tones: up when it rolls, down when it cuts. For an
 * actor on their mark with the phone across the room, who cannot see the
 * screen to know whether it heard "action".
 *
 * The roll tone plays before the camera starts and the cut tone after it
 * stops, so neither is in the take. The audio session is put back for the
 * recogniser after each, since a player can reset it.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { TapeEar } from '../rehearsal/native/tape-ear';

/** How long the roll tone sounds before the camera starts. */
export const ROLL_TONE_MS = 380;

let players: { roll: AudioPlayer; cut: AudioPlayer } | null = null;
let mode: Promise<void> | null = null;

function ready() {
  mode ??= setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, interruptionMode: 'mixWithOthers' }).catch(() => { mode = null; });
  players ??= {
    roll: createAudioPlayer(require('../../assets/sounds/tape-roll.wav')),
    cut: createAudioPlayer(require('../../assets/sounds/tape-cut.wav')),
  };
  return players;
}

export async function playTone(which: 'roll' | 'cut'): Promise<void> {
  try {
    const p = ready()[which];
    await mode;
    p.seekTo(0);
    p.play();
  } catch { /* a cue, never a failure */ }
  // The player can leave the session set for playback alone: back to play and record.
  setTimeout(() => TapeEar.speakerOut(), 50);
}

export function releaseTones() {
  try { players?.roll.remove(); players?.cut.remove(); } catch { /* gone */ }
  players = null;
}

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

/**
 * Set up once, when the room opens and before the camera starts: changing
 * the audio session later, just before a recording, can stop the camera
 * from starting it at all (2026-11-10, "I tap record and it won't stop").
 */
export async function prepareTones(): Promise<void> {
  try { ready(); await mode; } catch { /* no tones, then */ }
  TapeEar.speakerOut();
}

/** Play a tone on the session as it is: nothing about the audio is changed here. */
export function playTone(which: 'roll' | 'cut'): void {
  try {
    if (!players) return;
    const p = players[which];
    p.seekTo(0);
    p.play();
  } catch { /* a cue, never a failure */ }
}

export function releaseTones() {
  try { players?.roll.remove(); players?.cut.remove(); } catch { /* gone */ }
  players = null;
}

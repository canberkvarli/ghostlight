/**
 * Partner lines on the phone. One expo-audio player per line, loaded in full
 * before the run needs it, so `duration` is known and `play` is a seek and a
 * start, never a fetch. The engine schedules a line at a time on the clock;
 * a line in the future waits on a timer the player owns, so `stopAll` can
 * take it back.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Device from 'expo-device';

import type { Clock } from './clock';

const LOAD_TIMEOUT_MS = 20_000;

export class LinePlayer {
  private players = new Map<number, AudioPlayer>();
  private durations = new Map<number, number>();
  private pending = new Set<() => void>();
  private sounding = new Set<number>();
  private sessionReady: Promise<void> | null = null;

  constructor(private clock: Clock) {}

  /** Speaker out, microphone in, nothing else mixed over the scene. Once.
   *  The simulator has no input device and play-and-record fails there outright, so it plays only. */
  session(): Promise<void> {
    return (this.sessionReady ??= setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: Device.isDevice,
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }).catch(() => { this.sessionReady = null; }));
  }

  /** Load one line from a local file. Resolves when the whole file is decoded and its length known. */
  async load(lineIndex: number, uri: string): Promise<void> {
    if (this.durations.has(lineIndex)) return; // decoded already; a player without a duration is a failed one, replaced below
    await this.session();
    const stale = this.players.get(lineIndex);
    if (stale) { try { stale.remove(); } catch { /* gone */ } this.players.delete(lineIndex); }
    const player = createAudioPlayer({ uri }, { updateInterval: 250, keepAudioSessionActive: true });
    this.players.set(lineIndex, player);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { sub.remove(); reject(new Error('audio load timed out')); }, LOAD_TIMEOUT_MS);
      const settle = (duration: number) => { clearTimeout(timer); sub.remove(); this.durations.set(lineIndex, duration); if (__DEV__) console.log('[player] loaded', lineIndex, 'duration', duration); resolve(); };
      const sub = player.addListener('playbackStatusUpdate', s => {
        if (s.error) { clearTimeout(timer); sub.remove(); if (__DEV__) console.log('[player] failed', lineIndex, s.error); reject(new Error(s.error)); return; }
        if (s.isLoaded && s.duration > 0) settle(s.duration);
        if (s.didJustFinish) this.sounding.delete(lineIndex);
      });
      if (player.isLoaded && player.duration > 0) settle(player.duration);
    });
    // The status listener above is removed once loaded; this one outlives it to keep `sounding` honest.
    player.addListener('playbackStatusUpdate', s => { if (s.didJustFinish) this.sounding.delete(lineIndex); });
  }

  has(lineIndex: number) { return this.durations.has(lineIndex); }
  duration(lineIndex: number) { return this.durations.get(lineIndex) ?? null; }

  play(lineIndex: number, at: number): boolean {
    const player = this.players.get(lineIndex);
    if (!player || !this.durations.has(lineIndex)) { if (__DEV__) console.log('[player] refuse', lineIndex, 'player', Boolean(player), 'duration', this.durations.get(lineIndex)); return false; }
    const go = () => {
      this.pending.delete(go);
      void player.seekTo(0).catch(() => {});
      player.play();
      this.sounding.add(lineIndex);
    };
    const wait = (at - this.clock.now()) * 1000;
    if (__DEV__) console.log('[player] play', lineIndex, 'in', Math.round(wait), 'ms, duration', this.durations.get(lineIndex));
    if (wait <= 4) { go(); return true; }
    this.pending.add(go);
    const handle = setTimeout(() => { if (this.pending.has(go)) go(); }, wait);
    // A stopAll before the timer fires drops `go` from `pending`; the timer then does nothing.
    void handle;
    return true;
  }

  stopAll() {
    this.pending.clear();
    for (const i of this.sounding) {
      const p = this.players.get(i);
      try { p?.pause(); void p?.seekTo(0).catch(() => {}); } catch { /* released */ }
    }
    this.sounding.clear();
  }

  close() {
    this.stopAll();
    for (const p of this.players.values()) { try { p.remove(); } catch { /* already gone */ } }
    this.players.clear();
    this.durations.clear();
  }
}

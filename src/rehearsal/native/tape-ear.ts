/**
 * The tape room's microphone, through Apple's recogniser.
 *
 * Simpler than the run's Mic: no turns. It listens for as long as the room
 * is open and keeps every word it has heard since the room last reset it,
 * with the moment each word arrived, because the cue rules (tape-cues.ts)
 * are about pauses as much as words.
 *
 * The camera holds the same microphone. It configures the audio session when
 * it starts, which can stop the engine under a recogniser that was already
 * listening, with no error: the same deafness the run guards against. So the
 * room starts the ear after the camera is ready, and the ear watches its own
 * level readings and restarts itself when they stop.
 */
import { ExpoSpeechRecognitionModule, type ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';

import { tokenize } from '../word-match';
import type { Heard } from '../tape-cues';

const DEAF_AFTER_MS = 2500;
const LEVEL_EVERY_MS = 150;
const MAX_RESTARTS = 8;
const FATAL = new Set(['audio-capture', 'not-allowed', 'service-not-allowed', 'language-not-supported', 'bad-grammar']);

export interface TapeEarCallbacks {
  /** Everything heard since the last reset. */
  onHeard: (heard: Heard) => void;
  /** The input level, roughly 0 (silence) to 1 (speaking up). */
  onLevel?: (level: number) => void;
  /** The recogniser cannot be had. The room goes on, by touch. */
  onFailed: (why: string) => void;
}

export class TapeEar {
  private listening = false;
  private keywords: string[] = [];
  private finals = '';
  private interim = '';
  private words: string[] = [];
  private at: number[] = [];
  private base = 0;
  private subs: { remove: () => void }[] = [];
  private onDevice = false;
  private startedAt = 0;
  private lastLevelAt = 0;
  private restarts = 0;
  private watch: ReturnType<typeof setInterval> | null = null;

  constructor(private cb: TapeEarCallbacks) {}

  static available(): boolean {
    try { return ExpoSpeechRecognitionModule.isRecognitionAvailable(); } catch { return false; }
  }

  /**
   * The room's sound, out of the speaker. The camera sets the audio session
   * when it starts, and a play-and-record session sends playback to the
   * earpiece unless told otherwise: the take would play back in a whisper.
   */
  static speakerOut() {
    try {
      ExpoSpeechRecognitionModule.setCategoryIOS({
        category: 'playAndRecord',
        categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'mixWithOthers'],
        mode: 'videoRecording',
      });
    } catch { /* not on this platform */ }
  }

  static async permission(): Promise<boolean> {
    try {
      const have = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      if (have.granted) return true;
      return (await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted;
    } catch {
      return false;
    }
  }

  attach() {
    this.onDevice = (() => { try { return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(); } catch { return false; } })();
    const M = ExpoSpeechRecognitionModule;
    this.subs = [
      M.addListener('result', (e) => {
        if (!this.listening) return;
        const best = e.results[0]?.transcript ?? '';
        if (e.isFinal) { this.finals = [this.finals, best].filter(Boolean).join(' '); this.interim = ''; }
        else this.interim = best;
        const words = tokenize([this.finals, this.interim].filter(Boolean).join(' '));
        // A revision can rewrite words already heard; each place keeps the
        // moment it was first filled, which is what a pause is measured from.
        const now = Date.now();
        this.at.length = Math.min(this.at.length, words.length);
        while (this.at.length < words.length) this.at.push(now);
        this.words = words;
        if (this.base > words.length) this.base = words.length;
        this.emit();
      }),
      M.addListener('error', (e) => {
        if (!this.listening || e.error === 'aborted' || e.error === 'no-speech') return;
        if (FATAL.has(e.error)) this.cb.onFailed(e.message || e.error);
      }),
      // Apple ends a task by itself about once a minute. Not the end of anything.
      M.addListener('end', () => { if (this.listening) this.start(); }),
      M.addListener('volumechange', (e) => {
        this.lastLevelAt = Date.now();
        // Apple's scale runs from about -2 (silence) to 10 (loud).
        this.cb.onLevel?.(Math.max(0, Math.min(1, (e.value + 2) / 8)));
      }),
    ];
  }

  /** The words of the piece, and the cues, for Apple to listen for. */
  prime(script: string[]) {
    this.keywords = ['action', 'cut', 'again', 'keeper', ...new Set(script)].slice(0, 100);
  }

  listen() {
    if (this.listening) return;
    this.listening = true;
    this.finals = ''; this.interim = ''; this.words = []; this.at = []; this.base = 0;
    this.restarts = 0;
    this.start();
    this.watchLevels();
  }

  /** Forget what has been heard: a cue was taken, or a take begins. */
  reset() {
    this.base = this.words.length;
    this.emit();
  }

  /** Start the recogniser again on the current audio session (after the camera has changed it). */
  refresh() {
    if (!this.listening) return;
    try { ExpoSpeechRecognitionModule.abort(); } catch { this.start(); }
  }

  stop() {
    this.listening = false;
    if (this.watch) { clearInterval(this.watch); this.watch = null; }
    try { ExpoSpeechRecognitionModule.abort(); } catch { /* not running */ }
  }

  detach() {
    this.stop();
    for (const s of this.subs) s.remove();
    this.subs = [];
  }

  private emit() {
    this.cb.onHeard({ words: this.words.slice(this.base), at: this.at.slice(this.base) });
  }

  private start() {
    const options: ExpoSpeechRecognitionOptions = {
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      addsPunctuation: false,
      requiresOnDeviceRecognition: this.onDevice,
      contextualStrings: this.keywords,
      iosTaskHint: 'dictation',
      // The camera records through the same session: play and record, mixed,
      // in the mode made for video, so neither takes the microphone off the other.
      iosCategory: {
        category: 'playAndRecord',
        categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'mixWithOthers'],
        mode: 'videoRecording',
      },
      volumeChangeEventOptions: { enabled: true, intervalMillis: LEVEL_EVERY_MS },
    };
    this.startedAt = Date.now();
    // A new task starts its transcript from nothing: what was heard is kept.
    this.finals = [this.finals, this.interim].filter(Boolean).join(' ');
    this.interim = '';
    try { ExpoSpeechRecognitionModule.start(options); } catch (e) { this.cb.onFailed(e instanceof Error ? e.message : String(e)); }
  }

  private watchLevels() {
    if (this.watch) return;
    this.watch = setInterval(() => {
      if (!this.listening || this.restarts >= MAX_RESTARTS) return;
      if (Date.now() - Math.max(this.lastLevelAt, this.startedAt) < DEAF_AFTER_MS) return;
      this.restarts += 1;
      this.refresh();
    }, 1000);
  }
}

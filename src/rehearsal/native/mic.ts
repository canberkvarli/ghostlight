/**
 * The actor's microphone, through Apple's recogniser. Opened on the actor's
 * turn and torn down at its end, so the partner's own voice through the
 * speaker is never heard back and matched against the next line. Words
 * arrive as interim results while the actor is still speaking; the engine
 * gets the whole turn's text each time, as the web's live session hands it.
 *
 * Apple ends a recognition task on its own (a final result, or about a
 * minute). While the turn is still open that is not the end of the turn:
 * the text so far is kept and a new task picks up where it stopped.
 */
import { ExpoSpeechRecognitionModule, type ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';

/** How long the transcript may gain no new words before the actor counts as stopped. Same as the web. */
export const QUIET_AFTER_WORDS_MS = 1400;

export interface MicCallbacks {
  onTranscript: (turnText: string) => void;
  onQuiet: () => void;
  /** The recogniser failed for a reason that ends the run (not a silence, not our own abort). */
  onFailed: (why: string) => void;
}

const FATAL = new Set(['audio-capture', 'not-allowed', 'service-not-allowed', 'language-not-supported', 'network', 'bad-grammar']);

export class Mic {
  private open = false;
  private keywords: string[] = [];
  private finals = '';
  private interim = '';
  private words = 0;
  private quietTimer: ReturnType<typeof setTimeout> | null = null;
  private subs: { remove: () => void }[] = [];
  private onDevice = false;

  constructor(private cb: MicCallbacks) {}

  /** Ask for the microphone and the recogniser. True when both are granted. */
  static async permission(): Promise<boolean> {
    const have = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (have.granted) return true;
    const asked = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return asked.granted;
  }

  static available(): boolean {
    try { return ExpoSpeechRecognitionModule.isRecognitionAvailable(); } catch { return false; }
  }

  attach() {
    this.onDevice = (() => { try { return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition(); } catch { return false; } })();
    const M = ExpoSpeechRecognitionModule;
    this.subs = [
      M.addListener('result', e => {
        if (__DEV__) console.log('[mic] result', e.isFinal, e.results[0]?.transcript?.slice(0, 60));
        if (!this.open) return;
        const best = e.results[0]?.transcript ?? '';
        if (e.isFinal) { this.finals = [this.finals, best].filter(Boolean).join(' '); this.interim = ''; }
        else this.interim = best;
        const text = [this.finals, this.interim].filter(Boolean).join(' ').trim();
        const n = text ? text.split(/\s+/).length : 0;
        if (n > this.words) { this.words = n; this.bumpQuiet(); }
        if (text) this.cb.onTranscript(text);
      }),
      M.addListener('error', e => {
        if (__DEV__) console.log('[mic] error', e.error, e.message);
        if (!this.open || e.error === 'aborted' || e.error === 'no-speech') return;
        if (FATAL.has(e.error)) { this.cb.onFailed(e.message || e.error); return; }
        // 'interrupted', 'speech-timeout', 'busy', 'client': the task is over; `end` restarts it.
      }),
      M.addListener('end', () => { if (this.open) this.start(); }),
    ];
  }

  /** The words of the coming line. Apple's contextual strings, set on the next start. */
  prime(keywords: string[]) { this.keywords = keywords.filter(Boolean).slice(0, 100); }

  openTurn() {
    this.finals = ''; this.interim = ''; this.words = 0;
    this.clearQuiet();
    this.open = true;
    this.start();
  }

  closeTurn() {
    this.open = false;
    this.clearQuiet();
    try { ExpoSpeechRecognitionModule.abort(); } catch { /* not running */ }
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
      iosCategory: { category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth'], mode: 'default' },
    };
    if (__DEV__) console.log('[mic] start, keywords', this.keywords.length, 'onDevice', this.onDevice);
    try { ExpoSpeechRecognitionModule.start(options); } catch (e) { if (__DEV__) console.log('[mic] start threw', e); this.cb.onFailed(e instanceof Error ? e.message : String(e)); }
  }

  private bumpQuiet() {
    this.clearQuiet();
    this.quietTimer = setTimeout(() => { this.quietTimer = null; if (this.open && this.words > 0) this.cb.onQuiet(); }, QUIET_AFTER_WORDS_MS);
  }

  private clearQuiet() { if (this.quietTimer) { clearTimeout(this.quietTimer); this.quietTimer = null; } }

  detach() {
    this.closeTurn();
    for (const s of this.subs) s.remove();
    this.subs = [];
  }
}

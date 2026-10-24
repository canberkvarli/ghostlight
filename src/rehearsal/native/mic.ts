/**
 * The actor's microphone, through Apple's recogniser. One recogniser for the
 * whole run: it is listening while the partner speaks as much as on the
 * actor's turn, so a line that starts a breath before the partner's last
 * word ends, or over it, is heard from its first word. It used to be opened
 * at each turn, and Apple takes most of a second to start a task: everything
 * said in that second was gone, which was "it never listens to me".
 *
 * What the engine gets is a window on the running transcript. The turn's
 * text is the words since the turn opened, less a short lead so the first
 * word said just before the turn counts. Outside a turn the engine is told
 * what it overhears, counted from the partner's beat, and decides whether
 * the actor has come in on their line. The partner's own voice through the
 * speaker is kept out of the microphone by the voice-chat mode's echo
 * cancellation; the engine's cut-in rule is the second guard.
 *
 * Apple ends a recognition task on its own (a final result, or about a
 * minute). While the run is still listening that is not the end of anything:
 * the words so far are kept and a new task picks up where it stopped.
 */
import { ExpoSpeechRecognitionModule, type ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';

/** How long the transcript may gain no new words before the actor counts as stopped. Same as the web. */
export const QUIET_AFTER_WORDS_MS = 1400;
/** Words said this long before the turn opened belong to the turn. */
const LEAD_MS = 700;

export interface MicCallbacks {
  /** The turn's words so far. */
  onTranscript: (turnText: string) => void;
  /** Words heard outside a turn, since the beat was marked. */
  onOverheard: (text: string) => void;
  onQuiet: () => void;
  /** The recogniser failed for a reason that ends the run (not a silence, not our own abort). */
  onFailed: (why: string) => void;
}

const FATAL = new Set(['audio-capture', 'not-allowed', 'service-not-allowed', 'language-not-supported', 'network', 'bad-grammar']);

export class Mic {
  private listening = false;
  private open = false;
  private keywords: string[] = [];
  private finals = '';
  private interim = '';
  private words: string[] = [];
  /** When each word count was first reached, newest last: the lead looks this up. */
  private history: { t: number; n: number }[] = [];
  private base = 0; // the turn's words start here
  private mark = 0; // the beat's words start here
  private turnWords = 0;
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

  /** Whether the phone has already said yes, without asking. */
  static async permissionGranted(): Promise<boolean> {
    try { return (await ExpoSpeechRecognitionModule.getPermissionsAsync()).granted; } catch { return false; }
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
        if (!this.listening) return;
        const best = e.results[0]?.transcript ?? '';
        if (e.isFinal) { this.finals = [this.finals, best].filter(Boolean).join(' '); this.interim = ''; }
        else this.interim = best;
        const text = [this.finals, this.interim].filter(Boolean).join(' ').trim();
        this.words = text ? text.split(/\s+/) : [];
        const n = this.words.length;
        if (n > (this.history[this.history.length - 1]?.n ?? 0)) this.history.push({ t: Date.now(), n });
        if (this.history.length > 400) this.history.splice(0, 100);
        if (this.open) {
          const turn = this.words.slice(this.base);
          if (turn.length > this.turnWords) { this.turnWords = turn.length; this.bumpQuiet(); }
          if (turn.length) this.cb.onTranscript(turn.join(' '));
        } else {
          const heard = this.words.slice(this.mark);
          if (heard.length) this.cb.onOverheard(heard.join(' '));
        }
      }),
      M.addListener('error', e => {
        if (__DEV__) console.log('[mic] error', e.error, e.message);
        if (!this.listening || e.error === 'aborted' || e.error === 'no-speech') return;
        if (FATAL.has(e.error)) { this.cb.onFailed(e.message || e.error); return; }
        // 'interrupted', 'speech-timeout', 'busy', 'client': the task is over; `end` restarts it.
      }),
      M.addListener('end', () => { if (this.listening) this.start(); }),
    ];
  }

  /** The words of the part. Apple's contextual strings, set on the next start. */
  prime(keywords: string[]) {
    this.keywords = keywords.filter(Boolean).slice(0, 100);
    // A beat starts here too: what is overheard counts from now.
    this.mark = this.words.length;
  }

  /** The run begins, or goes on after a pause. */
  listen() {
    if (this.listening) return;
    this.listening = true;
    this.finals = ''; this.interim = ''; this.words = []; this.history = [];
    this.base = 0; this.mark = 0; this.turnWords = 0;
    this.start();
  }

  /** Paused, over, or left: the recogniser is torn down. */
  stop() {
    this.open = false;
    this.listening = false;
    this.clearQuiet();
    try { ExpoSpeechRecognitionModule.abort(); } catch { /* not running */ }
  }

  /** The actor's turn. The words from a breath ago belong to it. */
  openTurn() {
    this.clearQuiet();
    this.base = this.countAt(Date.now() - LEAD_MS);
    this.turnWords = Math.max(0, this.words.length - this.base);
    this.open = true;
    if (!this.listening) this.listen();
    // The words already said in the lead are the turn's first delta.
    const turn = this.words.slice(this.base);
    if (turn.length) { this.bumpQuiet(); this.cb.onTranscript(turn.join(' ')); }
  }

  closeTurn() {
    this.open = false;
    this.clearQuiet();
    this.mark = this.words.length;
  }

  /** How many words had been heard by `t`. */
  private countAt(t: number): number {
    let n = 0;
    for (const h of this.history) { if (h.t <= t) n = h.n; else break; }
    return Math.min(n, this.words.length);
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
      // Voice chat: the phone cancels its own speaker out of the microphone,
      // so the partner is not heard back while the actor is being listened to.
      iosCategory: { category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth'], mode: 'voiceChat' },
    };
    if (__DEV__) console.log('[mic] start, keywords', this.keywords.length, 'onDevice', this.onDevice);
    try { ExpoSpeechRecognitionModule.start(options); } catch (e) { if (__DEV__) console.log('[mic] start threw', e); this.cb.onFailed(e instanceof Error ? e.message : String(e)); }
  }

  private bumpQuiet() {
    this.clearQuiet();
    this.quietTimer = setTimeout(() => { this.quietTimer = null; if (this.open && this.turnWords > 0) this.cb.onQuiet(); }, QUIET_AFTER_WORDS_MS);
  }

  private clearQuiet() { if (this.quietTimer) { clearTimeout(this.quietTimer); this.quietTimer = null; } }

  detach() {
    this.stop();
    for (const s of this.subs) s.remove();
    this.subs = [];
  }
}

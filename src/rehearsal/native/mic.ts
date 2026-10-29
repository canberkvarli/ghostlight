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
 *
 * It can also go deaf without ending. The recogniser listens through an audio
 * engine it builds at each start and never watches; if the audio session is
 * reconfigured under it, that engine stops and the task goes on "listening"
 * to nothing, with no error. That was a first scene that said (listening.)
 * and heard nothing until a tap restarted it. The level readings come off the
 * same input, through silence as much as speech, so when they stop the engine
 * has stopped: the task is restarted, which is what the tap used to do.
 */
import { ExpoSpeechRecognitionModule, type ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';

/** How long the transcript may gain no new words before the actor counts as stopped. Same as the web. */
export const QUIET_AFTER_WORDS_MS = 1400;
/** Words said this long before the turn opened belong to the turn. */
const LEAD_MS = 700;
/** No level reading for this long while listening: the engine under the recogniser has stopped. */
export const DEAF_AFTER_MS = 2500;
/** How often a level reading comes. Silence reads too. */
const LEVEL_EVERY_MS = 250;
/** Restarts allowed per run, so a phone whose microphone cannot be had does not loop. */
const MAX_RESTARTS = 4;

export interface MicCallbacks {
  /** The turn's words so far. */
  onTranscript: (turnText: string) => void;
  /** Words heard outside a turn, since the beat was marked. */
  onOverheard: (text: string) => void;
  onQuiet: () => void;
  /** The recogniser failed for a reason that ends the run (not a silence, not our own abort). */
  onFailed: (why: string) => void;
  /** The input went silent under a running task and it was restarted. For the dashboard. */
  onDeaf?: (info: { sinceStartMs: number; restarts: number }) => void;
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
  private startedAt = 0;
  private lastLevelAt = 0;
  private restarts = 0;
  private watch: ReturnType<typeof setInterval> | null = null;

  constructor(private cb: MicCallbacks) {}

  /** Ask for the microphone and the recogniser. True when both are granted. */
  static async permission(): Promise<boolean> {
    const have = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (have.granted) return true;
    const asked = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (asked.granted) Mic.grantedThisLaunch = true;
    return asked.granted;
  }

  /** The phone said yes during this launch: a run right after the prompts, for the dashboard. */
  static grantedThisLaunch = false;

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
      M.addListener('volumechange', () => { this.lastLevelAt = Date.now(); }),
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
    this.restarts = 0;
    this.start();
    this.watchLevels();
  }

  /** Paused, over, or left: the recogniser is torn down. */
  stop() {
    this.open = false;
    this.listening = false;
    this.clearQuiet();
    if (this.watch) { clearInterval(this.watch); this.watch = null; }
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
      // The plain mode: the speaker at its full volume. The chat modes cancel
      // the speaker out of the microphone but run the sound through voice
      // processing, which left the partner too quiet to act against. What
      // the microphone hears of the partner is kept out by the engine's own
      // rule for a cut-in: three of the actor's words, in order.
      iosCategory: { category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth'], mode: 'default' },
      // Not for a meter: the readings are how a stopped engine is noticed (watchLevels).
      volumeChangeEventOptions: { enabled: true, intervalMillis: LEVEL_EVERY_MS },
    };
    this.startedAt = Date.now();
    if (__DEV__) console.log('[mic] start, keywords', this.keywords.length, 'onDevice', this.onDevice);
    try { ExpoSpeechRecognitionModule.start(options); } catch (e) { if (__DEV__) console.log('[mic] start threw', e); this.cb.onFailed(e instanceof Error ? e.message : String(e)); }
  }

  /** While listening: no reading for DEAF_AFTER_MS, counted from the last reading or the last start, and the task is restarted. */
  private watchLevels() {
    if (this.watch) return;
    this.watch = setInterval(() => {
      if (!this.listening || this.restarts >= MAX_RESTARTS) return;
      const since = Date.now() - Math.max(this.lastLevelAt, this.startedAt);
      if (since < DEAF_AFTER_MS) return;
      this.restarts += 1;
      if (__DEV__) console.log('[mic] deaf for', since, 'ms, restarting', this.restarts);
      this.cb.onDeaf?.({ sinceStartMs: Date.now() - this.startedAt, restarts: this.restarts });
      // Abort ends the task; `end` starts the next one, the words so far kept.
      try { ExpoSpeechRecognitionModule.abort(); } catch { this.start(); }
    }, 1000);
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

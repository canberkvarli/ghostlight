// Carried from actorrise lib/rehearsal (commit 9e3414b9). Pure; keep in step with the web,
// the server's line contract and journal are shared.

/**
 * The rehearsal engine. Pure: every clock, speaker, microphone and network it
 * touches is a port handed in, so this file runs under vitest with none of
 * them. The React layer renders `snapshot()` and forwards inputs. It never
 * decides anything.
 *
 * Time is the audio clock, in seconds. A partner beat is scheduled on it to
 * the sample; the microphone opens at the beat's exact end; the handover
 * fires on the delta that completes the actor's line, not after a wait.
 * Pause stops everything at the clock; resume goes on from the line it was on
 * (mid-beat, the line sounding or the next one due), never from the top.
 */
import { liveRead, shouldHandOver, type LiveRead, EMPTY_READ } from './live-read';
import type { EventType } from './contract';
import type { ActorTurn, PartnerTurn, Script } from './script';
import { Timeline } from './timeline';

/** The pause between two partner lines in one beat. */
export const BREATH_S = 0.3;

export interface EnginePorts {
  clock: { now: () => number; outputLatency: () => number };
  player: {
    /** Decoded length in seconds, or null if the line is not ready yet. */
    duration: (lineIndex: number) => number | null;
    /** Schedule the line at `at` on the audio clock. False = not playable yet: held like a cold line. */
    play: (lineIndex: number, at: number) => boolean;
    stopAll: () => void;
  };
  mic: {
    /** Tell the transcriber what is coming. Sent when the partner starts. */
    prime: (keywords: string[]) => void;
    open: () => void;
    close: () => void;
  };
  /** On the handover path, before the partner plays. MUST be O(1) and must not
   *  perform I/O: buffer it; the hook flushes on a microtask. */
  journal: { emit: (type: EventType, lineIndex: number | null, atMs: number, payload?: Record<string, unknown>) => void };
  /** Run `fn` when the audio clock reaches `at`. Returns a cancel. */
  schedule: (at: number, fn: () => void) => () => void;
}

export type EngineState = 'ready' | 'partner' | 'actor' | 'paused' | 'ended';

export interface Snapshot {
  state: EngineState;
  actor: string; // the character the actor is reading
  turnIndex: number;
  /** The line the actor is on, or the partner line currently sounding. */
  lineIndex: number;
  read: LiveRead;
  /** Which partner line in the current beat is sounding, by line index. */
  sounding: number | null;
  /** Lines the actor has already read, index → matched word indices. */
  heard: Map<number, Set<number>>;
}

export class Engine {
  private state: EngineState = 'ready';
  private turnIndex = 0;
  private read: LiveRead = EMPTY_READ;
  private sounding: number | null = null;
  private heard = new Map<number, Set<number>>();
  private cancels: Array<() => void> = [];
  private startedAt = 0;
  private timeline = new Timeline();
  private waiting: { line: number; position: number; due: number } | null = null; // a held cold line
  private beat: { position: number; end: number }[] = []; // the lines scheduled, and their ends
  private resumeFrom = 0; // position in the beat that resume goes on from; -1 = the next turn
  private primed = -1; // the actor turn last primed for; cleared with the mic
  private listeners = new Set<() => void>();

  constructor(private script: Script, private ports: EnginePorts) {}

  // ── reading ──

  snapshot(): Snapshot {
    const turn = this.script.turns[this.turnIndex];
    const lineIndex = turn ? (turn.kind === 'actor' ? turn.lineIndex : (this.sounding ?? turn.lineIndices[0])) : -1;
    return {
      state: this.state, actor: this.script.actor, turnIndex: this.turnIndex, lineIndex,
      read: this.read, sounding: this.sounding, heard: this.heard,
    };
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed() { this.listeners.forEach(fn => fn()); }

  private atMs() { return (this.ports.clock.now() - this.startedAt) * 1000; }

  // ── inputs from the actor ──

  /** Start at `fromLine`'s turn (a resume), or at the top. A beat starts from its first line. */
  begin(fromLine?: number) {
    if (this.state !== 'ready') return;
    this.startedAt = this.ports.clock.now();
    this.ports.journal.emit('started', fromLine ?? null, 0);
    this.enter(fromLine === undefined ? 0 : this.script.turnOfLine[fromLine] ?? 0);
  }

  /** Audio stopped at the clock, mic off; remembers the line resume goes on from. */
  pause() {
    if (this.state !== 'partner' && this.state !== 'actor') return;
    const now = this.ports.clock.now();
    // The line sounding now, or the next one due (in a breath, or held cold).
    // None, in a beat, means it had finished: resume goes on to the next turn.
    this.resumeFrom = this.beat.find(b => b.end > now)?.position ?? this.waiting?.position ?? (this.state === 'partner' ? -1 : 0);
    this.silence();
    this.state = 'paused';
    this.ports.journal.emit('paused', this.snapshot().lineIndex, this.atMs());
    this.changed();
  }

  /** The same line again, at now: an actor line from its first word, a beat from the line it was on. */
  resume() {
    if (this.state !== 'paused') return;
    this.ports.journal.emit('resumed', this.snapshot().lineIndex, this.atMs());
    if (this.resumeFrom < 0) { this.enter(this.turnIndex + 1); return; } // the beat had finished
    const turn = this.script.turns[this.turnIndex];
    this.read = EMPTY_READ;
    this.waiting = null;
    this.timeline.reset();
    if (turn.kind === 'partner') this.startBeat(turn, this.resumeFrom); else this.openMic(turn);
    this.changed();
  }

  /** The actor's line: read as skipped. A partner line: on to the line after it, or the end. */
  skip() {
    if (this.state === 'actor') { this.finishActorTurn('skipped'); return; }
    if (this.state !== 'partner') return;
    const next = this.snapshot().lineIndex + 1;
    if (this.script.turnOfLine[next] === undefined) { this.silence(); this.enter(this.script.turns.length); return; }
    this.jumpTo(next);
  }

  back() {
    if (this.state === 'ended' || this.state === 'ready') return;
    let i = this.turnIndex - 1;
    while (i >= 0 && this.script.turns[i].kind !== 'actor') i--;
    this.jumpToTurn(Math.max(i, 0));
  }

  /** Start at `lineIndex`: an actor line from its first word, a partner line inside its beat from that line on. */
  jumpTo(lineIndex: number) {
    if (this.state === 'ready' || this.state === 'ended') return;
    const t = this.script.turnOfLine[lineIndex];
    if (t === undefined) return;
    const turn = this.script.turns[t];
    this.jumpToTurn(t, turn.kind === 'partner' ? Math.max(0, turn.lineIndices.indexOf(lineIndex)) : 0);
  }

  /** `reason` lands in the event's payload: stt_failed, left, unmounted... */
  abandon(reason?: string) {
    if (this.state === 'ended' || this.state === 'ready') return;
    this.silence();
    this.ports.journal.emit('abandoned', this.snapshot().lineIndex, this.atMs(), reason ? { reason } : {});
    this.state = 'ended';
    this.changed();
  }

  private jumpToTurn(t: number, position = 0) {
    const from = this.snapshot().lineIndex;
    const turn = this.script.turns[t];
    this.silence();
    this.ports.journal.emit('jumped', turn.kind === 'partner' ? turn.lineIndices[position] : turn.lineIndex, this.atMs(), { from });
    this.enter(t, undefined, position);
  }

  // ── inputs from the transcriber ──

  delta(transcript: string) {
    if (this.state !== 'actor') return; // partner bleed, or a paused mic
    const turn = this.script.turns[this.turnIndex] as ActorTurn;
    const now = this.ports.clock.now();
    this.timeline.mark('delta', now);
    if (this.timeline.get('first_delta') === undefined) this.timeline.mark('first_delta', now);
    // The read carries on from the last delta of this turn, so the reading
    // position only moves forward; enter() and resume() reset it to EMPTY_READ.
    this.read = liveRead(turn.words, transcript, this.read);
    if (shouldHandOver({ ...this.read, turnEnded: false })) {
      this.finishActorTurn('last_word');
      return;
    }
    this.changed();
  }

  /** The transcript has stopped growing (QUIET_AFTER_WORDS_MS). */
  quiet() {
    if (this.state !== 'actor') return;
    if (shouldHandOver({ ...this.read, turnEnded: true })) this.finishActorTurn('quiet');
  }

  /** A partner line the engine was holding on has decoded: the beat goes on from it. */
  audioReady(lineIndex: number) {
    if (this.state !== 'partner' || this.waiting?.line !== lineIndex) return;
    const { position, due } = this.waiting;
    this.waiting = null;
    this.playBeat(this.script.turns[this.turnIndex] as PartnerTurn, position, Math.max(due, this.ports.clock.now()));
    this.changed();
  }

  // ── transitions ──

  private lineOfTurn(t: number) { const u = this.script.turns[t]; return u.kind === 'actor' ? u.lineIndex : u.lineIndices[0]; }

  private silence() { this.clearTimers(); this.ports.player.stopAll(); this.ports.mic.close(); this.primed = -1; }

  /** Start turn `t` at now. `finished` journals the actor line just read, once its partner is scheduled. */
  private enter(t: number, finished?: (scheduled: boolean) => void, position = 0) {
    this.clearTimers();
    const turn = this.script.turns[t];
    if (!turn) { finished?.(false); this.end(); return; } // past the last turn; the snapshot stays on it
    this.turnIndex = t;
    this.read = EMPTY_READ;
    // The line the beat starts on is the live one from now, not only once its
    // audio is due: a jump into a beat must not show its first line meanwhile.
    this.sounding = turn.kind === 'partner' ? turn.lineIndices[position] : null;
    this.waiting = null;
    this.beat = [];
    this.timeline = new Timeline(); // `finished` still reads the old one
    let scheduled = false;
    if (turn.kind === 'partner') scheduled = this.startBeat(turn, position); else this.openMic(turn);
    finished?.(scheduled);
    this.ports.journal.emit('line_reached', this.sounding ?? this.lineOfTurn(t), this.atMs());
    this.changed();
  }

  /** True if the line at `position` was scheduled; false if it is held cold. */
  private startBeat(turn: PartnerTurn, position: number): boolean {
    this.state = 'partner';
    const scheduled = this.playBeat(turn, position, this.ports.clock.now());
    // Primed as the beat starts (after play, so it never delays the sound),
    // so the transcriber is ready when the mic opens.
    this.prime(turn.index + 1);
    return scheduled;
  }

  private openMic(turn: ActorTurn) {
    this.state = 'actor';
    this.prime(turn.index);
    this.ports.mic.open();
    this.timeline.mark('mic_open', this.ports.clock.now());
  }

  /** Send turn `t`'s keywords, once: the beat before it usually already has. */
  private prime(t: number) {
    const turn = this.script.turns[t];
    if (turn?.kind !== 'actor' || this.primed === t) return;
    this.ports.mic.prime(turn.keywords);
    this.primed = t;
  }

  /**
   * Schedule the beat from `position` on, starting at `at`: each line follows
   * the last by its decoded length plus a breath, and the mic opens at the
   * last line's end, on the clock. A cold line (no duration, or play()
   * refused) holds the beat there until audioReady. True if the line at
   * `position` was scheduled.
   */
  private playBeat(turn: PartnerTurn, position: number, at: number): boolean {
    this.beat = [];
    let start = at;
    let end = at;
    for (let p = position; p < turn.lineIndices.length; p++) {
      const line = turn.lineIndices[p];
      const d = this.ports.player.duration(line);
      if (d === null || !this.ports.player.play(line, start)) {
        this.waiting = { line, position: p, due: start };
        return p > position;
      }
      const s = start;
      this.beat.push({ position: p, end: s + d });
      this.cancels.push(this.ports.schedule(s, () => { this.sounding = line; this.changed(); }));
      this.ports.journal.emit('partner_line_played', line, (s - this.startedAt) * 1000);
      end = s + d;
      start = end + BREATH_S;
    }
    this.timeline.mark('partner_end', end);
    this.cancels.push(this.ports.schedule(end, () => this.enter(this.turnIndex + 1)));
    return true;
  }

  private finishActorTurn(endedBy: 'last_word' | 'quiet' | 'skipped') {
    const turn = this.script.turns[this.turnIndex] as ActorTurn;
    this.ports.mic.close();
    this.timeline.mark('handover', this.ports.clock.now());
    this.heard.set(turn.lineIndex, new Set(this.read.matched));
    const marks = this.timeline, read = this.read;
    // The next beat is scheduled at now by enter(), in this same call. The mark
    // is set only once play() has taken its first line: refused, it stays unset.
    this.enter(this.turnIndex + 1, (scheduled) => {
      if (scheduled) marks.mark('partner_scheduled', this.ports.clock.now());
      this.ports.journal.emit('actor_line_read', turn.lineIndex, this.atMs(), {
        ended_by: endedBy,
        matched: [...read.matched].sort((a, b) => a - b),
        score: read.score,
        // null when nothing was measured (a skip with no delta, a cold or refused partner line).
        handover_ms: marks.handoverMs(),
        output_latency_ms: Math.round(this.ports.clock.outputLatency() * 1000),
      });
    });
  }

  private end() {
    this.clearTimers();
    this.ports.mic.close();
    this.state = 'ended';
    this.ports.journal.emit('completed', this.script.lines.length - 1, this.atMs(), {});
    this.changed();
  }

  private clearTimers() { this.cancels.forEach(c => c()); this.cancels = []; }
}

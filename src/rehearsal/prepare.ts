// Carried from actorrise lib/rehearsal (commit 9e3414b9). Pure; keep in step with the web,
// the server's line contract and journal are shared.

/**
 * The decisions `useRehearsal` makes before and around a run, kept out of the
 * hook so they can be tested without a browser.
 */
import { type ScenePayload, sameCharacter } from './contract';
import type { Script } from './script';

/** What the Curtain waits on. Begin needs `line1 && stt && !error`; `mic` is shown, not required. */
export interface Readiness {
  /** The first partner line the run will play is decoded, or the actor speaks first. */
  line1: boolean;
  /** The live transcription session is open. */
  stt: boolean;
  /** A microphone stream was obtained. */
  mic: boolean;
  /** One plain sentence (see `plainError`), or the Plus gate's own message. */
  error: string | null;
  /** Set with a gate error: where the actor can see the plans. */
  upgradeUrl?: string | null;
}

export const canBegin = (r: Readiness) => r.line1 && r.stt && !r.error;

/**
 * The partner line that must be decoded before Begin: the first line of the
 * turn the run starts on (turn 0, or the turn holding `fromLine` on a resume,
 * which the engine plays from its beat's first line). Null when that turn is
 * the actor's, or there is nothing to play.
 */
export function firstNeededLine(script: Script, fromLine: number | null = null): number | null {
  const t = fromLine === null ? 0 : script.turnOfLine[fromLine];
  const turn = t === undefined ? undefined : script.turns[t];
  return turn?.kind === 'partner' ? turn.lineIndices[0] : null;
}

export interface AudioSlot {
  lineIndex: number;
  character: string;
  voice: string;
  /** The payload's slot when it is usable as is; null = ask POST /api/rehearsal/audio. */
  source: { key: string; url: string | null } | null;
}

const lookup = (m: Record<string, string> | undefined, character: string) =>
  Object.entries(m ?? {}).find(([c]) => sameCharacter(c, character))?.[1];

/**
 * One slot per partner line, in order. The payload carries audio only for the
 * part the server guessed, in that part's default voices, so its slot is used
 * when it covers every partner line of the part picked (that is the part) and
 * the line's character still has its default voice. Anything else is asked for.
 */
export function planPartnerAudio(payload: ScenePayload, script: Script, voices: Record<string, string>): AudioSlot[] {
  const defaults = Object.entries(payload.defaults).find(([c]) => sameCharacter(c, script.actor))?.[1];
  const partner = script.lines.filter(l => !sameCharacter(l.character, script.actor));
  const covered = partner.length > 0 && partner.every(l => payload.audio[String(l.index)]);
  return partner.map(l => {
    const fallback = lookup(defaults, l.character);
    const voice = lookup(voices, l.character) ?? fallback ?? payload.voices[0]?.id ?? '';
    const slot = payload.audio[String(l.index)];
    return { lineIndex: l.index, character: l.character, voice, source: covered && slot && voice === fallback ? slot : null };
  });
}

/**
 * The engine's journal port must not do I/O, so it asks for a flush and this
 * runs it later (`defer`). Requests in one tick coalesce into one flush; a
 * request made while a send is in flight runs one more flush after it, so the
 * last events of a run never sit in the queue waiting for a next emit. A
 * failed send is not retried here: the next request (or the beacon) carries it.
 */
export function makeFlusher(flush: () => Promise<void>, defer: (fn: () => void) => void): () => void {
  let queued = false, busy = false, again = false;
  const run = async () => {
    queued = false;
    if (busy) { again = true; return; }
    busy = true;
    try {
      do { again = false; await flush().catch(() => {}); } while (again);
    } finally { busy = false; }
  };
  return () => { if (!queued) { queued = true; defer(() => { void run(); }); } };
}

/** At most `n` of the wrapped calls in flight; the rest wait their turn, in order. */
export function limit(n: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    // A finishing call hands its slot straight to the next waiter, so a new caller cannot take it in between.
    if (active >= n) await new Promise<void>(r => waiting.push(r)); else active++;
    try { return await fn(); } finally { const next = waiting.shift(); if (next) next(); else active--; }
  };
}

/**
 * A partner line that failed to load matters only while the run still needs
 * it: the first failed line at or after `cursor` (the line the run is on, or
 * starts from), by line index. Null once the run is past every failed line.
 * The reason it failed stays in the map; the screen only ever says `plainError('line')`.
 */
export function neededFailure(failed: Map<number, string>, cursor: number): number | null {
  const line = [...failed.keys()].filter(l => l >= cursor).sort((a, b) => a - b)[0];
  return line === undefined ? null : line;
}

/**
 * What can go wrong, as the screen says it. A server's or a browser's own
 * message never reaches the actor: every failure is one of these four.
 * - `stt`: the live transcription failed to open or dropped
 * - `mic`: no microphone stream (permission denied, or no device)
 * - `line`: a partner line the run still needs could not load
 * - `gate`: the Plus gate or the session meter said no. Not a breakage: the
 *   server's own message (written by us, in the API) is shown with a link to
 *   the plans. See `runFailure`.
 * - `other`: anything else (the run would not open, the wrong page)
 */
export type ErrorKind = 'stt' | 'mic' | 'line' | 'gate' | 'other';

const PLAIN: Record<ErrorKind, string> = {
  stt: 'The live microphone dropped. Reload to run again.',
  mic: 'The microphone is blocked. Allow it in your browser and reload.',
  line: 'A partner line could not load. Reload to run again.',
  gate: 'This scene needs Plus.', // only when a gate reply carries no message of its own
  other: 'Something broke. Reload to run again.',
};

export const plainError = (kind: ErrorKind): string => PLAIN[kind];

/** The live session failed: it is the microphone's fault when no stream was ever obtained. */
export const liveFailureKind = (micObtained: boolean): ErrorKind => (micObtained ? 'stt' : 'mic');

export interface RunFailure { kind: 'gate' | 'other'; message: string; upgradeUrl: string | null }

/**
 * Why POST /runs said no, as the Curtain says it. A 403 or 429 whose `detail`
 * is our gate shape (`{error, message, upgrade_url}`, from the Plus gate in
 * services/rehearsal/access.py or the session meter) is a gate: its message is
 * shown and the actor gets a link to the plans. The link must be one of ours
 * (a path), never wherever a body points. Everything else is `other`.
 * `e` is what `lib/api` throws: an Error with `response: {status, data}`.
 */
export function runFailure(e: unknown): RunFailure {
  const res = (e as { response?: { status?: unknown; data?: unknown } } | null)?.response;
  const detail = (res?.data as { detail?: unknown } | undefined)?.detail as
    { error?: unknown; message?: unknown; upgrade_url?: unknown } | undefined;
  const gated = (res?.status === 403 || res?.status === 429) && typeof detail === 'object' && detail !== null
    && typeof detail.error === 'string' && typeof detail.message === 'string' && detail.message.trim() !== '';
  if (!gated) return { kind: 'other', message: plainError('other'), upgradeUrl: null };
  const url = detail.upgrade_url;
  return {
    kind: 'gate',
    message: (detail.message as string).trim(),
    upgradeUrl: typeof url === 'string' && /^\/(?![\/\\])/.test(url) ? url : null,
  };
}

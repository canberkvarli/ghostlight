/**
 * The tape room's ear: is what the actor just said a cue, or a line?
 *
 * The room is run by voice. "Action" rolls, "cut" stops, "again" throws the
 * take away and goes again, "keeper" stars it. The trouble is that plays are
 * full of those words. "I'll cut you." "Cut the cord." "Say it again." A
 * self-tape that stops on a line ruins a take the actor may not get back, so
 * the rules lean one way: when in doubt, keep rolling. A missed cut costs a
 * few seconds of tail, which the export trims anyway.
 *
 * We know every word the actor is about to say, and that is the whole trick.
 * A word counts as a cue only when all of these hold:
 *
 *   1. It stands alone. A cue is its own utterance: one word (or "and
 *      action", "okay cut"), after a pause, and nothing after it for a beat.
 *      A line runs into the words around it.
 *   2. It is not the next thing in the script. While rolling, a cue word that
 *      sits in the next few words of the text, or that moved the reading on
 *      when it was heard, is the actor's line.
 *   3. The phase wants it. "Cut" means nothing before a take, "keeper"
 *      nothing during one.
 *
 * After the last line the next "cut" is almost surely the cue, so the pause
 * it needs drops. And "cut cut", said twice, always cuts, mid-line or not:
 * the way out of a take that has gone wrong.
 *
 * Pure, so tape-cues.test.ts pins it without a microphone.
 */

import { wordsMatch } from './word-match';

export type Cue = 'action' | 'cut' | 'again' | 'keeper';
export type TapePhase = 'ready' | 'rolling' | 'review';

/** Quiet before a word, for it to stand alone. */
export const PAUSE_MS = 600;
/** The same after the last line, where a cut is expected. */
export const END_PAUSE_MS = 300;
/** Quiet after a cue word before it counts: "cut the cord" has gone on by then. */
export const SETTLE_MS = 450;
/** How far ahead in the text a cue word makes the actor's next words suspect. */
export const LOOK_AHEAD = 8;
/** "cut cut": the two said this close together. */
const DOUBLE_WITHIN_MS = 1500;

/** The words a recogniser writes for each cue. Short ones are matched exactly. */
const SPOKEN: Record<string, Cue> = {
  action: 'action',
  actions: 'action',
  cut: 'cut',
  cuts: 'cut',
  cutt: 'cut',
  again: 'again',
  keeper: 'keeper',
  keepers: 'keeper',
};

/** Said in front of a cue without making it a sentence. */
const LEAD_INS = new Set(['and', 'ok', 'okay', 'alright', 'right', 'so', 'um', 'uh', 'aaand']);

export function cueOf(word: string): Cue | null {
  return SPOKEN[word] ?? null;
}

/** What the ear has heard since the room last reset it. */
export interface Heard {
  /** Tokenized words, in order. */
  words: string[];
  /** When each word first arrived, ms. Same length as `words`. */
  at: number[];
}

/** Where the reading was, over time: the position after each transcript update. */
export interface ReadMark {
  t: number;
  position: number;
}

export interface CueInput {
  phase: TapePhase;
  heard: Heard;
  now: number;
  /** The piece, tokenized as one run of words. Only used while rolling. */
  script?: string[];
  /** The reading position over this take, oldest first. Only used while rolling. */
  reads?: ReadMark[];
}

export interface CueHit {
  cue: Cue;
  /** Index of the cue's first word in `heard.words`. */
  from: number;
  /** When the cue's first word arrived. */
  saidAt: number;
  /** When the word before the cue arrived, if there was one: where the take really ended. */
  lastWordAt: number | null;
}

/** The phase's meaning for a heard cue word, or null where it means nothing. */
function inPhase(phase: TapePhase, cue: Cue): Cue | null {
  // Back on the camera after a cut, "keeper" stars the take that just went to Tapes.
  if (phase === 'ready') return cue === 'action' || cue === 'again' ? 'action' : cue === 'keeper' ? 'keeper' : null;
  if (phase === 'rolling') return cue === 'cut' || cue === 'again' ? cue : null;
  // review: going again, or starring the one just watched.
  if (cue === 'action' || cue === 'again') return 'again';
  if (cue === 'keeper') return 'keeper';
  return null;
}

/** The reading position as of `t`. */
export function positionAt(reads: ReadMark[], t: number): number {
  let p = 0;
  for (const r of reads) {
    if (r.t <= t) p = r.position;
    else break;
  }
  return p;
}

/** Is a word like `spoken` in the text from `from`, within the look-ahead? */
function aheadInScript(script: string[], from: number, spoken: string): boolean {
  const end = Math.min(script.length, from + LOOK_AHEAD);
  for (let i = Math.max(0, from); i < end; i++) {
    const w = script[i];
    if (w === spoken || cueOf(w) === cueOf(spoken) || wordsMatch(w, spoken)) return true;
  }
  return false;
}

/**
 * Decide whether the latest words are a cue.
 *
 * Call it on every transcript update and on a short tick (the settle rule
 * needs time to pass with nothing new). Once it returns a hit, reset what the
 * ear has heard, or the same words will be read as the same cue again.
 */
export function hearCue({ phase, heard, now, script = [], reads = [] }: CueInput): CueHit | null {
  const { words, at } = heard;
  const n = words.length;
  if (!n) return null;

  // "cut cut": always, the moment the second one lands.
  if (
    phase === 'rolling' &&
    n >= 2 &&
    cueOf(words[n - 1]) === 'cut' &&
    cueOf(words[n - 2]) === 'cut' &&
    at[n - 1] - at[n - 2] <= DOUBLE_WITHIN_MS
  ) {
    return { cue: 'cut', from: n - 2, saidAt: at[n - 2], lastWordAt: n > 2 ? at[n - 3] : null };
  }

  // Nothing after it for a beat.
  if (now - at[n - 1] < SETTLE_MS) return null;

  const spoken = words[n - 1];
  const heardCue = cueOf(spoken);
  if (!heardCue) return null;
  const cue = inPhase(phase, heardCue);
  if (!cue) return null;

  // The utterance: the cue word, with at most one lead-in in front of it, said close to it.
  let from = n - 1;
  if (from > 0 && LEAD_INS.has(words[from - 1]) && at[from] - at[from - 1] < PAUSE_MS) from -= 1;

  const lastWordAt = from > 0 ? at[from - 1] : null;
  const pauseBefore = lastWordAt === null ? Infinity : at[from] - lastWordAt;

  if (phase !== 'rolling') {
    return pauseBefore >= PAUSE_MS ? { cue, from, saidAt: at[from], lastWordAt } : null;
  }

  // Rolling: the script decides.
  const before = positionAt(reads, at[from] - 1);
  const atEnd = script.length > 0 && before >= script.length - 1;
  if (pauseBefore < (atEnd ? END_PAUSE_MS : PAUSE_MS)) return null;
  // The word moved the reading on: it was read as the text.
  if (positionAt(reads, now) > before) return null;
  // The actor is about to say it.
  if (aheadInScript(script, before, spoken)) return null;

  return { cue, from, saidAt: at[from], lastWordAt };
}

/* ─── Where the take ends ────────────────────────────────────────────── */

/** How long after a word is said the recogniser hands it over. */
export const HEARD_LAG_MS = 450;
/** The held beat kept after the last word: casting likes to see it land. */
export const HOLD_MS = 900;

/**
 * Where to end the take, in ms from its start, so the cue is not in it.
 *
 * A spoken cut ends a held beat after the last word, and always before the
 * cut itself was said. A tapped stop keeps the whole take.
 */
export function takeEnd({
  startedAt,
  stoppedAt,
  hit,
}: {
  startedAt: number;
  stoppedAt: number;
  hit: Pick<CueHit, 'saidAt' | 'lastWordAt'> | null;
}): number {
  const whole = Math.max(0, stoppedAt - startedAt);
  if (!hit) return whole;
  const ceiling = hit.saidAt - HEARD_LAG_MS - 150;
  const held = hit.lastWordAt === null ? ceiling : hit.lastWordAt - HEARD_LAG_MS + HOLD_MS;
  const end = Math.min(held, ceiling) - startedAt;
  return Math.max(Math.min(1000, whole), Math.min(end, whole));
}

/* ─── The prompter ───────────────────────────────────────────────────── */

/** Which line the reading position is in, given each line's word count. */
export function lineAt(lineLengths: number[], position: number): number {
  let seen = 0;
  for (let i = 0; i < lineLengths.length; i++) {
    seen += lineLengths[i];
    if (position < seen) return i;
  }
  return Math.max(0, lineLengths.length - 1);
}

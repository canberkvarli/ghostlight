// Carried from actorrise lib/rehearsal (commit 9e3414b9). Pure; keep in step with the web,
// the server's line contract and journal are shared.

/**
 * The actor's line, read as they say it.
 *
 * What this replaces is the reason rehearsal never felt live. The old capture
 * was a batch: open the mic, record a take, notice they stopped, upload the
 * file, wait for a transcript, then decide. Nothing in that sequence knows a
 * word while the actor is still saying it, so the lag was structural and no
 * threshold could tune it away.
 *
 * Seven mechanisms had grown up around that gap, all of them guessing at the
 * one thing the design could not observe — whether the actor had finished.
 * There was a microphone level gate, a minimum quiet, a dropped-tail rule, a
 * trailed-off rule, a finished-and-still rule, a self-heal timeout and a
 * skip-if-silent timer. Seven answers to one question is what it looks like
 * when none of them is the real one, and between them they cut actors off
 * mid-speech, stranded them on noisy rooms, and once moved a scene on for an
 * actor who had said nothing at all.
 *
 * A streaming session answers the question directly. Words arrive as deltas
 * while the actor speaks, so the decision here has two clauses:
 *
 *   1. The last word of the speech has been heard. Go now.
 *   2. The actor has stopped and we heard most of it, or its tail. Go.
 *
 * Clause 1 is the common case and waits on nothing, which is why it feels
 * immediate: an actor who reads to the end of their line hands over on the
 * final syllable, with no silence to sit through at all. Clause 2 is the only
 * safety net, for a line trailed off or misheard. It does not fire on a line
 * the actor is in the middle of: a quiet after "Nay," is a breath, not an
 * ending (prod, Hamlet I.i, the first line of the first real run was taken
 * away 1.4s after its first word). Below the bar, quiet does nothing; the
 * actor keeps going, or swipes to skip.
 *
 * "Stopped" is decided off TRANSCRIPT PROGRESS, not microphone level — see
 * `QUIET_AFTER_WORDS_MS` in hooks/useLiveTranscription.ts. That distinction is
 * the one that matters: the old level gate could sit above its threshold for
 * ever on a phone with AGC or a fan, and when it did, a finished line waited
 * on "Recording…" until the actor gave up. Words arriving is a fact; a volume
 * reading was only ever a proxy for it.
 *
 * Pure, so live-read.test.ts pins it without a microphone or a browser.
 */

import { alignMatches, PHONETIC_MIN_LENGTH, tokenize, wordsMatch } from './word-match';

export interface LiveRead {
  /**
   * Indices into the line's words that have been heard, all of them behind
   * `position`. Words the alignment reached ahead of the position are not in
   * here until the position gets to them, and words skipped on the way are
   * never in here: a word is lit because it was said, not because it was
   * passed.
   */
  matched: Set<number>;
  /**
   * Where the actor is reading: the index of the next word to say, from 0 to
   * the line's length. It only ever moves forward within a turn.
   */
  position: number;
  /** Has the reading reached the line's final word? */
  lastWordMatched: boolean;
  /**
   * Has the line's tail been reached or heard? Either the reading got to one
   * of the last two words, or the actor's latest words were the line's last
   * ones: the tail of a long line whose middle was misheard.
   */
  tailMatched: boolean;
  /** Fraction of the line read, 0–1. */
  score: number;
}

/** An empty read, for before the actor has said anything. */
export const EMPTY_READ: LiveRead = {
  matched: new Set(),
  position: 0,
  lastWordMatched: false,
  tailMatched: false,
  score: 0,
};

/**
 * How far ahead of the reading position a match may sit and still move it on
 * by itself: the next word, or the one after (a word the transcriber dropped).
 * Anything further needs a second word agreeing straight after it.
 */
const READ_SLACK = 1;

/**
 * The same allowance for the line's final word, one more: the last words of a
 * line are the ones a transcriber most often swallows as the actor's voice
 * drops, and "within the last word or two" is still the end of the line.
 */
const END_SLACK = 2;

/**
 * Match the transcript so far against the line, carrying on from the last read.
 *
 * Called on every delta with the whole transcript, because the streaming
 * transcriber revises its earlier words, routinely, as more audio arrives.
 * What used to go wrong is that each delta was read from scratch: the set of
 * heard words was recomputed from nothing, a revision reshaped it, and the
 * highlight flickered between two readings of the same line. Worse, the old
 * greedy matcher would hand a common word to its twin far ahead, so the "last
 * word heard" could be a "you" said in the middle and the line was taken away
 * while the actor was still reading it.
 *
 * So the read now has a position, the next word to say, and `previous` carries
 * it across deltas:
 *
 *   - the position moves only when the alignment supports it: a match at the
 *     next word (or one past it), or a further match that the word after it
 *     agrees with. A single word on its own, a few words ahead, waits until
 *     the actor gets there.
 *   - it never moves back. A revision can change which words the alignment
 *     finds, but it cannot un-read what the actor has read: words behind the
 *     position that were heard stay heard.
 *   - the alignment itself is anchored at the position, with a bounded
 *     look-ahead (see LOOKAHEAD in word-match.ts), so a repeated common word
 *     cannot claim a place twelve words on.
 *
 * Pass the previous read of THE SAME turn. A new turn starts from EMPTY_READ.
 */
export function liveRead(expectedWords: string[], transcript: string, previous: LiveRead = EMPTY_READ): LiveRead {
  const n = expectedWords.length;
  if (!n) {
    return { matched: new Set(), position: 0, lastWordMatched: true, tailMatched: true, score: 1 };
  }
  const heard = tokenize(transcript);
  const from = Math.min(Math.max(previous.position, 0), n);
  const matches = alignMatches(expectedWords, heard, { from });

  let position = from;
  for (let k = 0; k < matches.length; k++) {
    const m = matches[k];
    if (m.expectedEnd <= position) continue; // behind: already read
    const gap = Math.max(0, m.expectedStart - position);
    const slack = m.expectedEnd === n ? END_SLACK : READ_SLACK;
    const next = matches[k + 1];
    const agreed = next !== undefined && next.expectedStart - m.expectedEnd <= READ_SLACK;
    if (gap <= slack || agreed) position = m.expectedEnd;
  }

  const matched = new Set<number>();
  for (const i of previous.matched) if (i < position) matched.add(i);
  for (const m of matches) {
    if (m.expectedEnd > position) break;
    for (let e = m.expectedStart; e < m.expectedEnd; e++) matched.add(e);
  }

  const last = n - 1;
  const lastWordMatched = matched.has(last);
  return {
    matched,
    position,
    lastWordMatched,
    tailMatched: lastWordMatched || matched.has(last - 1) || endsOnTail(expectedWords, heard),
    score: matched.size / n,
  };
}

/**
 * Did the actor's latest words land on the line's last word, or the one before?
 *
 * This is the quiet rule's rescue for a long line whose middle the transcriber
 * garbled: the reading position is stuck early, but the actor plainly got to
 * the end. It reads only the END of the transcript, because a tail heard in the
 * middle of a turn is not a tail.
 *
 * A short final word is not enough by itself. "you", "it", "me" are said all
 * through a line, and a breath after "I'll drive you" in "I'll drive ya home,
 * I'm not leaving you" is not the end of it. A short word counts only with the
 * written word before it heard just before it: "leaving you".
 */
function endsOnTail(expected: string[], heard: string[]): boolean {
  const h = heard.length;
  if (!h) return false;
  const lastHeard = heard[h - 1];
  const lastTwo = h >= 2 ? heard[h - 2] + heard[h - 1] : null;
  for (const k of [expected.length - 1, expected.length - 2]) {
    if (k < 0) continue;
    const word = expected[k];
    if (word.length < PHONETIC_MIN_LENGTH) {
      if (!wordsMatch(word, lastHeard)) continue;
      if (k === 0 || (h >= 2 && wordsMatch(expected[k - 1], heard[h - 2]))) return true;
      continue;
    }
    if (wordsMatch(word, lastHeard) || (lastTwo !== null && wordsMatch(word, lastTwo))) return true;
  }
  return false;
}

/**
 * A line's words, ready to match against.
 *
 * Stage directions are stripped by the caller; this is only the tokenizing, so
 * that the page and the matcher cannot disagree about what counts as a word.
 */
export function lineWords(text: string): string[] {
  return tokenize(text);
}

/**
 * Enough of the line to believe a final-word match is genuinely final.
 *
 * A one-word echo of the last word on the page — common when a transcriber is
 * primed with the script and hears a cough — should not hand the scene over.
 * Half the line is the same bar the batch rule used, and it held up.
 */
const ENDING_MIN_SCORE = 0.5;

/**
 * How much of the line a quiet needs behind it to count as the line's end.
 * Below it the actor has paused, not finished.
 */
export const QUIET_MIN_SCORE = 0.6;

export interface HandOverState extends LiveRead {
  /**
   * Has the actor stopped speaking?
   *
   * True once the transcript has gained no new words for a beat. Supplied by
   * the caller rather than computed here so this stays pure, and sourced from
   * the transcript rather than from the microphone, which is what makes it
   * trustworthy: it cannot be held true by a fan or held false by AGC.
   */
  turnEnded: boolean;
}

/** Should the scene move to the next line? */
export function shouldHandOver({
  matched,
  lastWordMatched,
  tailMatched,
  score,
  turnEnded,
}: HandOverState): boolean {
  /* They reached the end of the line. This is the whole point: no wait at all.
     "Reached" is the reading position getting to the final word, not the
     final word turning up somewhere in the transcript: a line ending "...not
     leaving you" used to be taken away on the "you" of "I'll drive you",
     halfway through, which is the "it jumps lines" Canberk hit reading a long
     speech. A one-word line ("No.", "What?") is at its
     end on its only word, so it still goes on the instant. */
  if (lastWordMatched && score >= ENDING_MIN_SCORE) return true;

  /* The turn is over and the line was substantially said: most of it, or
     its tail. Guarded on having heard anything, because a turn that ends
     with an empty transcript is a room noise false positive, and moving the
     scene on for an actor who has not spoken is the failure that started all
     of this. */
  if (turnEnded && matched.size > 0 && (score >= QUIET_MIN_SCORE || tailMatched)) return true;

  return false;
}

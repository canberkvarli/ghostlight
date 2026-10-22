import { describe, expect, it } from 'vitest';
import { EMPTY_READ, liveRead, lineWords, shouldHandOver } from './live-read';

const LINE = "Twenty-four, and I've been doing this since I was nine.";

describe('liveRead', () => {
  it('reads nothing from silence', () => {
    const r = liveRead(lineWords(LINE), '');
    expect(r.matched.size).toBe(0);
    expect(r.score).toBe(0);
    expect(r.lastWordMatched).toBe(false);
  });

  it('grows as the transcript grows', () => {
    const words = lineWords(LINE);
    const a = liveRead(words, 'twenty four');
    const b = liveRead(words, "twenty four and I've been");
    expect(b.matched.size).toBeGreaterThan(a.matched.size);
    expect(b.score).toBeGreaterThan(a.score);
  });

  it('knows when the final word has landed', () => {
    const words = lineWords(LINE);
    expect(liveRead(words, "twenty four and I've been doing this since I was").lastWordMatched).toBe(false);
    expect(liveRead(words, "twenty four and I've been doing this since I was nine").lastWordMatched).toBe(true);
  });

  it('survives a transcriber revising its earlier words', () => {
    // The streaming model does this routinely as more audio arrives: a first
    // pass of "a nita" becomes "Anita". Re-reading from the start each delta is
    // what makes that harmless.
    const words = lineWords('Anita left before the hearing.');
    const first = liveRead(words, 'a nita left');
    const revised = liveRead(words, 'Anita left before the hearing');
    expect(first.matched.size).toBeGreaterThan(0);
    expect(revised.lastWordMatched).toBe(true);
  });

  it('treats an empty line as already read', () => {
    const r = liveRead([], 'anything');
    expect(r.lastWordMatched).toBe(true);
    expect(r.score).toBe(1);
  });
});

describe('shouldHandOver', () => {
  const read = (transcript: string) => liveRead(lineWords(LINE), transcript);

  it('does not move while the actor is mid-line', () => {
    expect(shouldHandOver({ ...read('twenty four and'), turnEnded: false })).toBe(false);
  });

  it('moves the instant the last word lands, without waiting for the turn to end', () => {
    const r = read("twenty four and I've been doing this since I was nine");
    expect(r.lastWordMatched).toBe(true);
    expect(shouldHandOver({ ...r, turnEnded: false })).toBe(true);
  });

  it('does not move on a bare echo of the last word', () => {
    // Primed with the script, a transcriber can produce the final word off a
    // cough. One word is not a delivered line.
    // Since the reading position: the echo is ten words past where the actor
    // is, so it is not read at all, only noticed as the transcript's tail.
    const r = read('nine');
    expect(r.lastWordMatched).toBe(false);
    expect(r.tailMatched).toBe(true);
    expect(r.score).toBeLessThan(0.5);
    expect(shouldHandOver({ ...r, turnEnded: false })).toBe(false);
    expect(shouldHandOver({ ...r, turnEnded: true })).toBe(false);
  });

  it('does not move when the turn ends early in the line: the actor paused, they did not finish', () => {
    // Prod, Hamlet I.i: "Nay," then a breath, and the scene took the line away.
    const r = read('twenty four and');
    expect(shouldHandOver({ ...r, turnEnded: true })).toBe(false);
  });

  it('a 7-word line with only its first word heard does not move on quiet', () => {
    const words = lineWords('Nay, answer me. Stand and unfold yourself.');
    expect(words).toHaveLength(7);
    expect(shouldHandOver({ ...liveRead(words, 'nay'), turnEnded: true })).toBe(false);
  });

  it('a 7-word line with five words heard moves on quiet', () => {
    const words = lineWords('Nay, answer me. Stand and unfold yourself.');
    const r = liveRead(words, 'nay answer me stand and');
    expect(r.lastWordMatched).toBe(false);
    expect(shouldHandOver({ ...r, turnEnded: true })).toBe(true);
  });

  it('a long line whose tail was heard moves on quiet even when most of it was misheard', () => {
    const words = lineWords('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty');
    expect(words).toHaveLength(20);
    const r = liveRead(words, 'one two three four five twenty');
    // The reading stopped at "five"; "twenty" is fourteen words on, so it is
    // not read (it would be the leap), but it is the line's tail, heard last.
    expect(r.lastWordMatched).toBe(false);
    expect(r.tailMatched).toBe(true);
    expect(r.score).toBeCloseTo(0.25);
    expect(shouldHandOver({ ...r, turnEnded: false })).toBe(false);
    expect(shouldHandOver({ ...r, turnEnded: true })).toBe(true);
  });

  it('the second-to-last word counts as reaching the tail', () => {
    const words = lineWords('one two three four five six seven eight nine ten');
    const r = liveRead(words, 'one two nine');
    expect(r.lastWordMatched).toBe(false);
    expect(shouldHandOver({ ...r, turnEnded: true })).toBe(true);
  });

  it('never moves on a turn that ended with nothing heard', () => {
    // The exact failure that started this: the scene moved on for an actor who
    // had said nothing. An empty transcript is room noise, not a performance.
    expect(shouldHandOver({ ...EMPTY_READ, turnEnded: true })).toBe(false);
    expect(shouldHandOver({ ...read(''), turnEnded: true })).toBe(false);
  });

  it('never moves on silence with no turn end either', () => {
    expect(shouldHandOver({ ...EMPTY_READ, turnEnded: false })).toBe(false);
  });
});

/*
 * The reading position, from Canberk's run on a long speech: "it would jump
 * lines, flicker a lot, like it was jumping onto other words. If my line is
 * super long and I keep reading, it would go back and forth". Each case is a
 * shape the old greedy, from-scratch read got wrong.
 */
describe('liveRead: the reading position', () => {
  const SPEECH = 'Anita, I have waited for you every night since the summer, and every night you never came, '
    + 'so tell me now, honestly, whether you ever meant to come back to me at all.';

  /** Feed deltas in order, carrying the read, the way the engine does. */
  function readAlong(words: string[], deltas: string[]) {
    const reads: ReturnType<typeof liveRead>[] = [];
    let prev = EMPTY_READ;
    for (const d of deltas) { prev = liveRead(words, d, prev); reads.push(prev); }
    return reads;
  }

  it('a long line read with revisions: the position never goes back, heard words never go out, no early hand-over', () => {
    const words = lineWords(SPEECH);
    expect(words).toHaveLength(33);
    const deltas = [
      'a nita',
      'a nita I have',
      'Anita I have waited for you',
      // The transcriber has not committed the first "you" yet...
      'Anita I have waited for every night since the summer and every',
      // ...and a later "you" arrives first. The greedy read gave the first
      // "you" to this one and stranded "every night since the summer and every".
      'Anita I have waited for every night since the summer and every night you never',
      // Revised: "you" back, "the" heard again as "this".
      'Anita I have waited for you every night since this summer and every night you never came so',
      'Anita I have waited for you every night since this summer and every night you never came so tell me now honestly',
      // A revision that drops a word already read.
      'Anita I have waited for you every night since this summer and every night you never came so tell me now whether you',
      'Anita I have waited for you every night since this summer and every night you never came so tell me now whether you ever meant to come back',
      'Anita I have waited for you every night since this summer and every night you never came so tell me now whether you ever meant to come back to me at all',
    ];
    const reads = readAlong(words, deltas);
    for (let k = 1; k < reads.length; k++) {
      expect(reads[k].position).toBeGreaterThanOrEqual(reads[k - 1].position);
      for (const i of reads[k - 1].matched) expect(reads[k].matched.has(i)).toBe(true);
    }
    for (const r of reads) for (const i of r.matched) expect(i).toBeLessThan(r.position);
    // The out-of-order "you": every word up to "never" is read, none stranded.
    expect(reads[4].position).toBe(16);
    for (const i of [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) expect(reads[4].matched.has(i)).toBe(true);
    // Nothing hands over until the last word, though "me", "you" and "to" all recur.
    reads.slice(0, -1).forEach(r => expect(shouldHandOver({ ...r, turnEnded: false })).toBe(false));
    expect(shouldHandOver({ ...reads.at(-1)!, turnEnded: false })).toBe(true);
  });

  it('an early common word the transcriber missed does not claim its twin further on', () => {
    // "I" dropped at the top; the second "I" must be read as the second "I".
    const r = liveRead(lineWords('I swear I never meant for any of this to happen.'), 'swear I never meant for');
    expect([...r.matched].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(r.position).toBe(6);
  });

  it('a line ending in "you" does not hand over on a "you" said in the middle of it', () => {
    const words = lineWords("Get in the car, I'll drive ya home, I'm not leaving you.");
    const mid = liveRead(words, "get in the car I'll drive you");
    expect(mid.position).toBe(6);
    expect(mid.lastWordMatched).toBe(false);
    expect(shouldHandOver({ ...mid, turnEnded: false })).toBe(false);
    // A breath there is not the end of the line either.
    expect(shouldHandOver({ ...mid, turnEnded: true })).toBe(false);
    const done = liveRead(words, "get in the car I'll drive you home I'm not leaving you", mid);
    expect(done.lastWordMatched).toBe(true);
    expect(shouldHandOver({ ...done, turnEnded: false })).toBe(true);
  });

  it('a skipped phrase: the position recovers forward once the next words agree', () => {
    const words = lineWords(SPEECH);
    // "and every night you never came" left out.
    const r = liveRead(words, 'Anita I have waited for you every night since the summer so tell me now honestly');
    expect(r.position).toBe(22);
    for (const i of [11, 12, 13, 14, 15, 16]) expect(r.matched.has(i)).toBe(false); // skipped words stay plain
    expect(r.matched.has(17)).toBe(true);
  });

  it('one word several words ahead waits for the actor to get there', () => {
    const words = lineWords(SPEECH);
    const r = liveRead(words, 'Anita I have waited for you every night since the summer you');
    expect(r.position).toBe(11); // the "you" four words on does not move it
  });

  it('short lines still hand over on their only word', () => {
    for (const [line, said] of [['No.', 'no'], ['What?', 'what'], ['Go.', 'go'], ['Thank you.', 'thank you'], ['Oh, you.', 'oh you']]) {
      const r = liveRead(lineWords(line), said);
      expect(r.lastWordMatched).toBe(true);
      expect(shouldHandOver({ ...r, turnEnded: false })).toBe(true);
    }
  });

  it('a new turn starts from nothing: an old read of another line is not carried', () => {
    expect(EMPTY_READ.position).toBe(0);
    expect(liveRead(lineWords('No.'), 'no', EMPTY_READ).position).toBe(1);
  });
});

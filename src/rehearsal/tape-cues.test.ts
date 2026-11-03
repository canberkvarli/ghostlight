import { describe, expect, it } from 'vitest';
import { hearCue, lineAt, positionAt, takeEnd, SETTLE_MS, type Heard, type ReadMark } from './tape-cues';
import { liveRead, lineWords } from './live-read';
import { EMPTY_READ, type LiveRead } from './live-read';

/**
 * A take, said word by word: each entry is [word, ms after the previous word].
 * Runs the real live read over it as the room does, so the reading position
 * the cue rule sees is the one it would see on a phone.
 */
function say(script: string, said: [string, number][]) {
  const words = lineWords(script);
  const heard: Heard = { words: [], at: [] };
  const reads: ReadMark[] = [];
  let t = 1000;
  let read: LiveRead = EMPTY_READ;
  for (const [w, gap] of said) {
    t += gap;
    heard.words.push(w);
    heard.at.push(t);
    read = liveRead(words, heard.words.join(' '), read);
    reads.push({ t, position: read.position });
  }
  return { heard, reads, script: words, last: t };
}

/** Each word a quarter second after the last: speech with no pause in it. */
const flowing = (text: string, first = 250): [string, number][] =>
  lineWords(text).map((w, i) => [w, i === 0 ? first : 250]);

describe('hearCue: before a take', () => {
  it('rolls on "action" once nothing follows it', () => {
    const { heard, last } = say('', [['action', 0]]);
    expect(hearCue({ phase: 'ready', heard, now: last + SETTLE_MS })?.cue).toBe('action');
  });

  it('waits a beat before it counts', () => {
    const { heard, last } = say('', [['action', 0]]);
    expect(hearCue({ phase: 'ready', heard, now: last + 100 })).toBeNull();
  });

  it('takes "and action"', () => {
    const { heard, last } = say('', [['okay', 0], ['so', 900], ['and', 900], ['action', 250]]);
    const hit = hearCue({ phase: 'ready', heard, now: last + SETTLE_MS });
    expect(hit?.cue).toBe('action');
    expect(hit?.from).toBe(2);
  });

  it('does not roll on "action" inside a sentence', () => {
    const { heard, last } = say('', flowing('this is a call to action'));
    expect(hearCue({ phase: 'ready', heard, now: last + SETTLE_MS })).toBeNull();
  });

  it('does not take "cut" before there is anything to cut', () => {
    const { heard, last } = say('', [['cut', 0]]);
    expect(hearCue({ phase: 'ready', heard, now: last + SETTLE_MS })).toBeNull();
  });
});

describe('hearCue: rolling', () => {
  const SCRIPT = 'If you come near her again I will cut you down where you stand. Now go.';

  it('keeps rolling through a line with "cut" in it', () => {
    const run = say(SCRIPT, flowing('If you come near her again I will cut'));
    expect(hearCue({ phase: 'rolling', ...run, now: run.last + SETTLE_MS })).toBeNull();
  });

  it('keeps rolling when the actor pauses before the word "cut" in the text', () => {
    // "...I will [a long beat] cut you down": the pause is acting, not a cue.
    const run = say(SCRIPT, [...flowing('If you come near her again I will'), ['cut', 1200]]);
    expect(hearCue({ phase: 'rolling', ...run, now: run.last + SETTLE_MS })).toBeNull();
  });

  it('keeps rolling through "again" when it is the next word', () => {
    const run = say(SCRIPT, [...flowing('If you come near her'), ['again', 900]]);
    expect(hearCue({ phase: 'rolling', ...run, now: run.last + SETTLE_MS })).toBeNull();
  });

  it('cuts after the last line', () => {
    const run = say(SCRIPT, [...flowing(SCRIPT), ['cut', 900]]);
    const hit = hearCue({ phase: 'rolling', ...run, now: run.last + SETTLE_MS });
    expect(hit?.cue).toBe('cut');
    expect(hit?.lastWordAt).toBe(run.heard.at[run.heard.at.length - 2]);
  });

  it('cuts after a last line that ends on "cut"', () => {
    const END = 'And that is where I made the cut';
    const said = flowing(END);
    // The line itself, run straight into: not a cue.
    const line = say(END, said);
    expect(hearCue({ phase: 'rolling', ...line, now: line.last + SETTLE_MS })).toBeNull();
    // Then the held beat, then the cue.
    const run = say(END, [...said, ['cut', 1000]]);
    expect(hearCue({ phase: 'rolling', ...run, now: run.last + SETTLE_MS })?.cue).toBe('cut');
  });

  it('cuts a take the actor stops mid-speech, when "cut" is nowhere near in the text', () => {
    const run = say(SCRIPT, [...flowing('If you come near her'), ['cut', 900]]);
    // "cut" is 4 words on from here: still near enough to be the line.
    expect(hearCue({ phase: 'rolling', ...run, now: run.last + SETTLE_MS })).toBeNull();
    const far = say('Now listen to me. I have waited all my life for a night like this one.', [...flowing('Now listen to me'), ['cut', 900]]);
    expect(hearCue({ phase: 'rolling', ...far, now: far.last + SETTLE_MS })?.cue).toBe('cut');
  });

  it('always cuts on "cut cut", even mid-line', () => {
    const run = say(SCRIPT, [...flowing('If you come near her again I will'), ['cut', 250], ['cut', 300]]);
    expect(hearCue({ phase: 'rolling', ...run, now: run.last })?.cue).toBe('cut');
  });

  it('goes again on a lone "again" with the text far off', () => {
    const run = say('Now listen to me. I have waited all my life for a night like this one.', [...flowing('Now listen'), ['again', 1000]]);
    expect(hearCue({ phase: 'rolling', ...run, now: run.last + SETTLE_MS })?.cue).toBe('again');
  });

  it('cuts with no script at all (your own sides), on a lone "cut" after a pause', () => {
    const run = say('', [...flowing('these are my own sides tonight'), ['cut', 900]]);
    expect(hearCue({ phase: 'rolling', ...run, now: run.last + SETTLE_MS })?.cue).toBe('cut');
    const line = say('', flowing('then I cut the cord'));
    expect(hearCue({ phase: 'rolling', ...line, now: line.last + SETTLE_MS })).toBeNull();
  });

  it('does not take "action" or "keeper" during a take', () => {
    const run = say('Now listen to me. I have waited all my life.', [...flowing('Now listen'), ['keeper', 1000]]);
    expect(hearCue({ phase: 'rolling', ...run, now: run.last + SETTLE_MS })).toBeNull();
  });

  it('does not take "cut" said straight on from the words before it', () => {
    const run = say('Now listen to me. I have waited all my life.', [...flowing('Now listen'), ['cut', 200]]);
    expect(hearCue({ phase: 'rolling', ...run, now: run.last + SETTLE_MS })).toBeNull();
  });
});

describe('hearCue: watching it back', () => {
  it('stars it on "keeper"', () => {
    const { heard, last } = say('', [['keeper', 0]]);
    expect(hearCue({ phase: 'review', heard, now: last + SETTLE_MS })?.cue).toBe('keeper');
  });

  it('goes again on "action" or "again"', () => {
    for (const w of ['action', 'again']) {
      const { heard, last } = say('', [[w, 0]]);
      expect(hearCue({ phase: 'review', heard, now: last + SETTLE_MS })?.cue).toBe('again');
    }
  });
});

describe('takeEnd', () => {
  it('keeps a held beat after the last word and stops before the cut was said', () => {
    const end = takeEnd({ startedAt: 0, stoppedAt: 20_000, hit: { lastWordAt: 15_000, saidAt: 17_000 } });
    expect(end).toBe(15_000 - 450 + 900);
  });

  it('never runs into the cut, however short the pause', () => {
    const end = takeEnd({ startedAt: 0, stoppedAt: 20_000, hit: { lastWordAt: 15_000, saidAt: 15_400 } });
    expect(end).toBeLessThan(15_400 - 450);
  });

  it('keeps the whole take on a tapped stop', () => {
    expect(takeEnd({ startedAt: 1000, stoppedAt: 9000, hit: null })).toBe(8000);
  });

  it('never ends a take before it has begun', () => {
    expect(takeEnd({ startedAt: 0, stoppedAt: 3000, hit: { lastWordAt: null, saidAt: 200 } })).toBe(1000);
  });
});

describe('lineAt and positionAt', () => {
  it('finds the line a word is in', () => {
    expect(lineAt([3, 4, 2], 0)).toBe(0);
    expect(lineAt([3, 4, 2], 3)).toBe(1);
    expect(lineAt([3, 4, 2], 8)).toBe(2);
    expect(lineAt([3, 4, 2], 99)).toBe(2);
  });

  it('reads the position as of a time', () => {
    const reads = [{ t: 10, position: 1 }, { t: 20, position: 4 }];
    expect(positionAt(reads, 5)).toBe(0);
    expect(positionAt(reads, 15)).toBe(1);
    expect(positionAt(reads, 25)).toBe(4);
  });
});

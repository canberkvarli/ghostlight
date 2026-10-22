import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BREATH_S, Engine, type EnginePorts } from './engine';
import { buildScript } from './script';
import type { RehearsalLine } from './contract';
import { liveRead } from './live-read';

const L = (index: number, character: string, text: string): RehearsalLine => ({ index, character, text, direction: null });
const LINES = [L(0, 'BEN', 'Where were you?'), L(1, 'BEN', 'I waited.'), L(2, 'ANNA', 'Out. Twenty-four hours.'),
  L(3, 'BEN', 'Fine.'), L(4, 'ANNA', 'Go.')];

/**
 * Callbacks handed to `schedule`, fired by `fire(upTo)` once the clock is at or
 * past their time, earliest first. A cancel really removes one, including one
 * cancelled by an earlier callback in the same `fire`.
 */
let timers: { at: number; fn: () => void }[] = [];
const fire = (upTo: number) => {
  for (;;) {
    const due = timers.filter(t => t.at <= upTo).sort((a, b) => a.at - b.at)[0];
    if (!due) return;
    timers = timers.filter(t => t !== due);
    due.fn();
  }
};

function fakePorts() {
  let now = 100;
  const scheduled: { line: number; at: number }[] = [];
  const durations: Record<number, number> = { 0: 1.0, 1: 0.5, 3: 0.4 };
  /** Plays and listener notifications, in the order they happened. */
  const calls: string[] = [];
  const ports: EnginePorts & { now: () => number; tick: (s: number) => void; scheduled: typeof scheduled; calls: string[] } = {
    now: () => now,
    tick: (s) => { now += s; },
    scheduled,
    calls,
    clock: { now: () => now, outputLatency: () => 0.02 },
    player: {
      duration: (line) => durations[line] ?? null,
      play: (line, at) => { scheduled.push({ line, at }); calls.push(`play:${line}`); return true; },
      stopAll: vi.fn(),
    },
    mic: { prime: vi.fn(), open: vi.fn(), close: vi.fn() },
    journal: { emit: vi.fn() },
    schedule: vi.fn((at: number, fn: () => void) => {
      const timer = { at, fn };
      timers.push(timer);
      return () => { timers = timers.filter(t => t !== timer); };
    }),
  };
  return ports;
}

describe('Engine', () => {
  let ports: ReturnType<typeof fakePorts>;
  let engine: Engine;
  beforeEach(() => { timers = []; ports = fakePorts(); engine = new Engine(buildScript(LINES, 'ANNA'), ports); });

  it('begin plays the first beat as one continuous thing with a breath between lines', () => {
    engine.begin();
    expect(ports.scheduled).toEqual([{ line: 0, at: 100 }, { line: 1, at: 100 + 1.0 + BREATH_S }]);
    expect(engine.snapshot().state).toBe('partner');
  });

  it('opens the mic exactly at the end of the beat and primes it at the start', () => {
    engine.begin();
    expect(ports.mic.prime).toHaveBeenCalledWith(expect.arrayContaining(['Anna', 'Ben']));
    const end = 100 + 1.0 + BREATH_S + 0.5;
    expect(ports.mic.open).not.toHaveBeenCalled();
    ports.tick(end - 100); fire(end);
    expect(ports.mic.open).toHaveBeenCalledTimes(1);
    expect(engine.snapshot().state).toBe('actor');
    expect(engine.snapshot().lineIndex).toBe(2);
  });

  it('hands over on the last word with no wait, and schedules the partner now', () => {
    engine.begin(); const end = 100 + 1.5 + BREATH_S; ports.tick(end - 100); fire(end);
    ports.tick(1); engine.delta('out twenty four');
    expect(engine.snapshot().state).toBe('actor');
    ports.tick(0.4); engine.delta('out twenty four hours');
    expect(ports.mic.close).toHaveBeenCalled();
    expect(ports.scheduled.at(-1)).toEqual({ line: 3, at: ports.now() });
    expect(ports.journal.emit).toHaveBeenCalledWith('actor_line_read', 2, expect.any(Number),
      expect.objectContaining({ ended_by: 'last_word', matched: [0, 1, 2, 3], handover_ms: 0 }));
  });

  it('a long line is not taken away on a "you" said halfway, and a revision never pulls the reading back', () => {
    const lines = [L(0, 'BEN', 'Where were you?'), L(1, 'ANNA', "Get in the car, I'll drive ya home, I'm not leaving you."), L(2, 'BEN', 'Fine.')];
    const e = new Engine(buildScript(lines, 'ANNA'), ports);
    e.begin(); ports.tick(1.0); fire(101);
    expect(e.snapshot().state).toBe('actor');
    e.delta("get in the car I'll drive you");
    expect(e.snapshot().state).toBe('actor');
    expect(e.snapshot().read.position).toBe(6);
    e.quiet(); // a breath, not the end
    expect(e.snapshot().state).toBe('actor');
    e.delta('get in the'); // the transcriber revising its first pass
    expect(e.snapshot().read.position).toBe(6);
    expect(e.snapshot().read.matched.size).toBe(6);
    e.delta("get in the car I'll drive you home I'm not leaving you");
    expect(e.snapshot().state).toBe('partner');
    expect(ports.journal.emit).toHaveBeenCalledWith('actor_line_read', 1, expect.any(Number), expect.objectContaining({ ended_by: 'last_word' }));
  });

  it('a delta before the mic is open is ignored', () => {
    engine.begin();
    engine.delta('out twenty four hours');
    expect(engine.snapshot().state).toBe('partner');
    expect(ports.mic.close).not.toHaveBeenCalled();
  });

  it('quiet after most of the line hands over; quiet after nothing, or a first word, does not', () => {
    engine.begin(); const end = 100 + 1.5 + BREATH_S; ports.tick(end - 100); fire(end);
    engine.quiet();
    expect(engine.snapshot().state).toBe('actor');
    engine.delta('out');
    engine.quiet();
    expect(engine.snapshot().state).toBe('actor');
    expect(ports.mic.close).not.toHaveBeenCalled();
    engine.delta('out twenty four');
    engine.quiet();
    expect(engine.snapshot().state).toBe('partner');
    expect(ports.journal.emit).toHaveBeenCalledWith('actor_line_read', 2, expect.any(Number), expect.objectContaining({ ended_by: 'quiet' }));
  });

  it('the last actor line ends the scene', () => {
    engine.begin(); let t = 100 + 1.5 + BREATH_S; ports.tick(t - 100); fire(t);
    engine.delta('out twenty four hours');
    t = ports.now() + 0.4; ports.tick(0.4); fire(t);
    expect(engine.snapshot().state).toBe('actor'); expect(engine.snapshot().lineIndex).toBe(4);
    engine.delta('go');
    expect(engine.snapshot().state).toBe('ended');
    expect(ports.journal.emit).toHaveBeenCalledWith('completed', 4, expect.any(Number), {});
  });

  it('after the actor\'s last line, one partner line plays and then the run completes', () => {
    const lines = [...LINES.slice(0, 4), L(4, 'MAID', 'Dinner, madam.'), L(5, 'BEN', 'Not now.')];
    const e = new Engine(buildScript(lines, 'ANNA'), ports);
    e.begin(); const end = 100 + 1.5 + BREATH_S; ports.tick(end - 100); fire(end);
    e.delta('out twenty four hours');
    expect(ports.scheduled.map(s => s.line)).toEqual([0, 1, 3]);
    expect(e.snapshot().state).toBe('partner');
    const t = ports.now() + 0.4; ports.tick(0.4); fire(t);
    expect(e.snapshot().state).toBe('ended');
    expect(ports.scheduled.map(s => s.line)).toEqual([0, 1, 3]);
    expect(ports.journal.emit).toHaveBeenCalledWith('completed', expect.any(Number), expect.any(Number), {});
    expect(ports.mic.open).toHaveBeenCalledTimes(1);
  });

  it('skip moves on with ended_by skipped; back returns to the previous actor line', () => {
    engine.begin(); const end = 100 + 1.5 + BREATH_S; ports.tick(end - 100); fire(end);
    engine.skip();
    expect(ports.journal.emit).toHaveBeenCalledWith('actor_line_read', 2, expect.any(Number), expect.objectContaining({ ended_by: 'skipped' }));
    expect(engine.snapshot().state).toBe('partner');
    engine.back();
    expect(engine.snapshot().lineIndex).toBe(2);
    expect(engine.snapshot().state).toBe('actor');
    expect(ports.player.stopAll).toHaveBeenCalled();
  });

  it('pause stops audio and the mic; resume restarts the current turn', () => {
    engine.begin();
    engine.pause();
    expect(engine.snapshot().state).toBe('paused');
    expect(ports.player.stopAll).toHaveBeenCalled();
    expect(ports.mic.close).toHaveBeenCalled();
    engine.resume();
    expect(engine.snapshot().state).toBe('partner');
    // Paused before line 0 had started: the beat goes again from line 0, at now.
    expect(ports.scheduled).toEqual([{ line: 0, at: 100 }, { line: 1, at: 100 + 1.0 + BREATH_S },
      { line: 0, at: 100 }, { line: 1, at: 100 + 1.0 + BREATH_S }]);
  });

  it('resume goes on from the line that was sounding, not the top of the beat', () => {
    engine.begin();
    ports.tick(1.5); fire(101.5);
    expect(engine.snapshot().sounding).toBe(1);
    engine.pause();
    engine.resume();
    expect(ports.scheduled).toEqual([{ line: 0, at: 100 }, { line: 1, at: 100 + 1.0 + BREATH_S }, { line: 1, at: 101.5 }]);
    ports.tick(0.5); fire(102);
    expect(engine.snapshot()).toMatchObject({ state: 'actor', lineIndex: 2 });
  });

  it('paused in the breath between two lines, resume starts the next line', () => {
    engine.begin();
    ports.tick(1.1); fire(101.1);
    engine.pause(); engine.resume();
    expect(ports.scheduled.slice(2)).toEqual([{ line: 1, at: 101.1 }]);
  });

  it('paused after the beat had finished (its end not yet run), resume goes on to the actor turn', () => {
    engine.begin();
    ports.tick(2); // past 101.8, the end of line 1; the end timer has not fired
    engine.pause();
    expect(engine.snapshot().state).toBe('paused');
    engine.resume();
    expect(engine.snapshot()).toMatchObject({ state: 'actor', lineIndex: 2 });
    expect(ports.mic.open).toHaveBeenCalledTimes(1);
    expect(ports.scheduled).toHaveLength(2);
    fire(1e6);
    expect(engine.snapshot().state).toBe('actor');
  });

  it('resume on an actor line primes and opens the mic again with the read reset', () => {
    engine.begin(); const end = 100 + 1.5 + BREATH_S; ports.tick(end - 100); fire(end);
    engine.delta('out twenty');
    expect(engine.snapshot().read.score).toBeGreaterThan(0);
    engine.pause(); engine.resume();
    expect(engine.snapshot()).toMatchObject({ state: 'actor', lineIndex: 2 });
    expect(engine.snapshot().read.score).toBe(0);
    expect(ports.mic.prime).toHaveBeenCalledTimes(2);
    expect(ports.mic.open).toHaveBeenCalledTimes(2);
  });

  it('a pause cancels the beat: its end never opens the mic', () => {
    engine.begin();
    engine.pause();
    fire(1e6);
    expect(engine.snapshot().state).toBe('paused');
    expect(ports.mic.open).not.toHaveBeenCalled();
  });

  it('a jump cancels the beat it left: its end never fires', () => {
    engine.begin();
    engine.jumpTo(4);
    ports.tick(10); fire(1e6);
    expect(engine.snapshot()).toMatchObject({ state: 'actor', lineIndex: 4 });
    expect(ports.mic.open).toHaveBeenCalledTimes(1);
  });

  it('primes once per actor line: the beat before it does, the line itself does not again', () => {
    engine.begin(); const end = 100 + 1.5 + BREATH_S; ports.tick(end - 100); fire(end);
    expect(engine.snapshot().state).toBe('actor');
    expect(ports.mic.prime).toHaveBeenCalledTimes(1);
  });

  it('a jump to an actor line primes it again: the mic was closed in between', () => {
    engine.begin(); // the beat primed line 2
    vi.mocked(ports.mic.prime).mockClear();
    engine.jumpTo(2);
    expect(ports.mic.prime).toHaveBeenCalledTimes(1);
    expect(ports.mic.prime).toHaveBeenCalledWith(expect.arrayContaining(['Anna', 'Ben']));
  });

  it('on handover the partner plays before any listener hears about it', () => {
    engine.begin(); const end = 100 + 1.5 + BREATH_S; ports.tick(end - 100); fire(end);
    engine.subscribe(() => ports.calls.push('listener'));
    ports.calls.length = 0;
    engine.delta('out twenty four hours');
    expect(ports.calls[0]).toBe('play:3');
    expect(ports.calls).toContain('listener');
  });

  it('a line play() refuses is held like a cold one until audioReady', () => {
    const p = fakePorts(); let ok = false;
    p.player.play = (line, at) => { if (!ok) return false; p.scheduled.push({ line, at }); return true; };
    const e = new Engine(buildScript(LINES, 'ANNA'), p);
    e.begin();
    fire(1e6);
    expect(e.snapshot().state).toBe('partner');
    expect(p.mic.open).not.toHaveBeenCalled();
    ok = true; e.audioReady(0);
    expect(p.scheduled[0]).toEqual({ line: 0, at: p.now() });
  });

  it('a refused play on the next beat leaves handover_ms null, even with a duration', () => {
    const p = fakePorts();
    p.player.play = (line, at) => { if (line === 3) return false; p.scheduled.push({ line, at }); return true; };
    const e = new Engine(buildScript(LINES, 'ANNA'), p);
    e.begin(); const end = 100 + 1.5 + BREATH_S; p.tick(end - 100); fire(end);
    p.tick(1); e.delta('out twenty four hours');
    expect(p.journal.emit).toHaveBeenCalledWith('actor_line_read', 2, expect.any(Number),
      expect.objectContaining({ ended_by: 'last_word', handover_ms: null }));
    expect(e.snapshot().state).toBe('partner');
  });

  it('a cold line decoding while paused schedules nothing; resume plays it', () => {
    const p = fakePorts(); const dur: Record<number, number | null> = { 0: null, 1: 0.5 };
    p.player.duration = (l) => dur[l] ?? null;
    const e = new Engine(buildScript(LINES, 'ANNA'), p);
    e.begin(); e.pause();
    dur[0] = 1.0; e.audioReady(0);
    expect(p.scheduled).toEqual([]);
    e.resume();
    expect(p.scheduled[0]).toEqual({ line: 0, at: p.now() });
  });

  it('nothing moves after abandon: no jump, and never completed', () => {
    engine.begin();
    engine.abandon();
    engine.jumpTo(2);
    engine.back(); engine.resume(); engine.delta('out twenty four hours'); engine.quiet();
    fire(1e6);
    expect(engine.snapshot().state).toBe('ended');
    const types = vi.mocked(ports.journal.emit).mock.calls.map(c => c[0]);
    expect(types).not.toContain('jumped');
    expect(types).not.toContain('completed');
  });

  it('jumpTo any line starts that turn', () => {
    engine.begin();
    engine.jumpTo(4);
    expect(engine.snapshot()).toMatchObject({ state: 'actor', lineIndex: 4 });
    expect(ports.journal.emit).toHaveBeenCalledWith('jumped', 4, expect.any(Number), { from: 0 });
  });

  it('jumpTo a line inside a beat starts the beat on that line, not its first', () => {
    engine.begin(); engine.jumpTo(4);
    ports.scheduled.length = 0;
    engine.jumpTo(1);
    expect(ports.scheduled[0]).toEqual({ line: 1, at: ports.now() });
    expect(ports.scheduled).toHaveLength(1);
    expect(ports.journal.emit).toHaveBeenCalledWith('jumped', 1, expect.any(Number), { from: 4 });
  });

  it('skip while the partner speaks goes on to the next line', () => {
    engine.begin(); fire(100); // line 0 sounding
    ports.scheduled.length = 0;
    engine.skip();
    expect(ports.scheduled[0]).toEqual({ line: 1, at: ports.now() });
    engine.skip();
    expect(engine.snapshot()).toMatchObject({ state: 'actor', lineIndex: 2 });
  });

  it('skip on the last partner line ends the scene', () => {
    const e = new Engine(buildScript([...LINES, L(5, 'BEN', 'Bye.')], 'ANNA'), ports);
    ports.player.duration = () => 0.3;
    e.begin(); e.jumpTo(5);
    e.skip();
    expect(e.snapshot().state).toBe('ended');
  });

  it('a partner line whose audio is missing waits for it, then plays', () => {
    const p = fakePorts(); const dur: Record<number, number | null> = { 0: null, 1: 0.5 };
    p.player.duration = (l) => dur[l] ?? null;
    const e = new Engine(buildScript(LINES, 'ANNA'), p);
    e.begin();
    expect(p.scheduled).toEqual([]);
    expect(e.snapshot().state).toBe('partner');
    dur[0] = 1.0; e.audioReady(0);
    expect(p.scheduled[0]).toEqual({ line: 0, at: p.now() });
  });

  it('a cold line mid-beat holds there and goes on from that line, not from the top', () => {
    const p = fakePorts(); const dur: Record<number, number | null> = { 0: 1.0, 1: null };
    p.player.duration = (l) => dur[l] ?? null;
    const e = new Engine(buildScript(LINES, 'ANNA'), p);
    e.begin();
    expect(p.scheduled).toEqual([{ line: 0, at: 100 }]);
    p.tick(0.2); dur[1] = 0.5; e.audioReady(1);
    expect(p.scheduled).toEqual([{ line: 0, at: 100 }, { line: 1, at: 100 + 1.0 + BREATH_S }]);
  });

  it('begin(fromLine) enters that line\'s turn directly: no line 0, no jump', () => {
    engine.begin(4);
    expect(engine.snapshot()).toMatchObject({ state: 'actor', lineIndex: 4 });
    const calls = vi.mocked(ports.journal.emit).mock.calls;
    expect(calls.map(c => [c[0], c[1]])).toEqual([['started', 4], ['line_reached', 4]]);
    expect(ports.scheduled).toEqual([]);
  });

  it('begin(fromLine) on a partner line plays its beat from the beat\'s first line', () => {
    engine.begin(3);
    expect(engine.snapshot().state).toBe('partner');
    expect(ports.scheduled).toEqual([{ line: 3, at: 100 }]);
    expect(vi.mocked(ports.journal.emit).mock.calls[0].slice(0, 2)).toEqual(['started', 3]);
  });

  it('begin() journals started with no line', () => {
    engine.begin();
    expect(ports.journal.emit).toHaveBeenNthCalledWith(1, 'started', null, 0);
  });

  it('abandon(reason) journals the reason; without one, an empty payload', () => {
    engine.begin();
    engine.abandon('stt_failed');
    expect(ports.journal.emit).toHaveBeenLastCalledWith('abandoned', 0, expect.any(Number), { reason: 'stt_failed' });
    const e = new Engine(buildScript(LINES, 'ANNA'), ports);
    e.begin(); e.abandon();
    expect(ports.journal.emit).toHaveBeenLastCalledWith('abandoned', 0, expect.any(Number), {});
  });

  it('snapshot names the actor', () => {
    expect(engine.snapshot().actor).toBe('ANNA');
  });

  it('aligning a 200-word line against a 200-word transcript stays under 5ms', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i % 37}`);
    const transcript = words.join(' ');
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) liveRead(words, transcript);
    expect((performance.now() - t0) / 10).toBeLessThan(5);
  });
});

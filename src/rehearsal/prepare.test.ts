import { describe, expect, it, vi } from 'vitest';
import type { RehearsalLine, ScenePayload } from './contract';
import { buildScript } from './script';
import { canBegin, firstNeededLine, limit, liveFailureKind, makeFlusher, runFailure, neededFailure, plainError, planPartnerAudio } from './prepare';

const L = (index: number, character: string, text = 'Some words here.'): RehearsalLine => ({ index, character, text, direction: null });

const payload = (lines: RehearsalLine[], over: Partial<ScenePayload> = {}): ScenePayload => ({
  scene: { id: 7, title: 't', act: null, scene_number: null, play_title: null, is_library: true },
  lines,
  characters: ['ANNA', 'BEN', 'CARL'],
  voices: [{ id: 'v-default', label: 'D', gender: 'female' }],
  defaults: { ANNA: { BEN: 'v-ben', CARL: 'v-carl' }, BEN: { ANNA: 'v-anna', CARL: 'v-carl' } },
  vendor: 'openai',
  audio: {},
  resume: null,
  ...over,
});

describe('canBegin', () => {
  it('needs line 1 and the live session, and no error', () => {
    expect(canBegin({ line1: true, stt: true, mic: true, error: null })).toBe(true);
    expect(canBegin({ line1: true, stt: true, mic: false, error: null })).toBe(true);
    expect(canBegin({ line1: false, stt: true, mic: true, error: null })).toBe(false);
    expect(canBegin({ line1: true, stt: false, mic: true, error: null })).toBe(false);
    expect(canBegin({ line1: true, stt: true, mic: true, error: 'x' })).toBe(false);
  });
});

describe('firstNeededLine', () => {
  const lines = [L(0, 'BEN'), L(1, 'CARL'), L(2, 'ANNA'), L(3, 'BEN'), L(4, 'ANNA')];
  it('is the first partner line when the scene opens on the partner', () => {
    expect(firstNeededLine(buildScript(lines, 'ANNA'))).toBe(0);
  });
  it('is null when the actor speaks first', () => {
    expect(firstNeededLine(buildScript(lines, 'BEN'))).toBeNull();
  });
  it('on a resume, is the first line of the beat holding the resume line', () => {
    expect(firstNeededLine(buildScript(lines, 'ANNA'), 3)).toBe(3);
    expect(firstNeededLine(buildScript(lines, 'ANNA'), 1)).toBe(0);
    expect(firstNeededLine(buildScript(lines, 'ANNA'), 4)).toBeNull();
  });
  it('is null for an unknown resume line or an empty scene', () => {
    expect(firstNeededLine(buildScript(lines, 'ANNA'), 99)).toBeNull();
    expect(firstNeededLine(buildScript([], 'ANNA'))).toBeNull();
  });
});

describe('planPartnerAudio', () => {
  const lines = [L(0, 'BEN'), L(1, 'ANNA'), L(2, 'Carl '), L(3, 'ANNA')];
  const audio = { '0': { key: 'k0', url: 'u0' }, '2': { key: 'k2', url: null } };

  it('uses the payload slots when the pick is the default part and voices', () => {
    const p = payload(lines, { audio });
    const plan = planPartnerAudio(p, buildScript(lines, 'anna'), { BEN: 'v-ben', CARL: 'v-carl' });
    expect(plan).toEqual([
      { lineIndex: 0, character: 'BEN', voice: 'v-ben', source: { key: 'k0', url: 'u0' } },
      { lineIndex: 2, character: 'Carl ', voice: 'v-carl', source: { key: 'k2', url: null } },
    ]);
  });

  it('asks per line for a character whose voice was changed', () => {
    const p = payload(lines, { audio });
    const plan = planPartnerAudio(p, buildScript(lines, 'ANNA'), { BEN: 'v-other', CARL: 'v-carl' });
    expect(plan.map(s => [s.lineIndex, s.voice, s.source])).toEqual([[0, 'v-other', null], [2, 'v-carl', { key: 'k2', url: null }]]);
  });

  it('asks for every line when the payload does not cover the part picked', () => {
    const p = payload(lines, { audio });
    const plan = planPartnerAudio(p, buildScript(lines, 'BEN'), {});
    expect(plan.map(s => [s.lineIndex, s.voice, s.source])).toEqual([[1, 'v-anna', null], [2, 'v-carl', null], [3, 'v-anna', null]]);
  });

  it('falls back to the first voice when nothing names one', () => {
    const p = payload(lines, { defaults: {} });
    const plan = planPartnerAudio(p, buildScript(lines, 'ANNA'), {});
    expect(plan.every(s => s.voice === 'v-default' && s.source === null)).toBe(true);
  });
});

describe('makeFlusher', () => {
  it('coalesces requests made in one tick into one flush', async () => {
    const flush = vi.fn(async () => {});
    const request = makeFlusher(flush, fn => queueMicrotask(fn));
    request(); request(); request();
    expect(flush).not.toHaveBeenCalled();
    await new Promise(r => setTimeout(r, 0));
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('flushes again for events emitted while a send was in flight', async () => {
    let release!: () => void;
    const flush = vi.fn(() => new Promise<void>(r => { release = r; }));
    const request = makeFlusher(flush, fn => queueMicrotask(fn));
    request();
    await new Promise(r => setTimeout(r, 0));
    expect(flush).toHaveBeenCalledTimes(1);
    request(); // emitted during the send
    await new Promise(r => setTimeout(r, 0));
    expect(flush).toHaveBeenCalledTimes(1);
    release();
    await new Promise(r => setTimeout(r, 0));
    expect(flush).toHaveBeenCalledTimes(2);
    release();
    await new Promise(r => setTimeout(r, 0));
    expect(flush).toHaveBeenCalledTimes(2); // nothing new: it stops
  });

  it('a failing send does not loop', async () => {
    const flush = vi.fn(async () => { throw new Error('down'); });
    const request = makeFlusher(flush, fn => queueMicrotask(fn));
    request();
    await new Promise(r => setTimeout(r, 0));
    expect(flush).toHaveBeenCalledTimes(1);
  });
});

describe('limit', () => {
  it('keeps at most n in flight, and starts the next as one settles', async () => {
    const run = limit(2);
    let inflight = 0, peak = 0;
    const releases: Array<() => void> = [];
    const task = () => run(() => new Promise<void>(r => { inflight++; peak = Math.max(peak, inflight); releases.push(() => { inflight--; r(); }); }));
    const all = Promise.all([task(), task(), task(), task(), task()]);
    await Promise.resolve();
    expect(releases.length).toBe(2);
    while (releases.length) { releases.shift()!(); await new Promise(r => setTimeout(r, 0)); }
    await all;
    expect(peak).toBe(2);
  });

  it('a rejection frees its slot and reaches the caller', async () => {
    const run = limit(1);
    await expect(run(async () => { throw new Error('x'); })).rejects.toThrow('x');
    await expect(run(async () => 5)).resolves.toBe(5);
  });
});

describe('neededFailure', () => {
  const failed = new Map([[2, 'audio 500'], [6, 'audio 404']]);
  it('names the first failed line the run has not passed', () => {
    expect(neededFailure(failed, 0)).toBe(2);
    expect(neededFailure(failed, 2)).toBe(2);
    expect(neededFailure(failed, 3)).toBe(6);
  });
  it('is null once every failed line is behind the run', () => {
    expect(neededFailure(failed, 7)).toBeNull();
    expect(neededFailure(new Map(), 0)).toBeNull();
  });
});

describe('plainError', () => {
  it('says each failure in the spec sentence, never the raw message', () => {
    expect(plainError('stt')).toBe('The live microphone dropped. Reload to run again.');
    expect(plainError('mic')).toBe('The microphone is blocked. Allow it in your browser and reload.');
    expect(plainError('line')).toBe('A partner line could not load. Reload to run again.');
    expect(plainError('other')).toBe('Something broke. Reload to run again.');
  });
  it('blames the microphone only when no stream was obtained', () => {
    expect(liveFailureKind(false)).toBe('mic');
    expect(liveFailureKind(true)).toBe('stt');
  });
});

describe('runFailure', () => {
  const thrown = (status: number, data: unknown) => Object.assign(new Error('x'), { response: { status, statusText: '', data } });
  const gate = {
    error: 'library_upgrade_required',
    message: 'This scene is part of the full library. Upgrade to Plus for the whole catalog.',
    upgrade_url: '/pricing',
  };

  it('reads the Plus gate: its own message and the plans link', () => {
    expect(runFailure(thrown(403, { detail: gate }))).toEqual({ kind: 'gate', message: gate.message, upgradeUrl: '/pricing' });
  });
  it('reads the session meter the same way, 403 or 429', () => {
    const meter = { error: 'scene_partner_limit_exceeded', message: "You've reached your limit.", limit: 3, used: 3, upgrade_url: '/pricing' };
    expect(runFailure(thrown(429, { detail: meter })).kind).toBe('gate');
  });
  it('never links off the site', () => {
    expect(runFailure(thrown(403, { detail: { ...gate, upgrade_url: 'https://evil.example' } })).upgradeUrl).toBeNull();
    expect(runFailure(thrown(403, { detail: { ...gate, upgrade_url: '//evil.example' } })).upgradeUrl).toBeNull();
    expect(runFailure(thrown(403, { detail: { ...gate, upgrade_url: '/\\evil.com' } })).upgradeUrl).toBeNull();
  });
  it('is other for anything that is not the gate shape', () => {
    const other = { kind: 'other', message: plainError('other'), upgradeUrl: null };
    expect(runFailure(thrown(403, { detail: 'Forbidden' }))).toEqual(other);
    expect(runFailure(thrown(500, { detail: gate }))).toEqual(other);
    expect(runFailure(thrown(422, { detail: [{ msg: 'bad' }] }))).toEqual(other);
    expect(runFailure(new Error('Backend unreachable'))).toEqual(other);
    expect(runFailure(null)).toEqual(other);
  });
});

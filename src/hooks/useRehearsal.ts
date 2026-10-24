/**
 * Wires the pure engine to the phone: the clock, one LinePlayer, the
 * LineLoader, Apple's recogniser and the journal transport. Publishes one
 * engine snapshot per frame. It is the only hook the run screen reads.
 *
 * `prepare` once per mount, then `begin` from the Begin tap.
 * - prepare opens the run first, so the gate on POST /runs refuses before
 *   anything is paid for (the screen shows the wall). Then the microphone is
 *   asked for and the partner audio loads, the first needed line ahead of the
 *   rest; Begin lights when that line is decoded and the recogniser is there.
 * - The mirror of actorrise hooks/useRehearsal.ts; keep the two in step.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { openGuidedRun, openRun, postEvents, requestAudio, resumeRun, RehearsalApiError } from '../api/rehearsal';
import type { GuidedRun, ScenePayload } from '../rehearsal/contract';
import { Engine, type Snapshot } from '../rehearsal/engine';
import { Journal, type JournalTransport } from '../rehearsal/journal';
import { Clock } from '../rehearsal/native/clock';
import { LineLoader } from '../rehearsal/native/loader';
import { Mic } from '../rehearsal/native/mic';
import { LinePlayer } from '../rehearsal/native/player';
import {
  type AudioSlot, canBegin, firstNeededLine, limit, makeFlusher, neededFailure, plainError, planPartnerAudio, type Readiness,
} from '../rehearsal/prepare';
import { buildScript } from '../rehearsal/script';

export interface Rehearsal {
  snapshot: Snapshot | null;
  readiness: Readiness;
  canBegin: boolean;
  /** The gate said no: the wall, not an error. */
  gated: boolean;
  prepare: (character: string, voices: Record<string, string>, opts?: { guided?: boolean | 'pick'; resumeRunId?: number; resumeLine?: number }) => Promise<void>;
  begin: () => void;
  pause: () => void; resume: () => void; skip: () => void; back: () => void; jumpTo: (line: number) => void;
  leave: () => void;
}

type Opened = { run_id: number; scene_id: number; character: string; voices: Record<string, string> };

function transportFor(runId: number): JournalTransport {
  return {
    send: events => postEvents(runId, events),
    // No page unload on a phone; a background flush is the same call, best effort.
    beacon: events => { void postEvents(runId, events).catch(() => {}); return true; },
  };
}

export function useRehearsal(payload: ScenePayload): Rehearsal {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [base, setBase] = useState<Readiness>({ line1: false, stt: false, mic: false, error: null, upgradeUrl: null });
  const [lineError, setLineError] = useState<string | null>(null);
  const [gated, setGated] = useState(false);
  const engineRef = useRef<Engine | null>(null);
  const clockRef = useRef<Clock | null>(null);
  const playerRef = useRef<LinePlayer | null>(null);
  const loaderRef = useRef<LineLoader | null>(null);
  const micRef = useRef<Mic | null>(null);
  const journalRef = useRef<Journal | null>(null);
  const frameRef = useRef<number | null>(null);
  const resumeLineRef = useRef<number | null>(null);
  const preparedRef = useRef(false);
  const failedRef = useRef(new Map<number, string>());

  const fail = useCallback((error: string) => setBase(b => (b.error ? b : { ...b, error })), []);

  const publish = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setSnapshot(engineRef.current?.snapshot() ?? null);
    });
  }, []);

  const prepare = useCallback<Rehearsal['prepare']>(async (character, voices, opts) => {
    if (preparedRef.current) return;
    preparedRef.current = true;
    // A new attempt starts ungated: the plan may have changed under the sheet.
    setGated(false);
    setBase(b => ({ ...b, error: null, upgradeUrl: null }));
    let run: Opened;
    let resumeLine: number | null = opts?.resumeLine ?? null;
    try {
      if (opts?.resumeRunId !== undefined) {
        const picked = await resumeRun(opts.resumeRunId);
        run = picked;
        resumeLine = picked.line_index;
      } else if (opts?.guided) {
        // One of the phone's first scenes, with the part and the voice chosen
        // on the way in; or the server's own pick when the scene is the one it names.
        run = (await openGuidedRun(opts.guided === 'pick' ? { sceneId: payload.scene.id, character, voices } : undefined)) as GuidedRun;
      } else {
        const opened = await openRun(payload.scene.id, character, voices);
        run = { scene_id: payload.scene.id, character, ...opened };
      }
    } catch (e) {
      preparedRef.current = false;
      if (e instanceof RehearsalApiError && e.gated) { setGated(true); setBase(b => ({ ...b, error: e.message, upgradeUrl: e.upgradeUrl })); return; }
      fail(plainError('other'));
      return;
    }
    if (run.scene_id !== payload.scene.id) {
      fail(plainError('other'));
      void postEvents(run.run_id, [{ seq: 0, type: 'abandoned', line_index: null, at_ms: 0, payload: { reason: 'scene_mismatch' } }]).catch(() => {});
      preparedRef.current = false;
      return;
    }

    const clock = (clockRef.current ??= new Clock());
    const player = (playerRef.current ??= new LinePlayer(clock));
    const loader = (loaderRef.current ??= new LineLoader(player));
    const journal = (journalRef.current = new Journal(transportFor(run.run_id)));
    const flush = makeFlusher(() => journal.flush(), queueMicrotask);
    const mic = (micRef.current ??= new Mic({
      onTranscript: t => engineRef.current?.delta(t),
      onOverheard: t => engineRef.current?.overhear(t),
      onQuiet: () => engineRef.current?.quiet(),
      onFailed: () => { fail(plainError('stt')); engineRef.current?.abandon('stt_failed'); },
    }));
    mic.attach();
    const script = buildScript(payload.lines, run.character);
    const engine = new Engine(script, {
      clock: { now: () => clock.now(), outputLatency: () => clock.outputLatency() },
      player: { duration: l => player.duration(l), play: (l, at) => player.play(l, at), stopAll: () => player.stopAll() },
      mic: { prime: k => mic.prime(k), listen: () => mic.listen(), stop: () => mic.stop(), open: () => mic.openTurn(), close: () => mic.closeTurn() },
      journal: { emit: (type, line, at, p) => { journal.emit(type, line, at, p ?? {}); flush(); } },
      schedule: (at, fn) => clock.schedule(at, fn),
    });
    resumeLineRef.current = resumeLine;
    const first = firstNeededLine(script, resumeLine);
    const start = first ?? resumeLine ?? 0;
    const cursor = () => { const s = engine.snapshot(); return s.state === 'ready' ? start : s.lineIndex; };
    const follow = () => {
      const at = cursor();
      loader.ahead(at);
      setLineError(neededFailure(failedRef.current, at) === null ? null : plainError('line'));
    };
    let last = -1;
    engine.subscribe(() => { if (__DEV__) { const s = engine.snapshot(); console.log('[rehearsal]', s.state, 'line', s.lineIndex, 'sounding', s.sounding, 'pos', s.read.position); } publish(); const at = cursor(); if (at !== last) { last = at; follow(); } });
    engineRef.current = engine;
    publish();
    if (first === null) setBase(b => ({ ...b, line1: true }));

    // The microphone and the recogniser: asked for here, on the cast sheet, with the scene in view.
    void Mic.permission().then(ok => {
      const there = ok && Mic.available();
      setBase(b => ({ ...b, mic: ok, stt: there, error: b.error ?? (there ? null : plainError(ok ? 'stt' : 'mic')) }));
    });

    const failed = (l: number, why: string) => { failedRef.current.set(l, why); follow(); };
    loader.onReady = l => {
      if (__DEV__) console.log('[loader] ready', l, 'first', first, 'turn0', JSON.stringify(script.turns[0]).slice(0, 120));
      engine.audioReady(l);
      if (failedRef.current.delete(l)) follow();
      if (l === first) setBase(b => ({ ...b, line1: true }));
    };
    loader.onFailed = failed;
    const slow = limit(4);
    const set = (s: AudioSlot) => (s.source ? Promise.resolve(s.source)
      : slow(() => requestAudio(payload.scene.id, s.lineIndex, s.voice)))
      .then(src => { loader.set(s.lineIndex, src); loader.ahead(cursor()); },
        e => failed(s.lineIndex, e instanceof Error ? e.message : String(e)));
    const slots = planPartnerAudio(payload, script, run.voices);
    if (__DEV__) console.log('[plan]', JSON.stringify(slots.map(x => [x.lineIndex, x.voice, Boolean(x.source)])), 'lines', payload.lines.map(l => l.index).join(','));
    const head = slots.find(s => s.lineIndex === first);
    if (head) await set(head);
    await Promise.all(slots.filter(s => s !== head).map(set));
  }, [payload, publish, fail]);

  const begin = useCallback(() => {
    engineRef.current?.begin(resumeLineRef.current ?? undefined);
  }, []);

  // Backgrounded: pause and send what is pending. The scene does not resume by itself.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active') { engineRef.current?.pause(); journalRef.current?.beacon(); }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => () => {
    engineRef.current?.abandon('unmounted');
    journalRef.current?.beacon();
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    loaderRef.current?.stop();
    micRef.current?.detach();
    playerRef.current?.close();
  }, []);

  const controls = useMemo(() => ({
    pause: () => engineRef.current?.pause(),
    resume: () => engineRef.current?.resume(),
    skip: () => engineRef.current?.skip(),
    back: () => engineRef.current?.back(),
    jumpTo: (l: number) => engineRef.current?.jumpTo(l),
    leave: () => { engineRef.current?.abandon('left'); journalRef.current?.beacon(); },
  }), []);

  const readiness: Readiness = { ...base, error: base.error ?? lineError };
  return { snapshot, readiness, canBegin: canBegin(readiness), prepare, begin, gated, ...controls };
}

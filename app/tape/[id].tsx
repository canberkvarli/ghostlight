import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Pressable, ScrollView, Share, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEventListener } from 'expo';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  ZoomIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  cancelAnimation,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';

import { getMonologueById, type Monologue } from '../../src/data/monologues';
import { getMonologue } from '../../src/api/client';
import { apiToMonologue } from '../../src/data/adapt';
import { getOffline } from '../../src/lib/offline';
import { unitsOf } from '../../src/lib/segments';
import { useSession } from '../../src/lib/useSession';
import { useFavorites, useSavedPiece } from '../../src/hooks/useFavorites';
import { useAudition, usePatchAudition } from '../../src/hooks/useAuditions';
import { tapeSent } from '../../src/lib/tapeFor';
import { dayLabel, clockLabel } from '../../src/lib/when';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { paywallHref } from '../../src/lib/paywall';
import { useGoBack } from '../../src/lib/nav';
import { track } from '../../src/lib/analytics';
import { loadRecents, type RecentPiece } from '../../src/lib/recents';
import { colors } from '../../src/theme/tokens';
import { EMPTY_READ, lineWords, liveRead, type LiveRead } from '../../src/rehearsal/live-read';
import { displayRuns } from '../../src/rehearsal/display-words';
import { hearCue, lineAt, takeEnd, type CueHit, type Heard, type ReadMark, type TapePhase } from '../../src/rehearsal/tape-cues';
import { TapeEar } from '../../src/rehearsal/native/tape-ear';
import {
  addTake,
  allTakes,
  deleteTake,
  FREE_TAPE,
  rememberTapePiece,
  setStarred,
  setTrim,
  SLATE_TAPE,
  takeFile,
  takesFor,
  thumbFile,
  type Take,
} from '../../src/lib/takes';
import { canExport, exportTake } from '../../modules/tape-export';
import { DEFAULT_SETTINGS, loadTapeSettings, saveTapeSettings, slateLines, type TapeSettings } from '../../src/lib/tapeSettings';
import { playTone, releaseTones, ROLL_TONE_MS } from '../../src/lib/tapeTones';

/**
 * Tape it: the self-tape room.
 *
 * It opens on the camera, already framed, already listening. Say "action"
 * and it rolls, say "cut" and it stops and plays the take straight back. Say
 * "action" again for the next one, "keeper" to keep the one you liked. The
 * piece runs under the lens as you say it, so your eyes stay near the camera,
 * and goes away when you reach the end, so you can hold the moment.
 *
 * One bar at the top, one at the bottom, each on its own soft shadow. Every
 * button says what it does. While rolling there is nothing on the glass but
 * the clock and the stop.
 *
 * The ear knows the piece. A "cut" in the text is a line, not a cue (see
 * tape-cues.ts), and the take ends a held beat after your last word, before
 * the cue was said, so the export is clean.
 *
 * Every take is kept on the phone, in Tapes (the library at the bottom right).
 * Free takes save with a small Ghost Light mark in the corner; a paid plan
 * saves them clean.
 */

type Phase = 'ready' | 'countdown' | 'rolling' | 'review';

const WHITE = '#fffaf3';
const DIM = 'rgba(255,250,243,0.6)';
const GLASS = 'rgba(8,5,4,0.46)';
const GLOW = colors.stageGlow;
const ROLL_RED = '#e5484d';
const EASE = Easing.out(Easing.cubic);
/** The top bar's height under the safe area. */
const BAR_H = 56;
/** The longest take: a monologue is two minutes, a long one five. */
const MAX_TAKE_S = 600;
/** How often the ear's rules look again with nothing new heard (the settle rule needs time to pass). */
const TICK_MS = 150;

const SANS = 'BricolageGrotesque_600SemiBold';
const SANS_M = 'BricolageGrotesque_500Medium';
const SERIF = 'InstrumentSerif_400Regular';
const TYPE = 'CourierPrime_400Regular';
const TYPE_I = 'CourierPrime_400Regular_Italic';

export default function TapeRoom() {
  const { id, take: takeParam, name: nameParam, audition: auditionParam } = useLocalSearchParams<{ id: string; take?: string; name?: string; audition?: string }>();
  const router = useRouter();
  const goBack = useGoBack('/search');
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const qc = useQueryClient();
  useKeepAwake();

  /* ─── The piece ───────────────────────────────────────────────────── */

  const [settings, setSettingsState] = useState<TapeSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  useEffect(() => { loadTapeSettings().then((s) => { setSettingsState(s); setSettingsLoaded(true); }).catch(() => setSettingsLoaded(true)); }, []);
  const setSettings = useCallback((next: TapeSettings) => { setSettingsState(next); void saveTapeSettings(next); }, []);
  useEffect(() => () => releaseTones(), []);

  const slate = id === SLATE_TAPE;
  const free = !id || id === FREE_TAPE || slate;
  const fixture = id && !free ? getMonologueById(id) : undefined;
  const { data: fetched, isFetching } = useQuery<Monologue>({
    queryKey: ['monologue', id],
    enabled: !free && !fixture,
    retry: false,
    queryFn: () => loadPiece(id!),
  });
  const monologue = free ? undefined : fixture ?? fetched;
  const loading = !free && !monologue && isFetching;
  const { isAuthenticated } = useSession();
  const saved = useSavedPiece(free ? '' : id ?? '', isAuthenticated && !free);
  const { isPaid } = useEntitlement();
  // Taping for an audition on the Board: the room says which, and the take can mark it sent.
  const auditionId = auditionParam ? Number(auditionParam) || null : null;
  const audition = useAudition(auditionId, isAuthenticated && auditionId != null);
  const patchAudition = usePatchAudition();
  const auditionSent = audition ? tapeSent(audition) : false;
  const markSent = useCallback(() => {
    if (!audition) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    patchAudition.mutate({ id: audition.id, patch: { status: auditionSent ? 'scheduled' : 'submitted' } });
    track('app_tape_marked_sent', { on: !auditionSent, from: 'tape' });
  }, [audition, auditionSent, patchAudition]);
  const [sheet, setSheet] = useState<'piece' | 'tapes' | 'settings' | null>(null);
  const pieceName = slate ? 'Slate' : free ? 'No script' : monologue?.character ?? nameParam ?? ' ';

  // The same lines the run uses: the cut alone when one is set. The slate's are your own.
  const lines = useMemo(() => {
    if (slate) return slateLines(settings.slate);
    const units = unitsOf(monologue?.fullText ?? '');
    const src = saved ?? monologue;
    if (src?.cutStart != null && src?.cutEnd != null && units.length) {
      const lo = Math.min(src.cutStart, src.cutEnd, units.length - 1);
      const hi = Math.min(Math.max(src.cutStart, src.cutEnd), units.length - 1);
      return units.slice(lo, hi + 1).map((u) => u.text);
    }
    return units.map((u) => u.text);
  }, [monologue, saved, slate, settings.slate]);
  const lineWordsOf = useMemo(() => lines.map((l) => lineWords(l)), [lines]);
  const script = useMemo(() => lineWordsOf.flat(), [lineWordsOf]);
  const lineLengths = useMemo(() => lineWordsOf.map((w) => w.length), [lineWordsOf]);

  /* ─── The room's state ────────────────────────────────────────────── */

  const [phase, setPhaseState] = useState<Phase>('ready');
  const phaseRef = useRef<Phase>('ready');
  const setPhase = useCallback((p: Phase) => { phaseRef.current = p; setPhaseState(p); }, []);
  // The camera you used last time. The back one is sharper; it works blind, by voice and tone.
  const facing: CameraType = settings.facing;
  const setFacing = (f: CameraType) => setSettings({ ...settings, facing: f === 'back' ? 'back' : 'front' });
  const [prompter, setPrompter] = useState(true);
  const [turn, setTurn] = useState(0); // degrees the room's chrome is turned, to follow the phone
  const turnRef = useRef(0);
  turnRef.current = turn;
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [takes, setTakes] = useState<Take[]>([]);
  const [current, setCurrent] = useState<Take | null>(null);

  const camera = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [camPerm, askCam] = useCameraPermissions();
  const [micPerm, askMic] = useMicrophonePermissions();
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !camPerm || !micPerm) return;
    asked.current = true;
    (async () => {
      if (!camPerm.granted && camPerm.canAskAgain) await askCam();
      if (!micPerm.granted && micPerm.canAskAgain) await askMic();
    })().catch(() => {});
  }, [camPerm, micPerm, askCam, askMic]);
  const allowed = Boolean(camPerm?.granted && micPerm?.granted);
  const refused = Boolean(camPerm && micPerm && (!camPerm.granted || !micPerm.granted) && asked.current && !(camPerm.canAskAgain && micPerm.canAskAgain));

  // A piece's takes; and, opened from Tapes, straight onto the one picked.
  useEffect(() => {
    const piece = id || FREE_TAPE;
    let alive = true;
    takesFor(piece).then((list) => {
      if (!alive) return;
      setTakes(list);
      const open = takeParam ? list.find((t) => t.id === takeParam) : undefined;
      if (open) {
        setCurrent(open);
        setPhase('review');
        router.setParams({ take: undefined });
      } else if (!takeParam) {
        setCurrent(null);
        if (phaseRef.current === 'review') setPhase('ready');
      }
    }).catch(() => {});
    void rememberTapePiece(piece);
    if (!takeParam) track('app_tape_opened', { id: piece });
    return () => { alive = false; };
  }, [id, takeParam, router, setPhase]);

  /* ─── The ear ─────────────────────────────────────────────────────── */

  const ear = useRef<TapeEar | null>(null);
  const [hearing, setHearing] = useState(false); // the ear is on
  const [earOff, setEarOff] = useState(false); // the actor turned it off
  const level = useSharedValue(0);
  const heard = useRef<Heard>({ words: [], at: [] });
  const read = useRef<LiveRead>(EMPTY_READ);
  const reads = useRef<ReadMark[]>([]);
  const [position, setPosition] = useState(0);
  const playing = useRef(false);
  const scriptRef = useRef(script);
  scriptRef.current = script;
  const onCue = useRef<(hit: CueHit) => void>(() => {});

  const listenForCue = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'countdown') return;
    if (p === 'review' && playing.current) return; // the take's own words, out of the speaker
    const hit = hearCue({ phase: p as TapePhase, heard: heard.current, now: Date.now(), script: scriptRef.current, reads: reads.current });
    if (!hit) return;
    ear.current?.reset();
    onCue.current(hit);
  }, []);

  const startEar = useCallback(async () => {
    if (ear.current || !TapeEar.available() || !(await TapeEar.permission())) return;
    const e = new TapeEar({
      onHeard: (h) => {
        heard.current = h;
        if (phaseRef.current === 'rolling' && scriptRef.current.length) {
          const r = liveRead(scriptRef.current, h.words.join(' '), read.current);
          read.current = r;
          reads.current.push({ t: Date.now(), position: r.position });
          if (reads.current.length > 2000) reads.current.splice(0, 500);
          setPosition((p) => Math.max(p, r.position));
        }
        listenForCue();
      },
      onLevel: (v) => {
        level.value = withTiming(v, { duration: 140 });
        levels.current.push({ t: Date.now(), v });
        if (levels.current.length > 40) levels.current.shift();
      },
      onFailed: () => { ear.current?.detach(); ear.current = null; setHearing(false); },
    });
    e.attach();
    e.prime(scriptRef.current);
    e.listen();
    ear.current = e;
    setHearing(true);
  }, [level, listenForCue]);

  const stopEar = useCallback(() => {
    ear.current?.detach();
    ear.current = null;
    setHearing(false);
    level.value = withTiming(0, { duration: 200 });
  }, [level]);

  // The ear opens once the camera has the microphone, so the camera's audio
  // session is already set when the recogniser builds on it.
  useEffect(() => {
    if (!cameraReady || !allowed || earOff || ear.current) return;
    const t = setTimeout(() => { void startEar(); }, 350);
    return () => clearTimeout(t);
  }, [cameraReady, allowed, earOff, startEar]);
  useEffect(() => { if (ear.current && script.length) ear.current.prime(script); }, [script]);
  // The room check: loud for two seconds with no words heard is the room, not
  // you, and the ear may miss a cue in it. Said once, quietly, before a take.
  const levels = useRef<{ t: number; v: number }[]>([]);
  const [noisy, setNoisy] = useState(false);
  const noisyRef = useRef(false);
  const checkRoom = useCallback(() => {
    const now = Date.now();
    const recent = levels.current.filter((l) => now - l.t < 2000);
    const lastWord = heard.current.at[heard.current.at.length - 1] ?? 0;
    const loud = phaseRef.current === 'ready' && recent.length >= 8 && now - lastWord > 2000 && recent.reduce((s, l) => s + l.v, 0) / recent.length > 0.5;
    if (loud !== noisyRef.current) { noisyRef.current = loud; setNoisy(loud); }
  }, []);
  useEffect(() => {
    const t = setInterval(() => { listenForCue(); checkRoom(); }, TICK_MS);
    return () => clearInterval(t);
  }, [listenForCue, checkRoom]);
  useEffect(() => () => { ear.current?.detach(); ear.current = null; }, []);

  const toggleEar = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (ear.current) { setEarOff(true); stopEar(); return; }
    setEarOff(false);
    void startEar();
  }, [startEar, stopEar]);

  /* ─── Rolling ─────────────────────────────────────────────────────── */

  const recording = useRef<Promise<{ uri: string } | undefined> | null>(null);
  const startedAt = useRef(0);
  const stopping = useRef(false);
  const rolledTurn = useRef(0);
  const stopRef = useRef<(hit: CueHit | null, discard?: boolean) => Promise<void>>(async () => {});

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const countdownVia = useRef<'voice' | 'tap'>('tap');

  const roll = useCallback(async (via: 'voice' | 'tap') => {
    if (!camera.current || phaseRef.current === 'rolling') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    // The tone first, so it is heard across the room and is not in the take.
    if (settingsRef.current.tones) {
      void playTone('roll');
      await new Promise((r) => setTimeout(r, ROLL_TONE_MS));
      if (!camera.current) return;
    }
    ear.current?.reset();
    heard.current = { words: [], at: [] };
    read.current = EMPTY_READ;
    reads.current = [];
    setPosition(0);
    setElapsed(0);
    setCurrent(null);
    setSheet(null);
    if (justCut.current) { shelve(justCut.current); justCut.current = null; }
    setFlight(null);
    setPhase('rolling');
    startedAt.current = Date.now();
    rolledTurn.current = turnRef.current;
    stopping.current = false;
    track('app_tape_rolled', { via });
    const rec = camera.current.recordAsync({ maxDuration: MAX_TAKE_S, codec: 'avc1' });
    recording.current = rec;
    // The longest take, reached: it stops by itself and is kept whole.
    rec.then(() => { if (recording.current === rec && phaseRef.current === 'rolling' && !stopping.current) void stopRef.current(null); }).catch(() => {});
  }, [setPhase]);

  // The take that just went to Tapes: "keeper" stars it, tapping it plays it.
  const justCut = useRef<Take | null>(null);
  const [flight, setFlight] = useState<Take | null>(null);
  const shelve = useCallback((take: Take) => {
    setTakes((all) => (all.some((t) => t.id === take.id) ? all.map((t) => (t.id === take.id ? take : t)) : [...all, take]));
  }, []);
  const tapesAt = useRef<{ x: number; y: number } | null>(null);
  const tapesRef = useRef<View>(null);
  const measureTapes = useCallback(() => {
    tapesRef.current?.measureInWindow((x, y, w, h) => { if (w > 0) tapesAt.current = { x: x + w / 2, y: y + 28 }; });
  }, []);

  const stop = useCallback(async (hit: CueHit | null, discard = false) => {
    if (phaseRef.current !== 'rolling' || stopping.current) return;
    stopping.current = true;
    const stoppedAt = Date.now();
    const endMs = takeEnd({ startedAt: startedAt.current, stoppedAt, hit });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    camera.current?.stopRecording();
    let uri: string | undefined;
    try { uri = (await recording.current)?.uri; } catch { uri = undefined; }
    recording.current = null;
    if (settingsRef.current.tones) void playTone('cut');
    track('app_tape_cut', { via: hit ? 'voice' : 'tap', seconds: Math.round(endMs / 1000), kept: !discard });
    if (!uri) { setPhase('ready'); return; }
    if (discard) {
      try { new File(uri).delete(); } catch { /* gone */ }
      setPhase('ready');
      return;
    }
    const take = await addTake(id || FREE_TAPE, uri, stoppedAt - startedAt.current, endMs, {
      character: slate ? 'Slate' : free ? undefined : monologue?.character,
      source: free ? undefined : monologue?.source,
      turn: rolledTurn.current,
      auditionId: auditionId ?? undefined,
    });
    TapeEar.speakerOut();
    if (settingsRef.current.afterCut === 'play') {
      setTakes((t) => [...t, take]);
      setCurrent(take);
      setPhase('review');
      return;
    }
    // Saved to Tapes: the take shrinks like a screenshot and flies into the
    // Tapes button, and the room is ready again, still listening.
    justCut.current = take;
    setFlight(take);
    setPhase('ready');
  }, [id, free, slate, monologue?.character, monologue?.source, auditionId, setPhase]);
  stopRef.current = stop;

  // A take that is thrown away by voice goes straight into the next one.
  const goAgain = useCallback(async (hit: CueHit) => {
    await stop(hit, true);
    setTimeout(() => actionRef.current(), 700);
  }, [stop]);
  const actionRef = useRef<() => void>(() => {});

  // The countdown: three beats after a tap to walk back to your mark, or the
  // beat you chose after a spoken "action" to settle into it.
  const countdown = useCallback((via: 'voice' | 'tap' = 'tap', from = 3) => {
    Haptics.selectionAsync().catch(() => {});
    countdownVia.current = via;
    setCurrent(null);
    setSheet(null);
    setCount(from);
    setPhase('countdown');
  }, [setPhase]);
  // "action", heard: straight in, or after the beat.
  const action = useCallback(() => {
    const beat = settingsRef.current.beat;
    if (beat > 0) countdown('voice', beat);
    else void roll('voice');
  }, [countdown, roll]);
  actionRef.current = action;
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) { void roll(countdownVia.current); return; }
    const t = setTimeout(() => {
      Haptics.selectionAsync().catch(() => {});
      setCount((n) => n - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [phase, count, roll]);

  // The clock while rolling.
  useEffect(() => {
    if (phase !== 'rolling') return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => clearInterval(t);
  }, [phase]);

  const onRecord = useCallback(() => {
    const p = phaseRef.current;
    if (p === 'rolling') void stop(null);
    else if (p === 'countdown') { Haptics.selectionAsync().catch(() => {}); setPhase('ready'); }
    else countdown('tap', 3);
  }, [countdown, setPhase, stop]);

  /* ─── Watching it back ────────────────────────────────────────────── */

  const toggleStar = useCallback(async (take: Take, on?: boolean) => {
    const starred = on ?? !take.starred;
    Haptics.impactAsync(starred ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await setStarred(take.id, starred);
    setTakes((all) => all.map((t) => (t.id === take.id ? { ...t, starred } : t)));
    setCurrent((c) => (c?.id === take.id ? { ...c, starred } : c));
  }, []);

  onCue.current = (hit) => {
    const p = phaseRef.current;
    if (hit.cue === 'action' && p === 'ready') action();
    else if (hit.cue === 'cut' && p === 'rolling') void stop(hit);
    else if (hit.cue === 'again' && p === 'rolling') void goAgain(hit);
    else if (hit.cue === 'again' && p === 'review') action();
    else if (hit.cue === 'keeper' && p === 'review' && current) void toggleStar(current, true);
    else if (hit.cue === 'keeper' && p === 'ready' && justCut.current) void keepJustCut();
  };

  const keepJustCut = useCallback(async () => {
    const t = justCut.current;
    if (!t || t.starred) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    await setStarred(t.id, true);
    const kept = { ...t, starred: true };
    justCut.current = kept;
    setFlight((f) => (f?.id === kept.id ? kept : f));
    setTakes((all) => all.map((x) => (x.id === kept.id ? kept : x)));
  }, []);

  // The flying take, tapped while it waits: play it.
  const openFlight = useCallback((t: Take) => {
    Haptics.selectionAsync().catch(() => {});
    const take = justCut.current?.id === t.id ? justCut.current : t;
    shelve(take);
    setFlight(null);
    setCurrent(take);
    setPhase('review');
  }, [setPhase, shelve]);
  const landed = useCallback((t: Take) => {
    shelve(justCut.current?.id === t.id ? justCut.current : t);
    setFlight((f) => (f?.id === t.id ? null : f));
  }, [shelve]);

  const closeReview = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setCurrent(null);
    setPhase('ready');
  }, [setPhase]);

  const remove = useCallback((take: Take) => {
    Alert.alert(`Delete take ${take.number}?`, 'It goes from this phone. Takes you saved to Photos stay there.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          await deleteTake(take.id);
          const left = takes.filter((t) => t.id !== take.id);
          setTakes(left);
          if (current?.id === take.id) {
            const next = left[left.length - 1] ?? null;
            setCurrent(next);
            if (!next) setPhase('ready');
          }
        },
      },
    ]);
  }, [current?.id, setPhase, takes]);

  /* ─── Out the door ────────────────────────────────────────────────── */

  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [markNote, setMarkNote] = useState(false);

  const exported = useCallback(async (take: Take): Promise<string> => {
    const src = takeFile(take);
    if (!canExport()) return src.uri;
    const who = (take.character ?? monologue?.character ?? 'Take').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'Take';
    const out = new File(Paths.cache, `${who}_Take_${take.number}.mp4`);
    return exportTake({ input: src.uri, output: out.uri, startMs: take.startMs ?? 0, endMs: take.endMs, mark: !isPaid });
  }, [isPaid, monologue?.character]);

  const save = useCallback(async (take: Take) => {
    if (busy) return;
    setBusy('save');
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) { Linking.openSettings().catch(() => {}); return; }
      await MediaLibrary.saveToLibraryAsync(await exported(take));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSavedId(take.id);
      if (!isPaid) setMarkNote(true);
      track('app_tape_saved', { how: 'photos', marked: !isPaid });
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setBusy(null);
    }
  }, [busy, exported, isPaid]);

  const share = useCallback(async (take: Take) => {
    if (busy) return;
    setBusy('share');
    try {
      const url = await exported(take);
      setBusy(null);
      await Share.share({ url });
      track('app_tape_saved', { how: 'share', marked: !isPaid });
    } catch {
      /* closed, or the export failed */
    } finally {
      setBusy(null);
    }
  }, [busy, exported, isPaid]);

  useEffect(() => { setSavedId(null); setTrimming(false); }, [current?.id]);

  // Trimmed by hand: the new start and end, kept with the take.
  const [trimming, setTrimming] = useState(false);
  const trim = useCallback(async (take: Take, startMs: number, endMs: number) => {
    await setTrim(take.id, startMs, endMs);
    const next = { ...take, startMs, endMs };
    setTakes((all) => all.map((t) => (t.id === take.id ? next : t)));
    setCurrent((c) => (c?.id === take.id ? next : c));
    setSavedId(null);
  }, []);

  // Picked from Tapes: the take, in its own piece's room.
  const openTake = useCallback((t: Take) => {
    setSheet(null);
    Haptics.selectionAsync().catch(() => {});
    if (t.pieceId === (id || FREE_TAPE)) {
      setCurrent(t);
      setPhase('review');
      return;
    }
    router.setParams({ id: t.pieceId, take: t.id, name: t.character ?? '' });
  }, [id, router, setPhase]);

  const pickPiece = useCallback((piece: string, name: string) => {
    setSheet(null);
    if (piece === (id || FREE_TAPE)) return;
    Haptics.selectionAsync().catch(() => {});
    if (piece === SLATE_TAPE && !settings.slate.name.trim()) { setSheet('settings'); return; }
    if (piece !== FREE_TAPE && piece !== SLATE_TAPE) {
      // Start the words on their way before the room changes over.
      void qc.prefetchQuery({ queryKey: ['monologue', piece], queryFn: () => loadPiece(piece) });
    }
    setPrompter(true);
    router.setParams({ id: piece, name, take: undefined });
  }, [id, qc, router, settings.slate.name]);

  /* ─── The stage ───────────────────────────────────────────────────── */

  const rolling = phase === 'rolling';
  const here = lineAt(lineLengths, position);
  // The last line is behind you: the prompter goes, and you hold the moment.
  const atEnd = rolling && script.length > 0 && position >= script.length - 1;
  const topH = insets.top + BAR_H;
  // On the back camera the screen faces away: no prompter, it works by voice and tone.
  const showPrompter = allowed && prompter && facing === 'front' && phase !== 'review' && !atEnd && (lines.length > 0 || loading);
  const upright = turn === 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />
      {allowed ? (
        <CameraView
          ref={camera}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          facing={facing}
          mode="video"
          videoQuality="1080p"
          responsiveOrientationWhenOrientationLocked
          onResponsiveOrientationChanged={({ orientation }) => {
            // The phone, not the screen: turned clockwise the room turns back the other way.
            setTurn(orientation === 'landscapeRight' ? -90 : orientation === 'landscapeLeft' ? 90 : 0);
          }}
          onCameraReady={() => { TapeEar.speakerOut(); setCameraReady(true); }}
        />
      ) : null}

      {/* The eye line, before a take: a hairline a third of the way down. */}
      {allowed && phase === 'ready' ? (
        <Animated.View
          entering={FadeIn.duration(500)}
          exiting={FadeOut.duration(200)}
          pointerEvents="none"
          style={{ position: 'absolute', left: width * 0.2, right: width * 0.2, top: height * 0.4, height: 1, backgroundColor: 'rgba(255,250,243,0.2)' }}
        />
      ) : null}

      {/* The piece, under the lens. */}
      {showPrompter ? (
        <Prompter key={`p${turn}${id}`} lines={lines} loading={loading} at={rolling ? here : 0} said={rolling ? position - lineStart(lineLengths, here) : -1} turn={turn} width={width} top={topH} rolling={rolling} />
      ) : null}

      {/* Three, two, one. */}
      {phase === 'countdown' && count > 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.Text
            key={count}
            entering={reduce ? FadeIn.duration(120) : ZoomIn.duration(360).easing(EASE)}
            exiting={FadeOut.duration(260)}
            style={{ fontFamily: SERIF, fontSize: 168, color: WHITE, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 24, transform: [{ rotate: `${turn}deg` }] }}
          >
            {count}
          </Animated.Text>
        </View>
      ) : null}

      {/* Watching it back: the take fills the room. */}
      {phase === 'review' && current ? (
        <Review
          key={current.id}
          take={current}
          turn={turn}
          width={width}
          height={height}
          trimming={trimming}
          onTrim={(a, b) => trim(current, a, b)}
          onPlaying={(on) => {
            playing.current = on;
            if (!on) ear.current?.reset();
          }}
        />
      ) : null}

      {/* The top bar, on a soft shadow. */}
      <Scrim edge="top" height={topH + 40} />
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top, left: 0, right: 0, height: BAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
        <View style={{ width: 42, flexDirection: 'row' }}>
          {rolling ? null : (
            <Round icon={phase === 'review' ? 'close' : 'chevron-down'} label={phase === 'review' ? 'Back to the camera' : 'Leave'} turn={turn} onPress={phase === 'review' ? closeReview : goBack} />
          )}
        </View>
        <View style={{ flex: 1, alignItems: 'center', marginHorizontal: 10 }}>
          {rolling ? (
            <Clock ms={elapsed} turn={turn} />
          ) : phase === 'review' && current ? (
            <Animated.Text key={current.id} entering={FadeIn.duration(240)} numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 24, color: WHITE, transform: [{ rotate: `${turn}deg` }] }}>
              Take {current.number}
              {current.starred ? <Text style={{ color: GLOW }}>  ★</Text> : null}
            </Animated.Text>
          ) : allowed ? (
            <Pressable
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setSheet('piece'); }}
              disabled={phase !== 'ready'}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Piece: ${pieceName}. Change it.`}
              style={({ pressed }) => ({ maxWidth: '100%', height: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: GLASS, flexDirection: 'row', alignItems: 'center', gap: 7, opacity: pressed ? 0.7 : 1 })}
            >
              <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: free ? SANS : SERIF, fontSize: free ? 14 : 18, color: WHITE }}>{pieceName}</Text>
              {loading ? <ActivityIndicator size="small" color={DIM} /> : <Ionicons name="chevron-down" size={14} color={DIM} />}
            </Pressable>
          ) : null}
        </View>
        <View style={{ minWidth: 42, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          {rolling ? null : phase === 'review' && current ? (
            <Round icon="trash-outline" label={`Delete take ${current.number}`} turn={turn} onPress={() => remove(current)} />
          ) : allowed ? (
            <>
              {facing === 'front' ? (
                <Round icon={prompter ? 'reader' : 'reader-outline'} label={prompter ? 'Hide the lines' : 'Show the lines'} on={prompter && lines.length > 0} turn={turn} onPress={() => { Haptics.selectionAsync().catch(() => {}); setPrompter((v) => !v); }} />
              ) : null}
              <Round icon="camera-reverse-outline" label={facing === 'front' ? 'Use the back camera' : 'Use the front camera'} turn={turn} onPress={() => { Haptics.selectionAsync().catch(() => {}); setFacing(facing === 'front' ? 'back' : 'front'); }} />
              <Round icon="options-outline" label="Tape settings and your slate" turn={turn} onPress={() => { Haptics.selectionAsync().catch(() => {}); setSheet('settings'); }} />
            </>
          ) : null}
        </View>
      </View>

      {!allowed ? (
        <View style={{ position: 'absolute', top: topH, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
          <Text style={{ fontFamily: TYPE_I, fontSize: 15, color: DIM, textAlign: 'center' }}>
            {refused ? '(the camera and the microphone are off for Ghost Light.)' : '(finding the camera…)'}
          </Text>
          {refused ? (
            <Pressable onPress={() => Linking.openSettings().catch(() => {})} hitSlop={10} style={{ marginTop: 14 }} accessibilityRole="button">
              <Text style={{ fontFamily: TYPE_I, fontSize: 15, color: GLOW }}>(turn them on in settings.)</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* The bottom, on its own shadow. */}
      <Scrim edge="bottom" height={phase === 'review' ? (trimming ? 330 : 260) : 210} />
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 10 }}>
        {phase === 'review' && current ? (
          <Animated.View entering={FadeInDown.duration(340).easing(EASE)} exiting={FadeOutDown.duration(180)}>
            {takes.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 14 }}>
                {takes.slice().reverse().map((t) => (
                  <Chip key={t.id} take={t} on={t.id === current.id} turn={turn} onPress={() => { Haptics.selectionAsync().catch(() => {}); setCurrent(t); }} onLongPress={() => remove(t)} />
                ))}
              </ScrollView>
            ) : null}
            {markNote ? (
              <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: 'center', marginBottom: 12 }}>
                <Pressable onPress={() => router.push(paywallHref('tape_mark'))} hitSlop={8} accessibilityRole="button">
                  <Text style={{ fontFamily: TYPE_I, fontSize: 13, color: DIM }}>
                    (saved with the ghost light mark. <Text style={{ color: GLOW }}>save it clean.</Text>)
                  </Text>
                </Pressable>
              </Animated.View>
            ) : null}
            {audition ? (
              <Animated.View entering={FadeIn.duration(300)} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16, marginBottom: 12, paddingHorizontal: 20 }}>
                {audition.tape_link?.trim() && !auditionSent ? (
                  <Pressable onPress={() => { const l = audition.tape_link!.trim(); Linking.openURL(/^https?:\/\//.test(l) ? l : `https://${l}`).catch(() => {}); }} hitSlop={8} accessibilityRole="button">
                    <Text style={{ fontFamily: TYPE_I, fontSize: 13, color: GLOW }}>(open where to send it.)</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={markSent} hitSlop={8} accessibilityRole="button" accessibilityLabel={auditionSent ? `${audition.project} is marked sent. Tap to undo.` : `Mark ${audition.project} sent`}>
                  <Text style={{ fontFamily: TYPE_I, fontSize: 13, color: auditionSent ? DIM : GLOW }}>
                    {auditionSent ? '(marked sent. no more reminders before it’s due.)' : `(sent it? mark ${audition.project} sent.)`}
                  </Text>
                </Pressable>
              </Animated.View>
            ) : null}
            <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
              <Action icon="refresh" label="Again" primary turn={turn} onPress={() => countdown('tap', 3)} />
              <Action icon="cut-outline" label={trimming ? 'Done' : 'Trim'} on={trimming} turn={turn} onPress={() => { Haptics.selectionAsync().catch(() => {}); setTrimming((v) => !v); }} />
              <Action icon={current.starred ? 'star' : 'star-outline'} label={current.starred ? 'Kept' : 'Keep'} on={current.starred} turn={turn} onPress={() => toggleStar(current)} />
              <Action icon={savedId === current.id ? 'checkmark' : 'download-outline'} label={savedId === current.id ? 'Saved' : 'Save'} busy={busy === 'save'} turn={turn} onPress={() => save(current)} />
              <Action icon="paper-plane-outline" label="Send" busy={busy === 'share'} turn={turn} onPress={() => share(current)} />
            </View>
          </Animated.View>
        ) : allowed ? (
          <View>
            {audition && phase === 'ready' ? (
              <Animated.Text entering={FadeIn.duration(260)} numberOfLines={1} style={{ textAlign: 'center', paddingHorizontal: 24, marginBottom: 2, fontFamily: SANS, fontSize: 12.5, color: WHITE, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6, transform: [{ rotate: `${turn}deg` }] }}>
                {`For ${audition.project}${audition.role ? ` · ${audition.role}` : ''}${audition.when ? ` · due ${dayLabel(audition.when)} ${clockLabel(audition.when)}` : ''}${auditionSent ? ' · sent' : ''}`}
              </Animated.Text>
            ) : null}
            <Cue phase={phase} hearing={hearing} atEnd={atEnd} noisy={noisy} upright={upright} back={facing === 'back'} turn={turn} />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                {rolling ? null : <Ear on={hearing} level={level} turn={turn} onPress={toggleEar} />}
              </View>
              <RecordButton rolling={rolling} counting={phase === 'countdown'} atEnd={atEnd} onPress={onRecord} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                {rolling || phase === 'countdown' ? null : (
                  <View ref={tapesRef} onLayout={measureTapes} collapsable={false} style={{ alignSelf: 'stretch', alignItems: 'center' }}>
                    <Action icon="albums-outline" label="Tapes" turn={turn} badge={takes.length || undefined} bounce={!reduce} onPress={() => { Haptics.selectionAsync().catch(() => {}); setSheet('tapes'); }} />
                  </View>
                )}
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {flight ? (
        <CutFlight
          key={flight.id}
          take={flight}
          turn={turn}
          reduce={reduce}
          target={tapesAt.current ?? { x: width - 12 - (width - 24 - 80) / 4, y: height - insets.bottom - 60 }}
          onOpen={openFlight}
          onLanded={landed}
        />
      ) : null}

      {sheet === 'piece' ? (
        <PiecePicker current={id || FREE_TAPE} signedIn={isAuthenticated} onClose={() => setSheet(null)} onPick={pickPiece} />
      ) : sheet === 'tapes' ? (
        <TapesLibrary current={current?.id ?? null} onClose={() => setSheet(null)} onOpen={openTake} />
      ) : sheet === 'settings' ? (
        <SettingsSheet
          settings={settings}
          onChange={setSettings}
          onClose={() => setSheet(null)}
          onSlate={() => {
            setSheet(null);
            if (!settings.slate.name.trim()) return;
            if (id !== SLATE_TAPE) router.setParams({ id: SLATE_TAPE, name: 'Slate', take: undefined });
          }}
        />
      ) : null}
    </View>
  );
}

/** Where a line's words start in the piece's run of words. */
function lineStart(lengths: number[], line: number): number {
  let n = 0;
  for (let i = 0; i < line && i < lengths.length; i++) n += lengths[i];
  return n;
}

/** The words of a piece: the phone's own copy first (instant for anything in the Book), then the server. */
async function loadPiece(id: string): Promise<Monologue> {
  const local = await getOffline(id).catch(() => null);
  if (local?.fullText) return local;
  try {
    return apiToMonologue(await getMonologue(id));
  } catch (err) {
    if (local) return local;
    throw err;
  }
}

/* ─── Pieces of the room ─────────────────────────────────────────────── */

/** A soft shadow along one edge, so the bars read on any picture. */
function Scrim({ edge, height }: { edge: 'top' | 'bottom'; height: number }) {
  const { width } = useWindowDimensions();
  const top = edge === 'top';
  return (
    <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, width, height, top: top ? 0 : undefined, bottom: top ? undefined : 0 }}>
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={vec(0, top ? 0 : height)}
          end={vec(0, top ? height : 0)}
          colors={['rgba(8,5,4,0.62)', 'rgba(8,5,4,0.28)', 'rgba(8,5,4,0)']}
        />
      </Rect>
    </Canvas>
  );
}

/**
 * The prompter: the line you are on, and the next, just under the top bar
 * where the lens is. Turned with the phone, it lies along the lens's edge.
 */
const Prompter = memo(function Prompter({ lines, loading, at, said, turn, width, top, rolling }: { lines: string[]; loading: boolean; at: number; said: number; turn: number; width: number; top: number; rolling: boolean }) {
  const turned = Math.abs(turn) === 90;
  const box = { w: width, h: turned ? width * 0.62 : 190 };
  const inner = turned ? { w: box.h, h: box.w } : box;
  const line = lines[at] ?? '';
  const next = lines[at + 1] ?? '';
  const long = line.length > 120;
  return (
    <Animated.View entering={FadeIn.duration(320)} exiting={FadeOut.duration(260)} pointerEvents="none" style={{ position: 'absolute', top: turned ? 0 : top - 6, left: 0, width: box.w, height: box.h }}>
      <View
        style={{
          position: 'absolute',
          width: inner.w,
          height: inner.h,
          left: (box.w - inner.w) / 2,
          top: (box.h - inner.h) / 2,
          transform: [{ rotate: `${turn}deg` }],
          paddingHorizontal: 28,
          paddingTop: turned ? 24 : 4,
        }}
      >
        {loading && !line ? (
          <Animated.Text entering={FadeIn.duration(240)} style={{ fontFamily: TYPE_I, fontSize: 15, color: DIM, textAlign: 'center' }}>(finding the page…)</Animated.Text>
        ) : (
          <>
            <Animated.Text
              key={`l${at}${line.slice(0, 12)}`}
              entering={FadeInDown.duration(300).easing(EASE)}
              style={{ fontFamily: TYPE, fontSize: long ? 17 : 20, lineHeight: long ? 24 : 28, color: WHITE, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 10 }}
              numberOfLines={turned ? 3 : 4}
            >
              {rolling && said >= 0 ? <SpokenLine line={line} said={said} /> : line}
            </Animated.Text>
            {next && (rolling || at === 0) ? (
              <Animated.Text
                key={`n${at}${next.slice(0, 12)}`}
                entering={FadeIn.delay(120).duration(300)}
                style={{ marginTop: 10, fontFamily: TYPE, fontSize: 15, lineHeight: 21, color: DIM, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8 }}
                numberOfLines={2}
              >
                {next}
              </Animated.Text>
            ) : null}
          </>
        )}
      </View>
    </Animated.View>
  );
});

/**
 * The line as you say it: the words behind you in full light, the one you
 * are on underlined in the ghost light's orange with a soft glow, the rest
 * waiting, dimmed. It follows the read's position, which only goes forward,
 * so a skipped or repeated word never sends the light backwards.
 */
const SpokenLine = memo(function SpokenLine({ line, said }: { line: string; said: number }) {
  const runs = useMemo(() => displayRuns(line), [line]);
  return (
    <>
      {runs.map((w, i) => {
        const done = i < said;
        const here = i === said;
        return (
          <Text key={i}>
            <Text
              style={{
                color: done || here ? WHITE : 'rgba(255,250,243,0.48)',
                textDecorationLine: here ? 'underline' : 'none',
                textDecorationColor: GLOW,
                textShadowColor: here ? 'rgba(224,115,31,0.85)' : 'rgba(0,0,0,0.7)',
                textShadowRadius: here ? 14 : 10,
              }}
            >
              {w.word}
            </Text>
            {w.gap ? ' ' : ''}
          </Text>
        );
      })}
    </>
  );
});

/** One quiet line over the record button: what to say next, or what is in the way. */
function Cue({ phase, hearing, atEnd, noisy, upright, back, turn }: { phase: Phase; hearing: boolean; atEnd: boolean; noisy: boolean; upright: boolean; back: boolean; turn: number }) {
  const text =
    phase === 'countdown' ? '(tap to stop the count.)'
      : phase === 'rolling' ? (hearing ? (atEnd ? '(hold it. then say “cut”.)' : '(say “cut” when you are done.)') : '(tap to cut.)')
      : noisy && hearing ? '(it’s loud in here. the ear may miss you.)'
      : upright ? '(turn it sideways for casting.)'
      : back && hearing ? '(back camera: listen for the tones. say “action”.)'
      : hearing ? '(say “action”, or tap.)' : '(tap to roll.)';
  return (
    <View style={{ height: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 6, paddingHorizontal: 20 }}>
      <Animated.Text key={text} entering={FadeIn.duration(260)} exiting={FadeOut.duration(140)} numberOfLines={1} style={{ fontFamily: TYPE_I, fontSize: 13, color: noisy && phase === 'ready' ? GLOW : DIM, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6, transform: [{ rotate: `${turn}deg` }] }}>
        {text}
      </Animated.Text>
    </View>
  );
}

/** The take, played straight back. Once through, then it waits. */
function Review({ take, turn, width, height, trimming, onTrim, onPlaying }: { take: Take; turn: number; width: number; height: number; trimming: boolean; onTrim: (startMs: number, endMs: number) => void; onPlaying: (on: boolean) => void }) {
  const uri = takeFile(take).uri;
  const endS = take.endMs / 1000;
  const startS = (take.startMs ?? 0) / 1000;
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.1;
    if (take.startMs) p.currentTime = take.startMs / 1000;
    p.play();
  });
  const [ended, setEnded] = useState(false);
  const tell = useRef(onPlaying);
  tell.current = onPlaying;
  useEventListener(player, 'playingChange', ({ isPlaying }) => tell.current(isPlaying));
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (currentTime >= endS && player.playing) { player.pause(); setEnded(true); }
  });
  useEventListener(player, 'playToEnd', () => setEnded(true));
  useEffect(() => () => tell.current(false), []);

  const replay = () => {
    Haptics.selectionAsync().catch(() => {});
    if (player.playing) { player.pause(); return; }
    if (ended || player.currentTime >= endS - 0.05 || player.currentTime < startS) player.currentTime = startS;
    setEnded(false);
    player.play();
  };

  const turned = Math.abs(turn) === 90;
  const inner = turned ? { w: height, h: width } : { w: width, h: height };
  // Held the way it was taped, it fills the screen; held the other way, it fits.
  const fit = (take.turn ?? 0) === turn ? 'cover' : 'contain';
  return (
    <Animated.View entering={FadeIn.duration(380)} exiting={FadeOut.duration(220)} style={{ position: 'absolute', top: 0, left: 0, width, height, backgroundColor: '#000' }}>
      <Pressable onPress={replay} accessibilityRole="button" accessibilityLabel={ended ? 'Watch it again' : 'Pause'} style={{ flex: 1 }}>
        <View style={{ position: 'absolute', width: inner.w, height: inner.h, left: (width - inner.w) / 2, top: (height - inner.h) / 2, transform: [{ rotate: `${turn}deg` }] }}>
          <VideoView player={player} nativeControls={false} contentFit={fit} style={{ flex: 1 }} />
        </View>
        {ended ? (
          <Animated.View entering={FadeIn.duration(260)} pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: GLASS, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${turn}deg` }] }}>
              <Ionicons name="play" size={32} color={WHITE} style={{ marginLeft: 4 }} />
            </View>
          </Animated.View>
        ) : null}
      </Pressable>
      {trimming ? (
        <TrimBar
          durationMs={take.durationMs}
          startMs={take.startMs ?? 0}
          endMs={take.endMs}
          width={width}
          onSeek={(ms) => { player.pause(); player.currentTime = ms / 1000; }}
          onDone={(a, b) => { onTrim(a, b); player.currentTime = a / 1000; setEnded(false); player.play(); }}
        />
      ) : null}
    </Animated.View>
  );
}

/**
 * Trimming: the take as a bar, a handle at each end. Drag one and the
 * picture follows it; let go and the take keeps the new start and end.
 */
function TrimBar({ durationMs, startMs, endMs, width, onSeek, onDone }: { durationMs: number; startMs: number; endMs: number; width: number; onSeek: (ms: number) => void; onDone: (startMs: number, endMs: number) => void }) {
  const insets = useSafeAreaInsets();
  const W = width - 48;
  const total = Math.max(1000, durationMs);
  const MIN = (1000 / total) * W; // a take is never under a second
  const a = useSharedValue((startMs / total) * W);
  const b = useSharedValue((Math.min(endMs, total) / total) * W);
  const a0 = useSharedValue(0);
  const b0 = useSharedValue(0);
  const [shown, setShown] = useState({ a: startMs, b: endMs });
  // While dragging, the times and the picture follow about twelve times a second, not every frame.
  const last = useRef(0);
  const follow = (x: number, y: number, at: number) => {
    const now = Date.now();
    if (now - last.current < 80) return;
    last.current = now;
    setShown({ a: Math.round((x / W) * total), b: Math.round((y / W) * total) });
    onSeek(Math.round((at / W) * total));
  };
  const done = (x: number, y: number) => {
    setShown({ a: Math.round((x / W) * total), b: Math.round((y / W) * total) });
    onDone(Math.round((x / W) * total), Math.round((y / W) * total));
  };
  const left = Gesture.Pan()
    .onBegin(() => { a0.value = a.value; })
    .onUpdate((e) => {
      a.value = Math.max(0, Math.min(b.value - MIN, a0.value + e.translationX));
      runOnJS(follow)(a.value, b.value, a.value);
    })
    .onEnd(() => { runOnJS(done)(a.value, b.value); });
  const right = Gesture.Pan()
    .onBegin(() => { b0.value = b.value; })
    .onUpdate((e) => {
      b.value = Math.min(W, Math.max(a.value + MIN, b0.value + e.translationX));
      runOnJS(follow)(a.value, b.value, b.value);
    })
    .onEnd(() => { runOnJS(done)(a.value, b.value); });
  const kept = useAnimatedStyle(() => ({ left: a.value, width: b.value - a.value }));
  const leftKnob = useAnimatedStyle(() => ({ transform: [{ translateX: a.value - 14 }] }));
  const rightKnob = useAnimatedStyle(() => ({ transform: [{ translateX: b.value - 14 }] }));
  const clock = (ms: number) => { const s = Math.max(0, ms) / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 200 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 12, color: WHITE }}>{clock(shown.a)}</Text>
        <Text style={{ fontFamily: TYPE_I, fontSize: 12, color: DIM }}>(drag the ends.)</Text>
        <Text style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 12, color: WHITE }}>{clock(shown.b)}</Text>
      </View>
      <View style={{ height: 40, justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: 0, right: 0, height: 6, backgroundColor: 'rgba(255,250,243,0.22)' }} />
        <Animated.View style={[kept, { position: 'absolute', height: 6, backgroundColor: GLOW }]} />
        <GestureDetector gesture={left}>
          <Animated.View hitSlop={12} accessibilityRole="adjustable" accessibilityLabel="Start of the take" style={[leftKnob, { position: 'absolute', left: 0, width: 28, height: 40, borderRadius: 8, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' }]}>
            <View style={{ width: 2, height: 16, backgroundColor: colors.ink }} />
          </Animated.View>
        </GestureDetector>
        <GestureDetector gesture={right}>
          <Animated.View hitSlop={12} accessibilityRole="adjustable" accessibilityLabel="End of the take" style={[rightKnob, { position: 'absolute', left: 0, width: 28, height: 40, borderRadius: 8, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' }]}>
            <View style={{ width: 2, height: 16, backgroundColor: colors.ink }} />
          </Animated.View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

/**
 * "Cut", the way an iPhone takes a screenshot: the frame flashes, the take
 * shrinks into a card with soft corners and a shadow, waits a beat (tap it
 * to watch it), then flies into the Tapes button. With Reduce Motion it
 * simply fades into the button. All on the UI thread.
 */
const HOLD_S = 0.3;
const SHRINK_MS = 420;
const HOLD_MS = 900;
const FLY_MS = 480;

const CutFlight = memo(function CutFlight({ take, turn, reduce, target, onOpen, onLanded }: {
  take: Take; turn: number; reduce: boolean; target: { x: number; y: number };
  onOpen: (t: Take) => void; onLanded: (t: Take) => void;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const turned = Math.abs(turn) === 90;
  // The card is the screen, turned the way the phone is held.
  // Turned, it is drawn landscape and rotated, so as seen it still covers the screen.
  const card = turned ? { w: H, h: W } : { w: W, h: H };
  // Where it waits: low on the left, like a screenshot.
  const hold = { x: 22 + (W * HOLD_S) / 2, y: H - insets.bottom - 190 - (H * HOLD_S) / 2 };
  const endS = 44 / Math.min(W, H);

  const s = useSharedValue(reduce ? endS : 1);
  const tx = useSharedValue(reduce ? target.x - W / 2 : 0);
  const ty = useSharedValue(reduce ? target.y - H / 2 : 0);
  const r = useSharedValue(0);
  const op = useSharedValue(1);
  const flash = useSharedValue(0);
  const [waiting, setWaiting] = useState(false);
  const done = useRef(false);
  const land = useCallback(() => { if (!done.current) { done.current = true; onLanded(take); } }, [onLanded, take]);

  useEffect(() => {
    if (reduce) {
      op.value = withDelay(250, withTiming(0, { duration: 350 }, (fin) => { if (fin) runOnJS(land)(); }));
      return;
    }
    flash.value = withSequence(withTiming(0.5, { duration: 90 }), withTiming(0, { duration: 280 }));
    // Shrink into the corner, wait a beat, then into Tapes.
    const ease = Easing.out(Easing.cubic);
    const fly = Easing.in(Easing.cubic);
    const after = SHRINK_MS + HOLD_MS;
    s.value = withSequence(withTiming(HOLD_S, { duration: SHRINK_MS, easing: ease }), withDelay(HOLD_MS, withTiming(endS, { duration: FLY_MS, easing: fly })));
    tx.value = withSequence(withTiming(hold.x - W / 2, { duration: SHRINK_MS, easing: ease }), withDelay(HOLD_MS, withTiming(target.x - W / 2, { duration: FLY_MS, easing: fly })));
    ty.value = withSequence(
      withTiming(hold.y - H / 2, { duration: SHRINK_MS, easing: ease }, (fin) => { if (fin) runOnJS(setWaiting)(true); }),
      withDelay(HOLD_MS, withTiming(target.y - H / 2, { duration: FLY_MS, easing: fly }, (fin) => { if (fin) runOnJS(land)(); })),
    );
    r.value = withSequence(withTiming(18 / HOLD_S, { duration: SHRINK_MS, easing: ease }), withDelay(HOLD_MS, withTiming(Math.min(W, H) / 2, { duration: FLY_MS, easing: fly })));
    op.value = withDelay(after + FLY_MS * 0.6, withTiming(0, { duration: FLY_MS * 0.4 }));
    const t = setTimeout(() => setWaiting(false), after);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    borderRadius: r.value,
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { rotate: `${turn}deg` }, { scale: s.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const open = () => {
    cancelAnimation(s); cancelAnimation(tx); cancelAnimation(ty); cancelAnimation(r); cancelAnimation(op);
    done.current = true;
    onOpen(take);
  };

  const still = thumbFile(take);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Animated.View pointerEvents="none" style={[flashStyle, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: WHITE }]} />
      <Animated.View
        pointerEvents={waiting ? 'auto' : 'none'}
        style={[style, {
          position: 'absolute', width: card.w, height: card.h, left: (W - card.w) / 2, top: (H - card.h) / 2,
          overflow: 'hidden', backgroundColor: '#000', borderWidth: 6, borderColor: 'rgba(255,250,243,0.9)',
        }]}
      >
        <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Take ${take.number}, saved to Tapes. Tap to watch it.`} style={{ flex: 1 }}>
          {still?.exists ? <Image source={{ uri: still.uri }} style={{ flex: 1 }} contentFit="cover" /> : <FirstFrame take={take} />}
          {take.starred ? (
            <View style={{ position: 'absolute', top: 40, right: 40 }}><Ionicons name="star" size={90} color={GLOW} /></View>
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
});

/** No still on hand (the web preview keeps none): the take itself, held on its first frame. */
function FirstFrame({ take }: { take: Take }) {
  const player = useVideoPlayer(takeFile(take).uri, (p) => { p.muted = true; p.pause(); });
  return <VideoView player={player} nativeControls={false} contentFit="cover" style={{ flex: 1 }} />;
}

/**
 * The one button. A disc that becomes a square while rolling, the way a
 * camera's does; it breathes while counting down, and again once the piece
 * is over, to say the cut is yours.
 */
function RecordButton({ rolling, counting, atEnd, onPress }: { rolling: boolean; counting: boolean; atEnd: boolean; onPress: () => void }) {
  const reduce = useReducedMotion();
  const shape = useSharedValue(0);
  const pulse = useSharedValue(1);
  useEffect(() => {
    shape.value = withTiming(rolling ? 1 : 0, { duration: reduce ? 0 : 260, easing: EASE });
  }, [rolling, reduce, shape]);
  useEffect(() => {
    pulse.value = (counting || atEnd) && !reduce ? withRepeat(withSequence(withTiming(0.88, { duration: 520 }), withTiming(1, { duration: 520 })), -1) : withTiming(1, { duration: 200 });
  }, [counting, atEnd, reduce, pulse]);
  const core = useAnimatedStyle(() => {
    const size = 62 - shape.value * 34;
    return {
      width: size,
      height: size,
      borderRadius: size / 2 - shape.value * (size / 2 - 7),
      transform: [{ scale: pulse.value }],
    };
  });
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={rolling ? 'Cut' : counting ? 'Stop the countdown' : 'Action'}
      style={({ pressed }) => ({ width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: WHITE, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}
    >
      <Animated.View style={[core, { backgroundColor: ROLL_RED }]} />
    </Pressable>
  );
}

/** The ear: the ghost light's bulb, glowing with your voice, with its word under it. Tap to turn it off. */
function Ear({ on, level, turn, onPress }: { on: boolean; level: SharedValue<number>; turn: number; onPress: () => void }) {
  const glow = useAnimatedStyle(() => ({
    opacity: on ? 0.3 + level.value * 0.7 : 0,
    transform: [{ scale: 1 + level.value * 0.8 }],
  }));
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={on ? 'Voice is on: it listens for action and cut. Tap to turn it off.' : 'Voice is off. Tap to turn it on.'} accessibilityState={{ selected: on }} style={({ pressed }) => ({ alignItems: 'center', width: 76, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: GLASS, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[glow, { position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: GLOW }]} />
        <Ionicons name={on ? 'mic' : 'mic-off-outline'} size={20} color={WHITE} style={{ transform: [{ rotate: `${turn}deg` }] }} />
      </View>
      <Text style={{ marginTop: 6, fontFamily: SANS, fontSize: 11, color: on ? WHITE : DIM, transform: [{ rotate: `${turn}deg` }] }}>{on ? 'Voice on' : 'Voice off'}</Text>
    </Pressable>
  );
}

/** A labelled action: an icon on glass, its word under it. All the same width. */
function Action({ icon, label, onPress, primary, on, busy, badge, bounce, turn }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; primary?: boolean; on?: boolean; busy?: boolean; badge?: number; bounce?: boolean; turn: number }) {
  // A new take landed: the count goes up with a small bounce.
  const pop = useSharedValue(1);
  const lastBadge = useRef(badge ?? 0);
  useEffect(() => {
    const n = badge ?? 0;
    if (bounce && n > lastBadge.current) pop.value = withSequence(withTiming(1.4, { duration: 140, easing: EASE }), withTiming(1, { duration: 220, easing: Easing.out(Easing.back(2)) }));
    lastBadge.current = n;
  }, [badge, bounce, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const t = useSharedValue(turn);
  useEffect(() => { t.value = withTiming(turn, { duration: 280, easing: EASE }); }, [turn, t]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${t.value}deg` }] }));
  const bg = primary ? GLOW : on ? WHITE : GLASS;
  const ink = primary || on ? colors.ink : WHITE;
  return (
    <Pressable onPress={onPress} disabled={busy} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: Boolean(on), busy: Boolean(busy) }} style={({ pressed }) => ({ flex: 1, alignItems: 'center', opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator color={ink} /> : (
          <Animated.View style={spin}>
            <Ionicons name={icon} size={22} color={on && icon.startsWith('star') ? GLOW : ink} />
          </Animated.View>
        )}
        {badge ? (
          <Animated.View style={[popStyle, { position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: GLOW, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontFamily: SANS, fontSize: 11, color: colors.ink }}>{badge}</Text>
          </Animated.View>
        ) : null}
      </View>
      <Animated.Text style={[spin, { marginTop: 6, fontFamily: SANS, fontSize: 11, color: WHITE }]}>{label}</Animated.Text>
    </Pressable>
  );
}

function Chip({ take, on, turn, onPress, onLongPress }: { take: Take; on: boolean; turn: number; onPress: () => void; onLongPress: () => void }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={`Take ${take.number}${take.starred ? ', kept' : ''}. Hold to delete.`} accessibilityState={{ selected: on }}
      style={{ height: 34, minWidth: 64, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: on ? WHITE : 'rgba(255,250,243,0.3)', backgroundColor: on ? WHITE : GLASS, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
      <Text style={{ fontFamily: SANS, fontSize: 13, color: on ? colors.ink : WHITE, transform: [{ rotate: `${turn}deg` }] }}>Take {take.number}</Text>
      {take.starred ? <Ionicons name="star" size={11} color={GLOW} /> : null}
    </Pressable>
  );
}

/** A round button on the glass, for the top bar. Its icon turns with the phone. */
function Round({ icon, label, on, turn, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; on?: boolean; turn: number; onPress: () => void }) {
  const t = useSharedValue(turn);
  useEffect(() => { t.value = withTiming(turn, { duration: 280, easing: EASE }); }, [turn, t]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${t.value}deg` }] }));
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: Boolean(on) }}
      style={({ pressed }) => ({ width: 42, height: 42, borderRadius: 21, backgroundColor: on ? 'rgba(255,250,243,0.92)' : GLASS, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
      <Animated.View style={spin}>
        <Ionicons name={icon} size={19} color={on ? colors.ink : WHITE} />
      </Animated.View>
    </Pressable>
  );
}

/** The running clock, with the red dot. */
function Clock({ ms, turn }: { ms: number; turn: number }) {
  const s = Math.floor(ms / 1000);
  const blink = useSharedValue(1);
  useEffect(() => {
    blink.value = withRepeat(withSequence(withTiming(0.25, { duration: 600 }), withTiming(1, { duration: 600 })), -1);
  }, [blink]);
  const dot = useAnimatedStyle(() => ({ opacity: blink.value }));
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 30, backgroundColor: GLASS, transform: [{ rotate: `${turn}deg` }] }}>
      <Animated.View style={[dot, { width: 8, height: 8, borderRadius: 4, backgroundColor: ROLL_RED }]} />
      <Text style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 14, letterSpacing: 1.4, color: WHITE }}>
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
      </Text>
    </Animated.View>
  );
}

/* ─── Sheets ─────────────────────────────────────────────────────────── */

/** A sheet up from the bottom over the camera, with a title and a way out. */
function Sheet({ title, onClose, children, tall }: { title: string; onClose: () => void; children: React.ReactNode; tall?: boolean }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,5,4,0.55)' }}>
        <Pressable onPress={onClose} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' }}>
      <Animated.View
        entering={FadeInDown.duration(320).easing(EASE)}
        exiting={FadeOutDown.duration(200)}
        style={{ height: tall ? height * 0.82 : undefined, maxHeight: height * 0.82, backgroundColor: colors.ink, borderTopWidth: 1, borderColor: 'rgba(255,250,243,0.12)', paddingBottom: insets.bottom }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8 }}>
          <Text style={{ fontFamily: SERIF, fontSize: 26, color: WHITE }}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close"
            style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,250,243,0.1)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Ionicons name="close" size={17} color={WHITE} />
          </Pressable>
        </View>
        {children}
      </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * Which piece to tape: the ones you read lately and the ones in your Book,
 * or none, for sides of your own.
 */
function PiecePicker({ current, signedIn, onClose, onPick }: { current: string; signedIn: boolean; onClose: () => void; onPick: (id: string, name: string) => void }) {
  const [recents, setRecents] = useState<RecentPiece[]>([]);
  useEffect(() => { loadRecents().then(setRecents).catch(() => {}); }, []);
  const { data: book } = useFavorites(signedIn);
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const recent: { id: string; character: string; source: string }[] = [];
    const saved: { id: string; character: string; source: string }[] = [];
    for (const p of recents) { if (p.id && !seen.has(p.id)) { seen.add(p.id); recent.push(p); } }
    for (const p of book ?? []) { if (p.id && !seen.has(p.id)) { seen.add(p.id); saved.push(p); } }
    return { recent: recent.slice(0, 8), saved: saved.slice(0, 40) };
  }, [recents, book]);
  return (
    <Sheet title="Tape which piece?" onClose={onClose}>
      <ScrollView contentContainerStyle={{ paddingBottom: 14 }}>
        <PickRow icon="person-circle-outline" title="Slate" sub="Your name, height and town, set once." on={current === SLATE_TAPE} onPress={() => onPick(SLATE_TAPE, 'Slate')} />
        <PickRow icon="create-outline" title="No script" sub="Your own sides. No prompter." on={current === FREE_TAPE} onPress={() => onPick(FREE_TAPE, 'No script')} />
        {rows.recent.length ? <SheetLabel>Lately</SheetLabel> : null}
        {rows.recent.map((r) => (
          <PickRow key={r.id} icon="time-outline" title={r.character} sub={r.source} on={current === r.id} onPress={() => onPick(r.id, r.character)} />
        ))}
        {rows.saved.length ? <SheetLabel>In your Book</SheetLabel> : null}
        {rows.saved.map((r) => (
          <PickRow key={r.id} icon="bookmark-outline" title={r.character} sub={r.source} on={current === r.id} onPress={() => onPick(r.id, r.character)} />
        ))}
      </ScrollView>
    </Sheet>
  );
}

function SheetLabel({ children }: { children: string }) {
  return (
    <Text style={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 6, fontFamily: 'CourierPrime_700Bold', fontSize: 10, letterSpacing: 2.2, textTransform: 'uppercase', color: DIM }}>
      {children}
    </Text>
  );
}

function PickRow({ icon, title, sub, on, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingHorizontal: 22, paddingVertical: 10, gap: 14, backgroundColor: pressed || on ? 'rgba(255,250,243,0.06)' : 'transparent' })}>
      <Ionicons name={icon} size={18} color={on ? GLOW : DIM} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 20, color: WHITE }}>{title}</Text>
        <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: SANS_M, fontSize: 12, color: DIM }}>{sub}</Text>
      </View>
      {on ? <Ionicons name="checkmark" size={18} color={GLOW} /> : null}
    </Pressable>
  );
}

/**
 * Tapes: every take on the phone, newest first, a still of each. "Kept" is
 * the ones you starred: the shortlist you send from.
 */
function TapesLibrary({ current, onClose, onOpen }: { current: string | null; onClose: () => void; onOpen: (t: Take) => void }) {
  const { width } = useWindowDimensions();
  const [list, setList] = useState<Take[] | null>(null);
  const [kept, setKept] = useState(false);
  useEffect(() => { allTakes().then(setList).catch(() => setList([])); }, []);
  const shown = (list ?? []).filter((t) => !kept || t.starred);
  const keptCount = (list ?? []).filter((t) => t.starred).length;
  const gap = 10;
  const cell = (width - 22 * 2 - gap) / 2;
  return (
    <Sheet title="Tapes" onClose={onClose} tall>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingBottom: 12 }}>
        <Filter label={`All${list ? ` · ${list.length}` : ''}`} on={!kept} onPress={() => setKept(false)} />
        <Filter label={`Kept · ${keptCount}`} on={kept} onPress={() => setKept(true)} />
      </View>
      {list === null ? (
        <View style={{ paddingTop: 40, alignItems: 'center' }}><ActivityIndicator color={DIM} /></View>
      ) : shown.length === 0 ? (
        <View style={{ paddingTop: 40, paddingHorizontal: 40, alignItems: 'center' }}>
          <Text style={{ fontFamily: TYPE_I, fontSize: 14, color: DIM, textAlign: 'center' }}>
            {kept ? '(nothing kept yet. star a take to keep it.)' : '(no takes yet. say “action”.)'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap, paddingHorizontal: 22, paddingBottom: 24 }}>
          {shown.map((t) => (
            <TapeCell key={t.id} take={t} size={cell} on={t.id === current} onPress={() => onOpen(t)} />
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

function Filter({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ height: 32, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? WHITE : 'rgba(255,250,243,0.1)', justifyContent: 'center' }}>
      <Text style={{ fontFamily: SANS, fontSize: 13, color: on ? colors.ink : WHITE }}>{label}</Text>
    </Pressable>
  );
}

function TapeCell({ take, size, on, onPress }: { take: Take; size: number; on: boolean; onPress: () => void }) {
  const still = thumbFile(take);
  const s = Math.round(take.endMs / 1000);
  const when = new Date(take.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${take.character ?? 'No script'}, take ${take.number}${take.starred ? ', kept' : ''}`}
      style={({ pressed }) => ({ width: size, opacity: pressed ? 0.75 : 1 })}>
      <View style={{ width: size, height: size * 1.25, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(255,250,243,0.06)', borderWidth: on ? 2 : 0, borderColor: GLOW }}>
        {still?.exists ? <Image source={{ uri: still.uri }} style={{ flex: 1 }} contentFit="cover" transition={200} /> : null}
        <View style={{ position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 6, height: 20, justifyContent: 'center', backgroundColor: GLASS }}>
          <Text style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 11, color: WHITE }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</Text>
        </View>
        {take.starred ? (
          <View style={{ position: 'absolute', right: 8, top: 8 }}><Ionicons name="star" size={16} color={GLOW} /></View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={{ marginTop: 7, fontFamily: SERIF, fontSize: 17, color: WHITE }}>{take.character ?? 'No script'}</Text>
      <Text numberOfLines={1} style={{ fontFamily: SANS_M, fontSize: 11, color: DIM }}>Take {take.number} · {when}</Text>
    </Pressable>
  );
}

/**
 * The room's settings: the tones, the beat after "action", and your slate,
 * typed once and kept on the phone.
 */
function SettingsSheet({ settings, onChange, onClose, onSlate }: { settings: TapeSettings; onChange: (s: TapeSettings) => void; onClose: () => void; onSlate: () => void }) {
  const [slate, setSlate] = useState(settings.slate);
  const keep = (next: typeof slate) => { setSlate(next); onChange({ ...settings, slate: next }); };
  const field = (key: keyof typeof slate, label: string, placeholder: string) => (
    <View style={{ paddingHorizontal: 22, paddingVertical: 6 }}>
      <Text style={{ fontFamily: SANS_M, fontSize: 12, color: DIM, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={slate[key]}
        onChangeText={(v) => keep({ ...slate, [key]: v })}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,250,243,0.3)"
        autoCorrect={false}
        style={{ height: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(255,250,243,0.08)', color: WHITE, fontFamily: SANS_M, fontSize: 16 }}
      />
    </View>
  );
  return (
    <Sheet title="Tape settings" onClose={onClose}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 18 }}>
        <SheetLabel>Sound</SheetLabel>
        <Row label="A tone when it rolls and cuts" sub="So you know it heard you from across the room.">
          <Toggle on={settings.tones} onPress={() => onChange({ ...settings, tones: !settings.tones })} />
        </Row>
        <SheetLabel>After you say “cut”</SheetLabel>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingVertical: 6 }}>
          <Filter label="Save to Tapes" on={settings.afterCut === 'tapes'} onPress={() => onChange({ ...settings, afterCut: 'tapes' })} />
          <Filter label="Play it back" on={settings.afterCut === 'play'} onPress={() => onChange({ ...settings, afterCut: 'play' })} />
        </View>
        <SheetLabel>After you say “action”</SheetLabel>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 22, paddingVertical: 6 }}>
          {([0, 2, 3] as const).map((b) => (
            <Filter key={b} label={b === 0 ? 'Roll at once' : `${b} second beat`} on={settings.beat === b} onPress={() => onChange({ ...settings, beat: b })} />
          ))}
        </View>
        <SheetLabel>Your slate</SheetLabel>
        {field('name', 'Name', 'Your name')}
        {field('height', 'Height', 'Like 5’10”')}
        {field('location', 'Based in', 'Your town')}
        {field('rep', 'Agent or manager (if any)', 'Leave it empty if none')}
        <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
          <Pressable
            onPress={onSlate}
            disabled={!slate.name.trim()}
            accessibilityRole="button"
            style={({ pressed }) => ({ height: 52, borderRadius: 999, backgroundColor: slate.name.trim() ? GLOW : 'rgba(255,250,243,0.12)', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: pressed ? 0.85 : 1 })}
          >
            <Ionicons name="person-circle-outline" size={19} color={slate.name.trim() ? colors.ink : DIM} />
            <Text style={{ fontFamily: SANS, fontSize: 15, color: slate.name.trim() ? colors.ink : DIM }}>Tape my slate</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Sheet>
  );
}

function Row({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 8, gap: 14 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: SANS, fontSize: 15, color: WHITE }}>{label}</Text>
        <Text style={{ fontFamily: SANS_M, fontSize: 12, color: DIM, marginTop: 2 }}>{sub}</Text>
      </View>
      {children}
    </View>
  );
}

function Toggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  const x = useSharedValue(on ? 1 : 0);
  useEffect(() => { x.value = withTiming(on ? 1 : 0, { duration: 180, easing: EASE }); }, [on, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: 3 + x.value * 20 }] }));
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }} accessibilityRole="switch" accessibilityState={{ checked: on }} hitSlop={8}
      style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: on ? GLOW : 'rgba(255,250,243,0.18)', justifyContent: 'center' }}>
      <Animated.View style={[knob, { width: 24, height: 24, borderRadius: 12, backgroundColor: WHITE }]} />
    </Pressable>
  );
}

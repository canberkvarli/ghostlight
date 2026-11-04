import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, Text, View, useWindowDimensions } from 'react-native';
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
  type SharedValue,
} from 'react-native-reanimated';

import { getMonologueById, type Monologue } from '../../src/data/monologues';
import { getMonologue } from '../../src/api/client';
import { apiToMonologue } from '../../src/data/adapt';
import { getOffline } from '../../src/lib/offline';
import { unitsOf } from '../../src/lib/segments';
import { useSession } from '../../src/lib/useSession';
import { useFavorites, useSavedPiece } from '../../src/hooks/useFavorites';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { paywallHref } from '../../src/lib/paywall';
import { useGoBack } from '../../src/lib/nav';
import { track } from '../../src/lib/analytics';
import { loadRecents, type RecentPiece } from '../../src/lib/recents';
import { colors } from '../../src/theme/tokens';
import { EMPTY_READ, lineWords, liveRead, type LiveRead } from '../../src/rehearsal/live-read';
import { hearCue, lineAt, takeEnd, type CueHit, type Heard, type ReadMark, type TapePhase } from '../../src/rehearsal/tape-cues';
import { TapeEar } from '../../src/rehearsal/native/tape-ear';
import {
  addTake,
  allTakes,
  deleteTake,
  FREE_TAPE,
  rememberTapePiece,
  setStarred,
  takeFile,
  takesFor,
  thumbFile,
  type Take,
} from '../../src/lib/takes';
import { canExport, exportTake } from '../../modules/tape-export';

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
  const { id, take: takeParam, name: nameParam } = useLocalSearchParams<{ id: string; take?: string; name?: string }>();
  const router = useRouter();
  const goBack = useGoBack('/search');
  const reduce = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const qc = useQueryClient();
  useKeepAwake();

  /* ─── The piece ───────────────────────────────────────────────────── */

  const free = !id || id === FREE_TAPE;
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
  const [sheet, setSheet] = useState<'piece' | 'tapes' | null>(null);
  const pieceName = free ? 'No script' : monologue?.character ?? nameParam ?? ' ';

  // The same lines the run uses: the cut alone when one is set.
  const lines = useMemo(() => {
    const units = unitsOf(monologue?.fullText ?? '');
    const src = saved ?? monologue;
    if (src?.cutStart != null && src?.cutEnd != null && units.length) {
      const lo = Math.min(src.cutStart, src.cutEnd, units.length - 1);
      const hi = Math.min(Math.max(src.cutStart, src.cutEnd), units.length - 1);
      return units.slice(lo, hi + 1).map((u) => u.text);
    }
    return units.map((u) => u.text);
  }, [monologue, saved]);
  const lineWordsOf = useMemo(() => lines.map((l) => lineWords(l)), [lines]);
  const script = useMemo(() => lineWordsOf.flat(), [lineWordsOf]);
  const lineLengths = useMemo(() => lineWordsOf.map((w) => w.length), [lineWordsOf]);

  /* ─── The room's state ────────────────────────────────────────────── */

  const [phase, setPhaseState] = useState<Phase>('ready');
  const phaseRef = useRef<Phase>('ready');
  const setPhase = useCallback((p: Phase) => { phaseRef.current = p; setPhaseState(p); }, []);
  const [facing, setFacing] = useState<CameraType>('front');
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
          setPosition(r.position);
        }
        listenForCue();
      },
      onLevel: (v) => { level.value = withTiming(v, { duration: 140 }); },
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
  useEffect(() => {
    const t = setInterval(listenForCue, TICK_MS);
    return () => clearInterval(t);
  }, [listenForCue]);
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

  const roll = useCallback(async (via: 'voice' | 'tap') => {
    if (!camera.current || phaseRef.current === 'rolling') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    ear.current?.reset();
    heard.current = { words: [], at: [] };
    read.current = EMPTY_READ;
    reads.current = [];
    setPosition(0);
    setElapsed(0);
    setCurrent(null);
    setSheet(null);
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
    track('app_tape_cut', { via: hit ? 'voice' : 'tap', seconds: Math.round(endMs / 1000), kept: !discard });
    if (!uri) { setPhase('ready'); return; }
    if (discard) {
      try { new File(uri).delete(); } catch { /* gone */ }
      setPhase('ready');
      return;
    }
    const take = await addTake(id || FREE_TAPE, uri, stoppedAt - startedAt.current, endMs, {
      character: free ? undefined : monologue?.character,
      source: free ? undefined : monologue?.source,
      turn: rolledTurn.current,
    });
    setTakes((t) => [...t, take]);
    setCurrent(take);
    TapeEar.speakerOut();
    setPhase('review');
  }, [id, free, monologue?.character, monologue?.source, setPhase]);
  stopRef.current = stop;

  // A take that is thrown away by voice goes straight into the next one.
  const goAgain = useCallback(async (hit: CueHit) => {
    await stop(hit, true);
    setTimeout(() => { void roll('voice'); }, 700);
  }, [roll, stop]);

  // The countdown, for a tap: three beats to walk back to your mark.
  const countdown = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setCurrent(null);
    setSheet(null);
    setCount(3);
    setPhase('countdown');
  }, [setPhase]);
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) { void roll('tap'); return; }
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
    else countdown();
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
    if (hit.cue === 'action' && p === 'ready') void roll('voice');
    else if (hit.cue === 'cut' && p === 'rolling') void stop(hit);
    else if (hit.cue === 'again' && p === 'rolling') void goAgain(hit);
    else if (hit.cue === 'again' && p === 'review') void roll('voice');
    else if (hit.cue === 'keeper' && p === 'review' && current) void toggleStar(current, true);
  };

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
    return exportTake({ input: src.uri, output: out.uri, endMs: take.endMs, mark: !isPaid });
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

  useEffect(() => { setSavedId(null); }, [current?.id]);

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
    if (piece !== FREE_TAPE) {
      // Start the words on their way before the room changes over.
      void qc.prefetchQuery({ queryKey: ['monologue', piece], queryFn: () => loadPiece(piece) });
    }
    setPrompter(true);
    router.setParams({ id: piece, name, take: undefined });
  }, [id, qc, router]);

  /* ─── The stage ───────────────────────────────────────────────────── */

  const rolling = phase === 'rolling';
  const here = lineAt(lineLengths, position);
  // The last line is behind you: the prompter goes, and you hold the moment.
  const atEnd = rolling && script.length > 0 && position >= script.length - 1;
  const topH = insets.top + BAR_H;
  const showPrompter = allowed && prompter && phase !== 'review' && !atEnd && (lines.length > 0 || loading);

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
        <Prompter key={`p${turn}${id}`} lines={lines} loading={loading} at={rolling ? here : 0} turn={turn} width={width} top={topH} rolling={rolling} />
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
          onPlaying={(on) => {
            playing.current = on;
            if (!on) ear.current?.reset();
          }}
        />
      ) : null}

      {/* The top bar, on a soft shadow. */}
      <Scrim edge="top" height={topH + 40} />
      <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top, left: 0, right: 0, height: BAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
        <View style={{ width: 96, flexDirection: 'row' }}>
          {rolling ? null : (
            <Round icon={phase === 'review' ? 'close' : 'chevron-down'} label={phase === 'review' ? 'Back to the camera' : 'Leave'} turn={turn} onPress={phase === 'review' ? closeReview : goBack} />
          )}
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
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
        <View style={{ width: 96, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          {rolling ? null : phase === 'review' && current ? (
            <Round icon="trash-outline" label={`Delete take ${current.number}`} turn={turn} onPress={() => remove(current)} />
          ) : allowed ? (
            <>
              <Round icon={prompter ? 'reader' : 'reader-outline'} label={prompter ? 'Hide the lines' : 'Show the lines'} on={prompter && lines.length > 0} turn={turn} onPress={() => { Haptics.selectionAsync().catch(() => {}); setPrompter((v) => !v); }} />
              <Round icon="camera-reverse-outline" label="Flip the camera" turn={turn} onPress={() => { Haptics.selectionAsync().catch(() => {}); setFacing((f) => (f === 'front' ? 'back' : 'front')); }} />
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
      <Scrim edge="bottom" height={phase === 'review' ? 260 : 210} />
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
            <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
              <Action icon="refresh" label="Again" primary turn={turn} onPress={countdown} />
              <Action icon={current.starred ? 'star' : 'star-outline'} label={current.starred ? 'Kept' : 'Keep'} on={current.starred} turn={turn} onPress={() => toggleStar(current)} />
              <Action icon={savedId === current.id ? 'checkmark' : 'download-outline'} label={savedId === current.id ? 'Saved' : 'Save'} busy={busy === 'save'} turn={turn} onPress={() => save(current)} />
              <Action icon="paper-plane-outline" label="Send" busy={busy === 'share'} turn={turn} onPress={() => share(current)} />
            </View>
          </Animated.View>
        ) : allowed ? (
          <View>
            <Cue phase={phase} hearing={hearing} atEnd={atEnd} turn={turn} />
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                {rolling ? null : <Ear on={hearing} level={level} turn={turn} onPress={toggleEar} />}
              </View>
              <RecordButton rolling={rolling} counting={phase === 'countdown'} atEnd={atEnd} onPress={onRecord} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                {rolling || phase === 'countdown' ? null : (
                  <Action icon="albums-outline" label="Tapes" turn={turn} badge={takes.length || undefined} onPress={() => { Haptics.selectionAsync().catch(() => {}); setSheet('tapes'); }} />
                )}
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {sheet === 'piece' ? (
        <PiecePicker current={id || FREE_TAPE} signedIn={isAuthenticated} onClose={() => setSheet(null)} onPick={pickPiece} />
      ) : sheet === 'tapes' ? (
        <TapesLibrary current={current?.id ?? null} onClose={() => setSheet(null)} onOpen={openTake} />
      ) : null}
    </View>
  );
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
const Prompter = memo(function Prompter({ lines, loading, at, turn, width, top, rolling }: { lines: string[]; loading: boolean; at: number; turn: number; width: number; top: number; rolling: boolean }) {
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
              {line}
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

/** One quiet line over the record button: what to say next. */
function Cue({ phase, hearing, atEnd, turn }: { phase: Phase; hearing: boolean; atEnd: boolean; turn: number }) {
  const text =
    phase === 'countdown' ? '(tap to stop the count.)'
      : phase === 'rolling' ? (hearing ? (atEnd ? '(hold it. then say “cut”.)' : '(say “cut” when you are done.)') : '(tap to cut.)')
      : hearing ? '(say “action”, or tap.)' : '(tap to roll.)';
  return (
    <View style={{ height: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
      <Animated.Text key={text} entering={FadeIn.duration(260)} exiting={FadeOut.duration(140)} style={{ fontFamily: TYPE_I, fontSize: 13, color: DIM, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6, transform: [{ rotate: `${turn}deg` }] }}>
        {text}
      </Animated.Text>
    </View>
  );
}

/** The take, played straight back. Once through, then it waits. */
function Review({ take, turn, width, height, onPlaying }: { take: Take; turn: number; width: number; height: number; onPlaying: (on: boolean) => void }) {
  const uri = takeFile(take).uri;
  const endS = take.endMs / 1000;
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.1;
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
    if (ended || player.currentTime >= endS - 0.05) player.currentTime = 0;
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
    </Animated.View>
  );
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
function Action({ icon, label, onPress, primary, on, busy, badge, turn }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; primary?: boolean; on?: boolean; busy?: boolean; badge?: number; turn: number }) {
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
          <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: GLOW, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: SANS, fontSize: 11, color: colors.ink }}>{badge}</Text>
          </View>
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
      <Animated.View
        entering={FadeInDown.duration(320).easing(EASE)}
        exiting={FadeOutDown.duration(200)}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: tall ? height * 0.82 : undefined, maxHeight: height * 0.82, backgroundColor: colors.ink, borderTopWidth: 1, borderColor: 'rgba(255,250,243,0.12)', paddingBottom: insets.bottom }}
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

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Share, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEventListener } from 'expo';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { File, Paths } from 'expo-file-system';
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
} from 'react-native-reanimated';

import { getMonologueById, type Monologue } from '../../src/data/monologues';
import { getMonologue } from '../../src/api/client';
import { apiToMonologue } from '../../src/data/adapt';
import { getOffline } from '../../src/lib/offline';
import { unitsOf } from '../../src/lib/segments';
import { useSession } from '../../src/lib/useSession';
import { useSavedPiece } from '../../src/hooks/useFavorites';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { paywallHref } from '../../src/lib/paywall';
import { useGoBack } from '../../src/lib/nav';
import { track } from '../../src/lib/analytics';
import { colors } from '../../src/theme/tokens';
import { EMPTY_READ, lineWords, liveRead, type LiveRead } from '../../src/rehearsal/live-read';
import { hearCue, lineAt, takeEnd, type CueHit, type Heard, type ReadMark, type TapePhase } from '../../src/rehearsal/tape-cues';
import { TapeEar } from '../../src/rehearsal/native/tape-ear';
import { addTake, deleteTake, setStarred, takeFile, takesFor, type Take } from '../../src/lib/takes';
import { canExport, exportTake } from '../../modules/tape-export';

/**
 * Tape it: the self-tape room.
 *
 * It opens on the camera, already framed, already listening. Say "action"
 * and it rolls, say "cut" and it stops and plays the take straight back. Say
 * "action" again for the next one, "keeper" to star the one you liked. The
 * piece runs under the lens as you say it, so your eyes stay near the camera.
 * Nothing to set up and nothing to read: one button for those who would
 * rather tap, and the takes on the phone, never uploaded.
 *
 * The ear knows the piece. A "cut" in the text is a line, not a cue (see
 * tape-cues.ts), and the take ends a held beat after your last word, before
 * the cue was said, so the export is clean.
 *
 * Free takes save with a small Ghost Light mark in the corner; a paid plan
 * saves them clean.
 */

type Phase = 'ready' | 'countdown' | 'rolling' | 'review';

const WHITE = '#fffaf3';
const DIM = 'rgba(255,250,243,0.55)';
const GLOW = colors.stageGlow;
const ROLL_RED = '#e5484d';
const EASE = Easing.out(Easing.cubic);
/** The longest take: a monologue is two minutes, a long one five. */
const MAX_TAKE_S = 600;
/** How often the ear's rules look again with nothing new heard (the settle rule needs time to pass). */
const TICK_MS = 150;

export default function TapeRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = useGoBack('/search');
  const reduce = useReducedMotion();
  const { width, height } = useWindowDimensions();
  useKeepAwake();

  /* ─── The piece ───────────────────────────────────────────────────── */

  const fixture = id ? getMonologueById(id) : undefined;
  const { data: fetched } = useQuery<Monologue>({
    queryKey: ['monologue', id],
    enabled: Boolean(id) && !fixture,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        return apiToMonologue(await getMonologue(id!, signal));
      } catch (err) {
        const local = await getOffline(id!);
        if (local) return local;
        throw err;
      }
    },
  });
  const monologue = fixture ?? fetched;
  const { isAuthenticated } = useSession();
  const saved = useSavedPiece(id ?? '', isAuthenticated);
  const { isPaid } = useEntitlement();

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

  useEffect(() => {
    if (!id) return;
    takesFor(id).then(setTakes).catch(() => {});
    track('app_tape_opened', { id });
  }, [id]);

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
    setPhase('rolling');
    startedAt.current = Date.now();
    stopping.current = false;
    track('app_tape_rolled', { via });
    const rec = camera.current.recordAsync({ maxDuration: MAX_TAKE_S, codec: 'avc1' });
    recording.current = rec;
    // The longest take, reached: it stops by itself and is kept whole.
    rec.then(() => { if (recording.current === rec && phaseRef.current === 'rolling' && !stopping.current) void stopRef.current(null); }).catch(() => {});
  }, [setPhase]);

  const stop = useCallback(async (hit: CueHit | null, discard = false) => {
    if (phaseRef.current !== 'rolling' || stopping.current || !id) return;
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
    const take = await addTake(id, uri, stoppedAt - startedAt.current, endMs);
    setTakes((t) => [...t, take]);
    setCurrent(take);
    TapeEar.speakerOut();
    setPhase('review');
  }, [id, setPhase]);
  const stopRef = useRef(stop);
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
    Alert.alert(`Delete take ${take.number}?`, undefined, [
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
    const who = (monologue?.character ?? 'Take').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'Take';
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

  /* ─── The stage ───────────────────────────────────────────────────── */

  const rolling = phase === 'rolling';
  const here = lineAt(lineLengths, position);

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

      {/* The eye line, before a take: a hairline a third of the way down. Gone when rolling. */}
      {allowed && phase === 'ready' && !current ? (
        <Animated.View
          entering={FadeIn.duration(500)}
          exiting={FadeOut.duration(200)}
          pointerEvents="none"
          style={{ position: 'absolute', left: width * 0.18, right: width * 0.18, top: height * 0.36, height: 1, backgroundColor: 'rgba(255,250,243,0.22)' }}
        />
      ) : null}

      {/* The piece, under the lens. */}
      {allowed && prompter && lines.length && phase !== 'review' ? (
        <Prompter key={`p${turn}`} lines={lines} at={rolling ? here : 0} turn={turn} width={width} height={height} rolling={rolling} />
      ) : null}

      {/* Three, two, one. */}
      {phase === 'countdown' && count > 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.Text
            key={count}
            entering={reduce ? FadeIn.duration(120) : ZoomIn.duration(360).easing(EASE)}
            exiting={FadeOut.duration(260)}
            style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 168, color: WHITE, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 24, transform: [{ rotate: `${turn}deg` }] }}
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

      <SafeAreaView style={{ flex: 1 }} pointerEvents="box-none">
        {/* The top: the way out, and two switches. Nothing while rolling but the clock. */}
        <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, height: 56 }}>
          {rolling ? (
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Clock ms={elapsed} turn={turn} />
            </View>
          ) : (
            <>
              <Round icon={phase === 'review' ? 'close' : 'chevron-down'} label={phase === 'review' ? 'Back to the camera' : 'Leave the tape room'} turn={turn} onPress={phase === 'review' ? closeReview : goBack} />
              {phase === 'review' && current ? (
                <Animated.View entering={FadeIn.duration(260)} style={{ flexDirection: 'row', gap: 10 }}>
                  <Round icon="trash-outline" label={`Delete take ${current.number}`} turn={turn} onPress={() => remove(current)} />
                </Animated.View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Round icon={prompter ? 'document-text' : 'document-text-outline'} label={prompter ? 'Hide the lines' : 'Show the lines'} on={prompter} turn={turn} onPress={() => { Haptics.selectionAsync().catch(() => {}); setPrompter((v) => !v); }} />
                  <Round icon="camera-reverse-outline" label="Flip the camera" turn={turn} onPress={() => { Haptics.selectionAsync().catch(() => {}); setFacing((f) => (f === 'front' ? 'back' : 'front')); }} />
                </View>
              )}
            </>
          )}
        </View>

        {!allowed ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
            <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 15, color: DIM, textAlign: 'center' }}>
              {refused ? '(the camera and the microphone are off for Ghost Light.)' : '(finding the camera…)'}
            </Text>
            {refused ? (
              <Pressable onPress={() => Linking.openSettings().catch(() => {})} hitSlop={10} style={{ marginTop: 14 }} accessibilityRole="button">
                <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 15, color: GLOW }}>(turn them on in settings.)</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={{ flex: 1 }} pointerEvents="box-none" />
        )}

        {/* The take strip, while watching: tap to see another, hold to delete. */}
        {phase === 'review' && takes.length > 1 ? (
          <Animated.View entering={FadeInDown.duration(320).easing(EASE)} exiting={FadeOutDown.duration(180)}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, gap: 8, paddingBottom: 14 }}>
              {takes.slice().reverse().map((t) => (
                <Chip key={t.id} take={t} on={t.id === current?.id} turn={turn} onPress={() => { Haptics.selectionAsync().catch(() => {}); setCurrent(t); }} onLongPress={() => remove(t)} />
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}

        {/* The bottom. */}
        {phase === 'review' && current ? (
          <Animated.View entering={FadeInDown.duration(360).easing(EASE)} exiting={FadeOutDown.duration(180)} style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
            {markNote ? (
              <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: 'center', marginBottom: 12 }}>
                <Pressable onPress={() => router.push(paywallHref('tape_mark'))} hitSlop={8} accessibilityRole="button">
                  <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, color: DIM }}>
                    (saved with the ghost light mark. <Text style={{ color: GLOW }}>save it clean.</Text>)
                  </Text>
                </Pressable>
              </Animated.View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Pressable
                onPress={countdown}
                accessibilityRole="button"
                accessibilityLabel="Another take"
                style={({ pressed }) => ({ flex: 1, height: 56, borderRadius: 999, backgroundColor: GLOW, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
              >
                <Ionicons name="refresh" size={18} color={colors.ink} />
                <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 16, color: colors.ink }}>Again</Text>
              </Pressable>
              <Round big icon={current.starred ? 'star' : 'star-outline'} label={current.starred ? 'Starred' : 'Star this take'} on={current.starred} turn={turn} onPress={() => toggleStar(current)} />
              <Round big icon={savedId === current.id ? 'checkmark' : 'arrow-down'} label="Save to Photos" busy={busy === 'save'} turn={turn} onPress={() => save(current)} />
              <Round big icon="share-outline" label="Send it" busy={busy === 'share'} turn={turn} onPress={() => share(current)} />
            </View>
          </Animated.View>
        ) : allowed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 34, paddingBottom: 14, height: 112 }}>
            <Ear on={hearing} level={level} turn={turn} hidden={rolling} onPress={toggleEar} />
            <RecordButton rolling={rolling} counting={phase === 'countdown'} onPress={onRecord} />
            <Last takes={takes} hidden={rolling || phase === 'countdown'} turn={turn} onPress={() => {
              const last = takes[takes.length - 1];
              if (!last) return;
              Haptics.selectionAsync().catch(() => {});
              setCurrent(last);
              setPhase('review');
            }} />
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

/* ─── Pieces of the room ─────────────────────────────────────────────── */

/**
 * The prompter: the line you are on, and the next, at the top where the lens
 * is. Turned with the phone, it lies along the lens's edge.
 */
const Prompter = memo(function Prompter({ lines, at, turn, width, height, rolling }: { lines: string[]; at: number; turn: number; width: number; height: number; rolling: boolean }) {
  const turned = Math.abs(turn) === 90;
  const box = { w: width, h: turned ? width * 0.62 : height * 0.3 };
  const inner = turned ? { w: box.h, h: box.w } : box;
  const line = lines[at] ?? '';
  const next = lines[at + 1] ?? '';
  const long = line.length > 120;
  return (
    <Animated.View entering={FadeIn.duration(320)} exiting={FadeOut.duration(160)} pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: box.w, height: box.h }}>
      <Canvas style={{ position: 'absolute', top: 0, left: 0, width: box.w, height: box.h }}>
        <Rect x={0} y={0} width={box.w} height={box.h}>
          <LinearGradient start={vec(0, 0)} end={vec(0, box.h)} colors={['rgba(8,5,4,0.78)', 'rgba(8,5,4,0.42)', 'rgba(8,5,4,0)']} />
        </Rect>
      </Canvas>
      <View
        style={{
          position: 'absolute',
          width: inner.w,
          height: inner.h,
          left: (box.w - inner.w) / 2,
          top: (box.h - inner.h) / 2,
          transform: [{ rotate: `${turn}deg` }],
          paddingHorizontal: 26,
          paddingTop: turned ? 18 : 64,
          justifyContent: 'flex-start',
        }}
      >
        <Animated.Text
          key={`l${at}`}
          entering={FadeInDown.duration(300).easing(EASE)}
          style={{ fontFamily: 'CourierPrime_400Regular', fontSize: long ? 17 : 20, lineHeight: long ? 24 : 28, color: WHITE, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8 }}
          numberOfLines={turned ? 3 : 4}
        >
          {line}
        </Animated.Text>
        {next && (rolling || at === 0) ? (
          <Animated.Text
            key={`n${at}`}
            entering={FadeIn.delay(120).duration(300)}
            style={{ marginTop: 10, fontFamily: 'CourierPrime_400Regular', fontSize: 15, lineHeight: 21, color: DIM, textAlign: 'center' }}
            numberOfLines={2}
          >
            {next}
          </Animated.Text>
        ) : null}
      </View>
    </Animated.View>
  );
});

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
  return (
    <Animated.View entering={FadeIn.duration(380)} exiting={FadeOut.duration(220)} style={{ position: 'absolute', top: 0, left: 0, width, height, backgroundColor: '#000' }}>
      <Pressable onPress={replay} accessibilityRole="button" accessibilityLabel={ended ? 'Watch it again' : 'Pause'} style={{ flex: 1 }}>
        <View style={{ position: 'absolute', width: inner.w, height: inner.h, left: (width - inner.w) / 2, top: (height - inner.h) / 2, transform: [{ rotate: `${turn}deg` }] }}>
          <VideoView player={player} nativeControls={false} contentFit="contain" style={{ flex: 1 }} />
        </View>
        {ended ? (
          <Animated.View entering={FadeIn.duration(260)} pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(8,5,4,0.5)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${turn}deg` }] }}>
              <Ionicons name="play" size={30} color={WHITE} style={{ marginLeft: 4 }} />
            </View>
          </Animated.View>
        ) : null}
      </Pressable>
      <View pointerEvents="none" style={{ position: 'absolute', top: 64, left: 0, right: 0, alignItems: 'center' }}>
        <Text style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 24, color: WHITE, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 10, transform: [{ rotate: `${turn}deg` }] }}>
          Take {take.number}
          {take.starred ? <Text style={{ color: GLOW }}> ★</Text> : null}
        </Text>
      </View>
    </Animated.View>
  );
}

/**
 * The one button. A disc that becomes a square while rolling, the way a
 * camera's does; it breathes while counting down.
 */
function RecordButton({ rolling, counting, onPress }: { rolling: boolean; counting: boolean; onPress: () => void }) {
  const reduce = useReducedMotion();
  const shape = useSharedValue(0);
  const pulse = useSharedValue(1);
  useEffect(() => {
    shape.value = withTiming(rolling ? 1 : 0, { duration: reduce ? 0 : 260, easing: EASE });
  }, [rolling, reduce, shape]);
  useEffect(() => {
    pulse.value = counting && !reduce ? withRepeat(withSequence(withTiming(0.9, { duration: 500 }), withTiming(1, { duration: 500 })), -1) : withTiming(1, { duration: 200 });
  }, [counting, reduce, pulse]);
  const core = useAnimatedStyle(() => {
    const size = 64 - shape.value * 34;
    return {
      width: size,
      height: size,
      borderRadius: size / 2 - shape.value * (size / 2 - 8),
      transform: [{ scale: pulse.value }],
    };
  });
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={rolling ? 'Cut' : counting ? 'Stop the countdown' : 'Action'}
      style={({ pressed }) => ({ width: 82, height: 82, borderRadius: 41, borderWidth: 4, borderColor: WHITE, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}
    >
      <Animated.View style={[core, { backgroundColor: ROLL_RED }]} />
    </Pressable>
  );
}

/** The ear: the ghost light's bulb, glowing with your voice. Tap to turn it off. */
function Ear({ on, level, turn, hidden, onPress }: { on: boolean; level: { value: number }; turn: number; hidden: boolean; onPress: () => void }) {
  const glow = useAnimatedStyle(() => ({
    opacity: on ? 0.35 + level.value * 0.65 : 0,
    transform: [{ scale: 1 + level.value * 0.9 }],
  }));
  return (
    <Animated.View style={{ opacity: hidden ? 0.4 : 1 }}>
      <Pressable onPress={onPress} hitSlop={14} accessibilityRole="button" accessibilityLabel={on ? 'Listening for action and cut. Tap to stop listening.' : 'Listen for action and cut'} accessibilityState={{ selected: on }} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[glow, { position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: GLOW }]} />
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: on ? '#ffd9a8' : 'rgba(255,250,243,0.35)', borderWidth: on ? 0 : 1.5, borderColor: WHITE }} />
        <Ionicons name={on ? 'mic' : 'mic-off'} size={12} color={on ? 'transparent' : WHITE} style={{ position: 'absolute', bottom: 2, right: 2, transform: [{ rotate: `${turn}deg` }] }} />
      </Pressable>
    </Animated.View>
  );
}

/** The last take, a tap away. */
function Last({ takes, hidden, turn, onPress }: { takes: Take[]; hidden: boolean; turn: number; onPress: () => void }) {
  const last = takes[takes.length - 1];
  if (!last || hidden) return <View style={{ width: 52 }} />;
  return (
    <Animated.View entering={FadeIn.duration(260)} exiting={FadeOut.duration(160)}>
      <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Watch take ${last.number}`} style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,250,243,0.7)', backgroundColor: 'rgba(8,5,4,0.35)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
        <Text style={{ fontFamily: 'InstrumentSerif_400Regular', fontSize: 22, color: WHITE, transform: [{ rotate: `${turn}deg` }] }}>{last.number}</Text>
      </Pressable>
    </Animated.View>
  );
}

function Chip({ take, on, turn, onPress, onLongPress }: { take: Take; on: boolean; turn: number; onPress: () => void; onLongPress: () => void }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={`Take ${take.number}${take.starred ? ', starred' : ''}`} accessibilityState={{ selected: on }}
      style={{ height: 36, minWidth: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: on ? WHITE : 'rgba(255,250,243,0.35)', backgroundColor: on ? WHITE : 'rgba(8,5,4,0.35)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <Text style={{ fontFamily: 'BricolageGrotesque_600SemiBold', fontSize: 14, color: on ? colors.ink : WHITE, transform: [{ rotate: `${turn}deg` }] }}>{take.number}</Text>
      {take.starred ? <Ionicons name="star" size={11} color={GLOW} /> : null}
    </Pressable>
  );
}

/** A round button on the glass. Its icon turns with the phone. */
function Round({ icon, label, on, big, busy, turn, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; on?: boolean; big?: boolean; busy?: boolean; turn: number; onPress: () => void }) {
  const t = useSharedValue(turn);
  useEffect(() => { t.value = withTiming(turn, { duration: 280, easing: EASE }); }, [turn, t]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${t.value}deg` }] }));
  const size = big ? 56 : 42;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(on), busy: Boolean(busy) }}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: on ? 'rgba(255,250,243,0.92)' : 'rgba(8,5,4,0.42)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
    >
      {busy ? (
        <ActivityIndicator color={on ? colors.ink : WHITE} />
      ) : (
        <Animated.View style={spin}>
          <Ionicons name={icon} size={big ? 22 : 19} color={on ? (icon.startsWith('star') ? GLOW : colors.ink) : WHITE} />
        </Animated.View>
      )}
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
    <Animated.View entering={FadeIn.duration(200)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 30, backgroundColor: 'rgba(8,5,4,0.45)', transform: [{ rotate: `${turn}deg` }] }}>
      <Animated.View style={[dot, { width: 8, height: 8, borderRadius: 4, backgroundColor: ROLL_RED }]} />
      <Text style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 14, letterSpacing: 1.4, color: WHITE }}>
        {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
      </Text>
    </Animated.View>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';

import { StageBackdrop } from '../../src/components/StageBackdrop';
import { StageDirection } from '../../src/components/StageDirection';
import { PrimaryPill } from '../../src/components/PrimaryPill';
import { CastSheet } from '../../src/components/rehearse/CastSheet';
import { Stage } from '../../src/components/rehearse/Stage';
import { useStageMotion } from '../../src/hooks/useStageMotion';
import { useRehearsal } from '../../src/hooks/useRehearsal';
import { useGuided, useRehearsalScene } from '../../src/hooks/useScenePartner';
import { track } from '../../src/lib/analytics';
import { useGoBack } from '../../src/lib/nav';
import type { ScenePayload } from '../../src/rehearsal/contract';
import { useTheme } from '../../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const MONO = 'CourierPrime_400Regular';
const SANS_B = 'BricolageGrotesque_600SemiBold';

/**
 * The rehearsal: the cast sheet, the run, the ending, one route. `id` is a
 * scene, or `guided` for the first run the server picks. The sheet opens the
 * run when a part is tapped (that is the commitment, and the gate's answer);
 * Begin lights when the first partner line is decoded and the microphone is
 * there. The run is the sides and nothing else, with a thin bar for leaving
 * and a dock for pause, skip and back. The end is a moment, not a report.
 */
export default function Rehearse() {
  const { id, from, go } = useLocalSearchParams<{ id: string; from?: string; go?: string }>();
  const guided = id === 'guided';
  const { data: guidedPick, isError: guidedFailed } = useGuided(guided);
  const sceneId = guided ? guidedPick?.scene_id ?? null : Number(id);
  const { data: payload, isLoading, isError, refetch } = useRehearsalScene(Number.isFinite(sceneId as number) ? sceneId : null);
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const goBack = useGoBack('/rehearse');

  useEffect(() => {
    track('app_rehearse_opened', { from: guided ? 'guided' : from === 'script' || from === 'library' || from === 'home' || from === 'link' ? from : 'library' });
  }, [guided, from]);

  const failed = isError || guidedFailed;
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      {payload ? (
        <Run payload={payload} guided={guided} guidedPart={guidedPick?.character ?? null} go={go === '1'} onLeave={goBack} onAgain={() => void refetch()} />
      ) : (
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <TopBar title="" onLeave={goBack} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            {failed ? (
              <>
                <StageDirection style={{ textAlign: 'center' }} numberOfLines={2}>(the scene would not open.)</StageDirection>
                <PrimaryPill label="Try again" variant="outline" onPress={() => void refetch()} style={{ marginTop: 18 }} />
              </>
            ) : (
              <>
                <ActivityIndicator color={c.mutedForeground} />
                <StageDirection style={{ marginTop: 14 }}>{isLoading || guided ? '(finding the pages.)' : '(…)'}</StageDirection>
              </>
            )}
          </View>
        </SafeAreaView>
      )}
    </View>
  );
}

/** What Begin is waiting on, as one stage direction. */
function waitingLine(r: { line1: boolean; stt: boolean; mic: boolean }): string | null {
  if (!r.line1) return 'recording the partner. the first time takes a moment.';
  if (!r.mic) return 'listening needs the microphone.';
  if (!r.stt) return 'the recogniser is not there yet.';
  return null;
}

/** Phone wording for the engine's plain errors: there is nothing to "reload" here. */
function phoneError(e: string | null): string | null {
  if (!e) return null;
  return e
    .replace('Reload to run again.', 'Leave and open the scene again.')
    .replace('Allow it in your browser and reload.', 'Allow it in Settings and come back.');
}

function Run({ payload, guided, guidedPart, go, onLeave, onAgain }: {
  payload: ScenePayload; guided: boolean; guidedPart: string | null;
  /** `?go=1`, as on the web: begin the moment Begin would light. A link from a reminder, or a test. */
  go: boolean; onLeave: () => void; onAgain: () => void;
}) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const r = useRehearsal(payload);
  const [chosen, setChosen] = useState<string | null>(null);
  const [resumed, setResumed] = useState(false);
  const [armed, setArmed] = useState(false); // Begin was tapped: start the moment the first line is ready
  const begunAt = useRef<number | null>(null);
  const endedRef = useRef(false);
  const source = guided ? 'guided' : payload.scene.is_library ? 'library' : 'script';

  const onBeginTap = useCallback((character: string, voices: Record<string, string>, pickUp?: { runId: number; lineIndex: number }) => {
    setChosen(character || guidedPart || payload.characters[0] || '');
    setResumed(Boolean(pickUp));
    setArmed(true);
    void r.prepare(character, voices, pickUp ? { resumeRunId: pickUp.runId, resumeLine: pickUp.lineIndex } : guided ? { guided: true } : undefined);
  }, [r, guided, guidedPart, payload.characters]);


  useEffect(() => {
    if (r.gated) track('app_rehearse_gated', { source: payload.scene.is_library ? 'library' : 'script', to_paywall: false });
  }, [r.gated, payload.scene.is_library]);

  const begin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    begunAt.current = Date.now();
    track('app_rehearse_begun', { source, lines: payload.lines.length, resumed });
    r.begin();
  };

  const state = r.snapshot?.state ?? 'ready';
  const ended = state === 'ended';
  const wentRef = useRef(false);
  // `?go=1` arms the sheet by itself, with the server's part and the default voices.
  useEffect(() => {
    if (go && !armed && (guided ? guidedPart : payload.characters[0])) onBeginTap(guided ? '' : payload.characters[0], {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go, guided, guidedPart]);
  useEffect(() => {
    if (armed && r.canBegin && state === 'ready' && !wentRef.current) { wentRef.current = true; begin(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, r.canBegin, state]);
  useEffect(() => {
    if (!ended || endedRef.current) return;
    endedRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    track('app_rehearse_ended', { source, how: 'completed', lines: payload.lines.length, seconds: begunAt.current ? Math.round((Date.now() - begunAt.current) / 1000) : 0 });
  }, [ended, source, payload.lines.length]);

  const leave = () => {
    if (begunAt.current && !endedRef.current) {
      track('app_rehearse_ended', { source, how: 'left', lines: payload.lines.length, seconds: Math.round((Date.now() - begunAt.current) / 1000) });
    }
    r.leave();
    onLeave();
  };

  const running = state !== 'ready' && !ended;
  const paused = state === 'paused';
  const actor = chosen ?? payload.characters[0] ?? '';
  const sceneLine = useMemo(() => [payload.scene.play_title, payload.scene.title].filter(Boolean).join(' · '), [payload.scene]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
      <TopBar title={running || ended ? sceneLine : ''} onLeave={leave} progress={running ? progressOf(r.snapshot?.lineIndex ?? 0, payload.lines.length) : null} />
      {ended ? (
        <Animated.View entering={FadeIn.duration(420)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <StageDirection>(lights down.)</StageDirection>
          <Text style={{ marginTop: 18, textAlign: 'center', fontFamily: SERIF, fontSize: 36, lineHeight: 40, letterSpacing: -0.5, color: c.foreground }}>
            {payload.scene.title}
          </Text>
          {payload.scene.play_title ? (
            <Text style={{ marginTop: 8, fontFamily: MONO, fontSize: 13, color: c.mutedForeground }}>{payload.scene.play_title}</Text>
          ) : null}
          <Text style={{ marginTop: 26, textAlign: 'center', fontFamily: SERIF_I, fontSize: 22, color: c.accentText }}>
            {guided ? 'That is the whole of it.' : 'Again, from the top?'}
          </Text>
          <View style={{ marginTop: 26, flexDirection: 'row', gap: 12 }}>
            <PrimaryPill label="Again" onPress={() => { track('app_rehearse_opened', { from: 'library' }); onAgain(); }} />
            <PrimaryPill label="Done" variant="outline" onPress={leave} />
          </View>
        </Animated.View>
      ) : running ? (
        <Animated.View entering={FadeInDown.duration(520).springify().damping(18)} exiting={FadeOut.duration(200)} style={{ flex: 1 }}>
          <Stage scene={payload.scene} lines={payload.lines} actor={actor} snapshot={r.snapshot} paused={paused} onJump={l => r.jumpTo(l)} />
          {r.readiness.error ? (
            <StageDirection numberOfLines={2} style={{ textAlign: 'center', paddingHorizontal: 24 }}>({phoneError(r.readiness.error)?.toLowerCase()})</StageDirection>
          ) : null}
          <Dock paused={paused} onPause={r.pause} onResume={r.resume} onSkip={r.skip} onBack={r.back} />
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(260)} style={{ flex: 1 }}>
          <CastSheet
            payload={payload}
            guided={guided}
            preparing={armed && !r.gated && !r.readiness.error}
            waiting={waitingLine(r.readiness)}
            error={phoneError(r.readiness.error)}
            gated={r.gated}
            onBegin={onBeginTap}
            onPlans={() => { track('app_rehearse_gated', { source: payload.scene.is_library ? 'library' : 'script', to_paywall: true }); router.push('/paywall'); }}
          />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const progressOf = (line: number, of: number) => (of > 0 ? Math.min(1, line / of) : 0);

/** The bar across the top: leave, where in the scene. A reading, not a control. */
function TopBar({ title, onLeave, progress = null }: { title: string; onLeave: () => void; progress?: number | null }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }}>
      <Pressable onPress={onLeave} hitSlop={12} accessibilityRole="button" accessibilityLabel="Leave the scene" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="close" size={22} color={c.mutedForeground} />
      </Pressable>
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: SANS_B, fontSize: 12, letterSpacing: 0.4, color: c.mutedForeground }}>{title}</Text>
      {progress !== null ? (
        <View style={{ width: 64, height: 2, backgroundColor: c.divider, borderRadius: 1, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(progress * 100)}%`, height: 2, backgroundColor: c.yellow }} />
        </View>
      ) : null}
    </View>
  );
}

/** Pause in the middle, the last exchange and the next line either side. */
function Dock({ paused, onPause, onResume, onSkip, onBack }: { paused: boolean; onPause: () => void; onResume: () => void; onSkip: () => void; onBack: () => void }) {
  const { colors: c } = useTheme();
  const tap = (fn: () => void) => () => { Haptics.selectionAsync().catch(() => {}); fn(); };
  const side = { width: 48, height: 48, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 26, paddingVertical: 10 }}>
      <Pressable onPress={tap(onBack)} hitSlop={8} accessibilityRole="button" accessibilityLabel="The last exchange again" style={side}>
        <Ionicons name="play-skip-back-outline" size={22} color={c.mutedForeground} />
      </Pressable>
      <Pressable onPress={tap(paused ? onResume : onPause)} accessibilityRole="button" accessibilityLabel={paused ? 'Resume' : 'Pause'}
        style={{ width: 62, height: 62, borderRadius: 31, borderWidth: 1.5, borderColor: paused ? c.yellow : c.border, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={paused ? 'play' : 'pause'} size={24} color={paused ? c.yellow : c.foreground} style={paused ? { marginLeft: 3 } : undefined} />
      </Pressable>
      <Pressable onPress={tap(onSkip)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Skip your line" style={side}>
        <Ionicons name="play-skip-forward-outline" size={22} color={c.mutedForeground} />
      </Pressable>
    </View>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { StageBackdrop } from '../../../../src/components/StageBackdrop';
import { StageDirection } from '../../../../src/components/StageDirection';
import { PrimaryPill } from '../../../../src/components/PrimaryPill';
import { CastSheet } from '../../../../src/components/rehearse/CastSheet';
import { WarmUp } from '../../../../src/components/rehearse/WarmUp';
import { DemoCurtain } from '../../../../src/components/rehearse/DemoCurtain';
import { firstScenes, markDemoDone } from '../../../../src/lib/demo';
import { useTrialOffer } from '../../../../src/hooks/useTrialOffer';
import { useSession } from '../../../../src/lib/useSession';
import { Stage } from '../../../../src/components/rehearse/Stage';
import { useStageMotion } from '../../../../src/hooks/useStageMotion';
import { useEntitlement } from '../../../../src/hooks/useEntitlement';
import { runsSpent } from '../../../../src/api/client';
import { useRehearsal } from '../../../../src/hooks/useRehearsal';
import { sameCharacter } from '../../../../src/rehearsal/contract';
import { useGuided, useRehearsalScene } from '../../../../src/hooks/useScenePartner';
import { track } from '../../../../src/lib/analytics';
import { recordFinishedRun } from '../../../../src/lib/reviewMoments';
import { useGoBack } from '../../../../src/lib/nav';
import type { ScenePayload } from '../../../../src/rehearsal/contract';
import { useTheme } from '../../../../src/theme/ThemeContext';

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
  const { id, from, go, resume, guided: guidedParam, cast, voices: voicesParam, demo, key: demoKey } = useLocalSearchParams<{
    id: string; from?: string; go?: string; resume?: string; guided?: string; cast?: string; voices?: string; demo?: string; key?: string;
  }>();
  const guided = id === 'guided';
  // One of the first scenes, picked on the way in with the part and the voice: a guided run of that scene.
  const picked = guidedParam === 'pick';
  const castVoices = useMemo<Record<string, string>>(() => { try { return voicesParam ? JSON.parse(voicesParam) as Record<string, string> : {}; } catch { return {}; } }, [voicesParam]);
  const demoN: 1 | 2 | null = demo === '1' ? 1 : demo === '2' ? 2 : null;
  const { data: guidedPick, isError: guidedFailed } = useGuided(guided);
  const sceneId = guided ? guidedPick?.scene_id ?? null : Number(id);
  const { data: payload, isLoading, isError, refetch } = useRehearsalScene(Number.isFinite(sceneId as number) ? sceneId : null);
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const goBack = useGoBack('/rehearse');
  const router = useRouter();
  // Again is a new run: the room is remounted, so the engine, the microphone
  // and the players start clean. Refetching alone changed nothing when the
  // scene came back the same, and the ended run stayed ended under the pill.
  const [take, setTake] = useState(1);

  useEffect(() => {
    track('app_rehearse_opened', { from: guided ? 'guided' : from === 'script' || from === 'library' || from === 'home' || from === 'link' ? from : 'library' });
  }, [guided, from]);

  const failed = isError || guidedFailed;
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      {payload ? (
        <Run key={take} payload={payload} guided={guided} picked={picked} cast={cast ?? null} castVoices={castVoices} demoN={demoN} demoKey={demoKey ?? null} guidedPart={guidedPick?.character ?? null} go={go === '1'} pickUp={resume === '1' && take === 1} from={from} onLeave={goBack} onDone={() => router.replace('/rehearse')} onAgain={() => { setTake(t => t + 1); void refetch(); }} />
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

function Run({ payload, guided, picked, cast, castVoices, demoN, demoKey, guidedPart, go, pickUp, from, onLeave, onDone, onAgain }: {
  picked: boolean; cast: string | null; castVoices: Record<string, string>; demoN: 1 | 2 | null; demoKey: string | null;
  payload: ScenePayload; guided: boolean; guidedPart: string | null;
  /** `?go=1`, as on the web: begin the moment Begin would light. A link from a reminder, or a test. */
  go: boolean;
  /** `?resume=1` with go: pick the open run up where it was left, from the room's card. */
  pickUp: boolean; from: string | undefined; onLeave: () => void; onDone: () => void; onAgain: () => void;
}) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const r = useRehearsal(payload);
  // The meter, read ahead: a free actor with no run left this month meets
  // the offer on the sheet's foot before a request is wasted. The guided
  // scene is never metered, and picking an open run back up is not a new one.
  const { wall, isPaid } = useEntitlement();
  const spent = !guided && !picked && !isPaid && runsSpent(wall) && !payload.resume;
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
    void r.prepare(character, voices, pickUp ? { resumeRunId: pickUp.runId, resumeLine: pickUp.lineIndex } : guided ? { guided: true } : picked ? { guided: 'pick' } : undefined);
  }, [r, guided, picked, guidedPart, payload.characters]);

  // A first scene arrives cast: the part and the voice were chosen on the card, so it starts by itself.
  useEffect(() => {
    if (!cast || armed) return;
    onBeginTap(cast, castVoices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cast]);


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
    if (!go || armed || !(guided ? guidedPart : payload.characters[0])) return;
    const r0 = payload.resume;
    if (pickUp && r0 && !guided) onBeginTap(payload.characters[0], {}, { runId: r0.run_id, lineIndex: r0.line_index });
    else onBeginTap(guided ? '' : payload.characters[0], {});
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
    // A scene they brought, run to the end: a rating moment. The first scenes and the guided run are the lesson, not the habit.
    if (!guided && !picked && !demoN) void recordFinishedRun();
  }, [ended, source, payload.lines.length, guided, picked, demoN]);

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
  // The play and the scene, unless they are the same words: an uploaded scene is titled after its script.
  const sceneLine = useMemo(() => {
    const play = payload.scene.play_title?.trim(); const title = payload.scene.title.trim();
    return play && play.toLowerCase() !== title.toLowerCase() ? `${play} · ${title}` : title;
  }, [payload.scene]);

  // The curtain call of a first scene: their own numbers, then the other keys or the week.
  const guidedList = useGuided(Boolean(demoN));
  const { isAuthenticated } = useSession();
  const offer = useTrialOffer({ from: 'demo', onDone: () => {}, onSignIn: () => router.push('/auth') });
  const mine = useMemo(() => payload.lines.filter(l => sameCharacter(l.character, actor)), [payload.lines, actor]);
  const heardCount = mine.filter(l => (r.snapshot?.heard.get(l.index)?.size ?? 0) > 0).length;
  const others = useMemo(() => firstScenes(guidedList.data).filter(s => s.key !== demoKey), [guidedList.data, demoKey]);
  useEffect(() => {
    if (ended && demoN && demoKey) { void markDemoDone(demoKey); track('demo_curtain', { key: demoKey, which: demoN, heard: heardCount, of: mine.length }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended, demoN, demoKey]);
  const leaveDemo = (to: 'curtain' | 'week' | 'another', key?: string) => {
    track('demo_left', { key: demoKey ?? '', which: demoN ?? 0, to });
    if (to === 'another' && key) { router.replace({ pathname: '/demo', params: { key, after: String(demoN ?? 1) } }); return; }
    // Everything under this run, the cards included, goes: back from the
    // home must never find the stranger's path again.
    try { router.dismissAll(); } catch { /* nothing under it */ }
    if (to === 'week') { router.replace(isAuthenticated ? '/search' : '/curtain'); router.push('/paywall'); return; }
    router.replace(isAuthenticated ? '/search' : '/curtain');
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
      <TopBar title={running || ended ? sceneLine : ''} onLeave={leave} progress={running ? progressOf(r.snapshot?.lineIndex ?? 0, payload.lines.length) : null}
        counter={running ? `${(r.snapshot?.lineIndex ?? 0) + 1}/${payload.lines.length}` : null} />
      {ended && demoN ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
          <DemoCurtain
            title={payload.scene.title}
            which={demoN}
            heard={heardCount}
            of={mine.length}
            seconds={begunAt.current ? Math.round((Date.now() - begunAt.current) / 1000) : 0}
            others={others}
            termsLine={offer.termsLine ?? null}
            onAnother={(key) => leaveDemo('another', key)}
            onWeek={() => leaveDemo('week')}
            onNotTonight={() => leaveDemo('curtain')}
          />
        </ScrollView>
      ) : ended ? (
        <Animated.View entering={FadeIn.duration(700).delay(500)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
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
            <PrimaryPill label="Done" variant="outline" onPress={from === 'demo' ? onDone : leave} />
          </View>
        </Animated.View>
      ) : running ? (
        /* At the end the stage goes down slowly, not out: the last line is still there while the lights fade. */
        <Animated.View entering={FadeIn.duration(700).delay(200)} exiting={FadeOut.duration(900)} style={{ flex: 1 }}>
          <Stage scene={payload.scene} lines={payload.lines} actor={actor} snapshot={r.snapshot} paused={paused} onJump={l => r.jumpTo(l)} />
          {r.readiness.error ? (
            <StageDirection numberOfLines={2} style={{ textAlign: 'center', paddingHorizontal: 24 }}>({phoneError(r.readiness.error)?.toLowerCase()})</StageDirection>
          ) : null}
          {/* A first scene says, once, what is about to happen, until the first word of yours is heard. */}
          {demoN && !(r.snapshot && r.snapshot.heard.size > 0) && !(r.snapshot?.read.matched.size) ? (
            <Animated.View entering={FadeIn.duration(260)} exiting={FadeOut.duration(200)} style={{ paddingHorizontal: 24, paddingBottom: 6 }}>
              <StageDirection numberOfLines={2} style={{ textAlign: 'center' }}>
                {state === 'actor' ? '(your line. say it; the words light as you go.)' : `(it reads ${payload.characters.filter(ch => !sameCharacter(ch, actor)).join(' and ').toLowerCase() || 'the others'}. your line is lit when it is yours.)`}
              </StageDirection>
            </Animated.View>
          ) : null}
          {/* One line under the script, always the same height, so the dock never moves: listening, or nothing. */}
          <View style={{ height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {state === 'actor' && !r.readiness.error ? (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary }} />
                <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, letterSpacing: 0.8, color: c.accentText }}>(listening.)</Text>
              </Animated.View>
            ) : null}
          </View>
          <Dock paused={paused} onPause={r.pause} onResume={r.resume} onSkip={r.skip} onBack={r.back} />
        </Animated.View>
      ) : (cast || armed) && !r.gated && !spent && !r.readiness.error ? (
        /* A first scene arrives cast: no sheet to read, only the house getting ready. */
        <WarmUp title={sceneLine} waiting={waitingLine(r.readiness)} />
      ) : (
        <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(260)} style={{ flex: 1 }}>
          {/* The stage, dark, under the sheet: the lines are there before you have a part. */}
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.5 }}>
            <Stage scene={payload.scene} lines={payload.lines} actor="" snapshot={null} paused={false} />
          </View>
          <CastSheet
            payload={payload}
            guided={guided}
            preparing={armed && !r.gated && !spent && !r.readiness.error}
            waiting={waitingLine(r.readiness)}
            error={phoneError(r.readiness.error)}
            gated={r.gated || spent}
            onBegin={onBeginTap}
            onClose={leave}
            onPlans={() => { track('app_rehearse_gated', { source: payload.scene.is_library ? 'library' : 'script', to_paywall: true }); router.push('/paywall'); }}
          />
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const progressOf = (line: number, of: number) => (of > 0 ? Math.min(1, line / of) : 0);

/** The bar across the top: leave, the title with a thin bar of progress under it, and where in the scene as a count. */
function TopBar({ title, onLeave, progress = null, counter = null }: { title: string; onLeave: () => void; progress?: number | null; counter?: string | null }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 12 }}>
      <Pressable onPress={onLeave} hitSlop={12} accessibilityRole="button" accessibilityLabel="Leave the scene" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="close" size={24} color={c.foreground} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: SANS_B, fontSize: 14, color: c.foreground }}>{title}</Text>
        {progress !== null ? (
          <View style={{ marginTop: 6, height: 3, borderRadius: 1.5, backgroundColor: c.divider, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(progress * 100)}%`, height: 3, backgroundColor: c.ink }} />
          </View>
        ) : null}
      </View>
      {counter ? <Text style={{ fontFamily: SANS_B, fontSize: 14, color: c.mutedForeground }}>{counter}</Text> : null}
    </View>
  );
}

/** Say it again, a 76pt ink pause with its glyph in gel yellow in the exact middle, and Next to skip ahead. */
function Dock({ paused, onPause, onResume, onSkip, onBack }: { paused: boolean; onPause: () => void; onResume: () => void; onSkip: () => void; onBack: () => void }) {
  const { colors: c } = useTheme();
  const tap = (fn: () => void) => () => { Haptics.selectionAsync().catch(() => {}); fn(); };
  const pill = { height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: c.border, alignItems: 'center' as const, justifyContent: 'center' as const, flexDirection: 'row' as const, gap: 6 };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingTop: 6, paddingBottom: 10 }}>
      {/* Three equal columns, so the pause sits on the centre line whatever the words beside it weigh. */}
      <View style={{ flex: 1, alignItems: 'flex-start' }}>
        <Pressable onPress={tap(onBack)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Say it again" style={[pill, { paddingHorizontal: 18 }]}>
          <Ionicons name="refresh-outline" size={18} color={c.foreground} />
          <Text style={{ fontFamily: SANS_B, fontSize: 14, color: c.foreground }}>Again</Text>
        </Pressable>
      </View>
      <Pressable onPress={tap(paused ? onResume : onPause)} accessibilityRole="button" accessibilityLabel={paused ? 'Resume' : 'Pause'}
        style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={paused ? 'play' : 'pause'} size={28} color={c.yellow} style={paused ? { marginLeft: 3 } : undefined} />
      </Pressable>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Pressable onPress={tap(onSkip)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Skip to the next line" style={[pill, { paddingHorizontal: 18 }]}>
          <Text style={{ fontFamily: SANS_B, fontSize: 14, color: c.foreground }}>Next</Text>
          <Ionicons name="chevron-forward" size={16} color={c.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

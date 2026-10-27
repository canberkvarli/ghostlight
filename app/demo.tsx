import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { GhostLight } from '../src/components/GhostLight';
import { PartnerScene } from '../src/components/PartnerScene';
import { StageDirection } from '../src/components/StageDirection';
import { PaperCard } from '../src/components/PaperCard';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useGuided, useRehearsalScene } from '../src/hooks/useScenePartner';
import { getRehearsalScene, type GuidedScene } from '../src/api/rehearsal';
import type { ScenePayload, Voice } from '../src/rehearsal/contract';
import { sameCharacter } from '../src/rehearsal/contract';
import { playSample, primeSample, stopSample } from '../src/rehearsal/native/sample';
import { KEY_WORDS, firstScenes, markDemoSeen } from '../src/lib/demo';
import { useSession } from '../src/lib/useSession';
import { track } from '../src/lib/analytics';
import { useTheme } from '../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const CAP = 'BricolageGrotesque_700Bold';
const MONO = 'CourierPrime_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';
const TILTS = [-0.5, 0.4, -0.3];
const OFFERED = 3;

type Step = 1 | 2 | 3;

/**
 * The first scenes. What a stranger meets at the stage door: three questions,
 * one a screen, and the screen never scrolls. A key: three cards, a fight, a
 * flirt, a confession. Your part: two tiles, each with that part's first line,
 * so the choice is made by reading. The voice opposite: three, each with a
 * hear icon, the first already chosen, and Begin at the foot. Three taps to
 * the first line.
 *
 * Everything is pulled down ahead of the tap. The three scenes come in with
 * the cards; every voice's sample for every part is primed into the cache
 * while the key is being chosen, so hear plays at once and Begin has nothing
 * to wait for. The rule at the top fills a third a step; back goes a step and
 * keeps what was picked; "not tonight" drops you on the curtain.
 *
 * `key` opens that scene on arrival; `after` is how many of the three this
 * phone has run on this visit, so the curtain call that follows knows which
 * one it is.
 */
export default function Demo() {
  const router = useRouter();
  const qc = useQueryClient();
  const { key: keyParam, after } = useLocalSearchParams<{ key?: string; after?: string }>();
  const { colors: c } = useTheme();
  const { tiltX, tiltY } = useStageMotion();
  const { isAuthenticated, session } = useSession();
  // Nothing is asked before the phone has a session: on a first launch this
  // room is up before the anonymous one is minted, and a question asked
  // then is answered with a locked door.
  const guided = useGuided(Boolean(session));
  // A server that lists no scenes named one part; the scene itself names both.
  const lone = guided.data && !guided.data.scenes?.length ? guided.data.scene_id : null;
  const loneScene = useRehearsalScene(session ? lone : null);
  const scenes = useMemo(() => firstScenes(guided.data, loneScene.data), [guided.data, loneScene.data]);
  const done = Number(after ?? '0') || 0;
  // The front door: nothing to compare before anything has been heard. The
  // first scene is chosen for them, the fight, and the other keys are offered
  // on the curtain call. The three cards remain for the Scene room's visit.
  // Every way in without a chosen scene opens on the promise: the three
  // cards are gone from the flow, and the other keys wait on the curtain call.
  const front = !keyParam;

  // The front door is for strangers. Signed in here (the lamp at the top, or
  // a sign-in that came back to this screen), the room is Search, and the
  // steps are not left underneath it to come back to.
  useFocusEffect(useCallback(() => {
    if (!isAuthenticated || keyParam || after) return;
    try { router.dismissAll(); } catch { /* the steps are the root */ }
    router.replace('/search');
  }, [isAuthenticated, keyParam, after, router]));

  const [step, setStep] = useState<Step>(1);
  const [scene, setScene] = useState<GuidedScene | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [voice, setVoice] = useState<string | null>(null);
  const [hearing, setHearing] = useState<{ id: string; state: 'waiting' | 'sounding' } | null>(null);
  const payload = useRehearsalScene(scene?.scene_id ?? null);

  useEffect(() => { void markDemoSeen(); track('demo_shown', { after: done }); }, [done]);
  useEffect(() => {
    if (!keyParam || scene) return;
    const s = scenes.find(x => x.key === keyParam);
    if (s) { setScene(s); setStep(2); }
  }, [keyParam, scenes, scene]);
  useEffect(() => () => stopSample(), []);

  // Ahead of the tap: the three scenes, then every voice's sample for every part.
  useEffect(() => {
    if (!session || !scenes.length) return;
    let gone = false;
    (async () => {
      for (const s of scenes) {
        try {
          const p = await qc.fetchQuery({ queryKey: ['rehearsal-scene', s.scene_id], queryFn: ({ signal }) => getRehearsalScene(s.scene_id, signal), staleTime: 60_000 });
          if (gone) return;
          for (const part of s.characters) {
            const other = s.characters.find(ch => !sameCharacter(ch.name, part.name));
            if (!other) continue;
            const line = firstLineOf(p, other.name, other.first_line);
            for (const v of offeredVoices(p, part.name, other.name)) void primeSample(s.scene_id, line, v.id);
          }
        } catch { /* the tap asks the network instead */ }
      }
    })();
    return () => { gone = true; };
  }, [session, scenes, qc]);

  const other = scene && me ? scene.characters.find(ch => !sameCharacter(ch.name, me)) ?? null : null;
  const voices: Voice[] = useMemo(() => (payload.data && me && other ? offeredVoices(payload.data, me, other.name) : []), [payload.data, me, other]);
  const chosen = voice ?? voices[0]?.id ?? null;

  const notTonight = () => {
    Haptics.selectionAsync().catch(() => {});
    track('demo_skipped', { at: step === 1 ? 'cards' : 'card', after: done });
    stopSample();
    router.replace('/search');
  };
  const back = () => {
    Haptics.selectionAsync().catch(() => {});
    stopSample(); setHearing(null);
    setStep(s => (s > 1 ? ((s - 1) as Step) : s));
  };
  const pickScene = (s: GuidedScene) => {
    Haptics.selectionAsync().catch(() => {});
    track('demo_card', { key: s.key });
    if (scene?.key !== s.key) { setScene(s); setMe(null); setVoice(null); }
    // A scene for one part has nothing to ask on the second step.
    if (s.characters.length === 1) { setMe(s.characters[0].name); setStep(3); } else setStep(2);
  };
  const pickPart = (name: string) => {
    if (!scene) return;
    Haptics.selectionAsync().catch(() => {});
    track('demo_part', { key: scene.key, character: name });
    if (me !== name) { setMe(name); setVoice(null); }
    setStep(3);
  };
  const hear = (v: Voice) => {
    if (!scene || !other) return;
    Haptics.selectionAsync().catch(() => {});
    if (hearing?.id === v.id) { stopSample(); setHearing(null); return; }
    track('demo_heard', { key: scene.key, voice: v.id });
    const line = firstLineOf(payload.data, other.name, other.first_line);
    void playSample(scene.scene_id, line, v.id, st => setHearing(st === 'done' ? null : { id: v.id, state: st }));
  };
  const begin = () => {
    if (!scene || !me) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    track('demo_begun', { key: scene.key, character: me, after: done });
    stopSample();
    const cast = other && chosen ? { [other.name]: chosen } : {};
    router.push({
      pathname: '/play/[id]',
      params: { id: String(scene.scene_id), from: 'demo', guided: 'pick', cast: me, voices: JSON.stringify(cast), demo: String(done + 1), key: scene.key },
    });
  };

  const beginFront = () => {
    const s = scenes.find(x => x.key === 'fight') ?? scenes[0];
    if (s) pickScene(s);
  };
  const headline: Record<Step, [string, string]> = {
    1: done ? ['Another, in a', 'different key?'] : front ? ['Your scene', 'partner.'] : ['Run a scene.', 'Right now.'],
    2: ['Which one', 'are you?'],
    3: [`Who plays`, `${other?.name.toLowerCase() ?? 'opposite'}?`],
  };
  const [big, lit] = headline[step];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* The bar of the house: a way back or a way in on the left, the lamp, the way past on the right. */}
        <View style={{ height: 48, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {step > 1 ? (
            <Pressable onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back a step" style={{ width: 36, height: 36, alignItems: 'flex-start', justifyContent: 'center' }}>
              <Ionicons name="arrow-back" size={22} color={c.foreground} />
            </Pressable>
          ) : isAuthenticated ? <View style={{ width: 44 }} /> : (
            <Pressable onPress={() => { stopSample(); router.push({ pathname: '/auth', params: { next: '/search' } }); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Sign in">
              <Text style={{ fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.6, color: c.mutedForeground }}>sign in</Text>
            </Pressable>
          )}
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }}>
            <GhostLight size={18} />
          </View>
          <Pressable onPress={notTonight} hitSlop={10} accessibilityRole="button" accessibilityLabel="Not tonight">
            <Text style={{ fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.6, color: c.mutedForeground }}>not tonight</Text>
          </Pressable>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 22 }}>
          <Animated.View key={`h${step}`} entering={FadeIn.duration(280)} exiting={FadeOut.duration(140)}>
            <Text numberOfLines={2} style={{ fontFamily: SERIF, fontSize: 42, lineHeight: 48, letterSpacing: -0.8, color: c.foreground }}>
              {big}{'\n'}
              <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{lit}</Text>
            </Text>
          </Animated.View>
          <Steps stage={step} front={front} />

          {step === 1 && front ? (
            <Animated.View key="s0" entering={FadeIn.duration(280)} exiting={FadeOut.duration(140)} style={{ flex: 1 }}>
              <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 24 }}>
                <PartnerScene />
                <Text style={{ marginTop: 22, textAlign: 'center', fontFamily: SANS, fontSize: 15.5, lineHeight: 23, color: c.mutedForeground }}>
                  It reads the other part out loud, listens to yours, and comes in on your last word. Two minutes, and you will hear it.
                </Text>
              </View>
              {guided.isError && !scenes.length ? (
                <View style={{ alignItems: 'center', marginBottom: 8 }}>
                  <StageDirection style={{ textAlign: 'center' }}>(the house is dark. check the signal.)</StageDirection>
                  <PrimaryPill label="Try again" variant="outline" onPress={() => void guided.refetch()} style={{ marginTop: 14 }} />
                </View>
              ) : scenes.length ? (
                <PrimaryPill label="Continue" onPress={beginFront} height={48} haptic="medium" style={{ marginBottom: 12, alignSelf: 'center', paddingHorizontal: 16 }} />
              ) : (
                <View style={{ height: 56, marginBottom: 8, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.mutedForeground} /></View>
              )}
            </Animated.View>
          ) : step === 1 ? (
            <Animated.View key="s1" entering={FadeIn.duration(280)} exiting={FadeOut.duration(140)} style={{ flex: 1 }}>
              {guided.isPending && !guided.isError && !scenes.length ? (
                <View style={{ marginTop: 60, alignItems: 'center' }}>
                  <ActivityIndicator color={c.mutedForeground} />
                  <StageDirection style={{ marginTop: 14 }}>(raising the house lights.)</StageDirection>
                </View>
              ) : guided.isError && !scenes.length ? (
                <View style={{ marginTop: 60, alignItems: 'center' }}>
                  <StageDirection style={{ textAlign: 'center' }}>(the house is dark. check the signal.)</StageDirection>
                  <PrimaryPill label="Try again" variant="outline" onPress={() => void guided.refetch()} style={{ marginTop: 18 }} />
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 22, paddingBottom: 24, gap: 14 }}>
                  {scenes.map((s, i) => {
                    const words = KEY_WORDS[s.key] ?? { eyebrow: s.title.toUpperCase(), tone: s.hook ?? '' };
                    return (
                      <Pressable key={s.key} onPress={() => pickScene(s)} accessibilityRole="button" accessibilityLabel={`${s.title}. ${s.hook ?? ''}`}>
                        <PaperCard rotate={TILTS[i % TILTS.length]} shadow={6} style={{ padding: 18 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ fontFamily: CAP, fontSize: 9.5, letterSpacing: 1.6, color: c.accentText }}>{words.eyebrow}</Text>
                            <Ionicons name="arrow-forward" size={15} color={c.paperMuted} />
                          </View>
                          <Text style={{ marginTop: 8, fontFamily: SERIF, fontSize: 25, lineHeight: 29, letterSpacing: -0.3, color: c.paperInk }}>{s.hook ?? s.title}</Text>
                          <Text style={{ marginTop: 8, fontFamily: MONO, fontSize: 12.5, letterSpacing: 1.2, textTransform: 'uppercase', color: c.paperMuted }}>{s.characters.map(ch => ch.name).join('  ·  ')}</Text>
                        </PaperCard>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </Animated.View>
          ) : step === 2 && scene ? (
            <Animated.View key="s2" entering={FadeIn.duration(280)} exiting={FadeOut.duration(140)} style={{ flex: 1, paddingTop: 22 }}>
              <View style={{ gap: 10 }}>
                {scene.characters.map((ch) => {
                  const line = payload.data ? payload.data.lines[firstLineOf(payload.data, ch.name, ch.first_line)]?.text ?? '' : '';
                  const on = me !== null && sameCharacter(ch.name, me);
                  return (
                    <Pressable key={ch.name} onPress={() => pickPart(ch.name)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`I am ${ch.name}`}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderColor: on ? c.accentText : c.border, backgroundColor: on ? c.panel : 'transparent', opacity: pressed ? 0.75 : 1 })}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontFamily: SANS_B, fontSize: 16, letterSpacing: 0.6, color: c.foreground }}>{ch.name}</Text>
                        {line ? (
                          <Text numberOfLines={2} style={{ marginTop: 4, fontFamily: MONO, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground }}>{line}</Text>
                        ) : (
                          <ActivityIndicator size="small" color={c.mutedForeground} style={{ marginTop: 6, alignSelf: 'flex-start' }} />
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={c.chevron} />
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>
          ) : step === 3 && scene && me ? (
            <Animated.View key="s3" entering={FadeIn.duration(280)} exiting={FadeOut.duration(140)} style={{ flex: 1, paddingTop: 22 }}>
              {!voices.length ? (
                <ActivityIndicator color={c.mutedForeground} style={{ marginTop: 30 }} />
              ) : (
                <View style={{ gap: 10 }}>
                  {voices.map(v => {
                    const on = chosen === v.id;
                    const busy = hearing?.id === v.id;
                    return (
                      <Pressable key={v.id} onPress={() => { Haptics.selectionAsync().catch(() => {}); setVoice(v.id); track('demo_voice', { key: scene.key, voice: v.id }); }}
                        accessibilityRole="button" accessibilityState={{ selected: on }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1.5, borderColor: on ? c.accentText : c.border, backgroundColor: on ? c.panel : 'transparent' }}>
                        <Pressable onPress={() => hear(v)} hitSlop={10} accessibilityRole="button" accessibilityLabel={busy ? `Stop ${nameOf(v)}` : `Hear ${nameOf(v)}`}
                          style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: busy ? c.accentText : c.foreground, alignItems: 'center', justifyContent: 'center' }}>
                          {busy && hearing?.state === 'waiting' ? (
                            <ActivityIndicator size="small" color={c.accentText} />
                          ) : (
                            <Ionicons name={busy ? 'stop' : 'play'} size={18} color={busy ? c.accentText : c.foreground} style={busy ? undefined : { marginLeft: 2 }} />
                          )}
                        </Pressable>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ fontFamily: SANS_B, fontSize: 17, color: c.foreground }}>{nameOf(v)}</Text>
                          {asideOf(v) ? <Text numberOfLines={2} style={{ marginTop: 2, fontFamily: SANS, fontSize: 13, lineHeight: 17, color: c.mutedForeground }}>{asideOf(v)}</Text> : null}
                        </View>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: on ? c.yellow : 'transparent', borderWidth: on ? 0 : 1, borderColor: c.chevron }} />
                      </Pressable>
                    );
                  })}
                  <StageDirection style={{ marginTop: 8, textAlign: 'center' }}>(tap the circle to hear the first line.)</StageDirection>
                </View>
              )}
              <View style={{ flex: 1 }} />
              <PrimaryPill label="Begin" onPress={begin} disabled={!chosen && Boolean(other)} height={56} block haptic="medium" style={{ marginBottom: 8 }} />
            </Animated.View>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

/** The rule and the caption: which of the three choices is next. */
function Steps({ stage, front = false }: { stage: Step; front?: boolean }) {
  const { colors: c } = useTheme();
  const lines = [front ? 'two minutes. nothing to set up.' : 'pick a key.', 'pick your part.', 'pick a voice. then begin.'];
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3].map(n => (
          <View key={n} style={{ flex: 1, height: 3, borderRadius: 1.5, backgroundColor: n <= stage ? c.accentText : c.divider }} />
        ))}
      </View>
      <Animated.View key={stage} entering={FadeIn.duration(220)} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontFamily: SANS_B, fontSize: 11, letterSpacing: 1.4, color: c.accentText }}>{stage} OF 3</Text>
        <StageDirection numberOfLines={1} style={{ flex: 1 }}>({lines[stage - 1]})</StageDirection>
      </Animated.View>
    </View>
  );
}

/** The index of a part's first line: the server's, or the first of theirs in the scene. */
function firstLineOf(p: ScenePayload | undefined, name: string, hint: number | null): number {
  if (hint !== null && hint !== undefined) return hint;
  return p?.lines.find(l => sameCharacter(l.character, name))?.index ?? 0;
}

/** Three voices for the part opposite `me`: the one the server would cast, then the next two. */
function offeredVoices(p: ScenePayload, me: string, other: string): Voice[] {
  const all = p.voices ?? [];
  if (!all.length) return [];
  const cast = Object.entries(p.defaults?.[me] ?? {}).find(([k]) => sameCharacter(k, other))?.[1]
    ?? Object.values(p.defaults ?? {}).map(d => Object.entries(d).find(([k]) => sameCharacter(k, other))?.[1]).find(Boolean);
  const first = all.find(v => v.id === cast) ?? all[0];
  return [first, ...all.filter(v => v.id !== first.id)].slice(0, OFFERED);
}

/** A voice's name: the server's label up to its first dot. */
function nameOf(v: Voice): string { return v.label.split(/\s*[·.]\s*/)[0] || v.id; }
/** What the voice is like, after the dot. */
function asideOf(v: Voice): string { const i = v.label.search(/\s*[·]\s*/); return i >= 0 ? v.label.slice(i).replace(/^\s*[·]\s*/, '') : ''; }

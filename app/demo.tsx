import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';

import { StageBackdrop } from '../src/components/StageBackdrop';
import { GhostLight } from '../src/components/GhostLight';
import { StageDirection } from '../src/components/StageDirection';
import { PaperCard } from '../src/components/PaperCard';
import { PrimaryPill } from '../src/components/PrimaryPill';
import { useStageMotion } from '../src/hooks/useStageMotion';
import { useGuided, useRehearsalScene } from '../src/hooks/useScenePartner';
import type { GuidedScene } from '../src/api/rehearsal';
import type { Voice } from '../src/rehearsal/contract';
import { sameCharacter } from '../src/rehearsal/contract';
import { playSample, stopSample } from '../src/rehearsal/native/sample';
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

/**
 * The first scenes. What a stranger meets at the stage door: three cards, one
 * a key, a fight, a flirt, a confession. A card opens in place to its two
 * parts, a line each on who they are, and you pick which is you; under
 * that, three voices for whoever is left, each with a hear icon that plays
 * that voice's first line from this very scene, and Begin. Under a minute
 * to the first line. "Not tonight" at the top drops you on the curtain, and
 * the cards stay a tap away on the scene tab.
 *
 * `key` opens that card on arrival; `after` is how many of the three this
 * phone has run on this visit, so the curtain call that follows knows which
 * one it is.
 */
export default function Demo() {
  const router = useRouter();
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
  const [open, setOpen] = useState<string | null>(keyParam ?? null);
  const done = Number(after ?? '0') || 0;
  // Where the stranger is: a key, a part, a voice. The rule at the top fills
  // a third at a time and the caption under the headline says what is next,
  // so the demo is its own onboarding and no page has to come before it.
  const [stage, setStage] = useState<1 | 2 | 3>(keyParam ? 2 : 1);
  useEffect(() => { if (open === null) setStage(1); }, [open]);

  useEffect(() => { void markDemoSeen(); track('demo_shown', { after: done }); }, [done]);
  useEffect(() => { if (keyParam && scenes.some(s => s.key === keyParam)) setOpen(keyParam); }, [keyParam, scenes]);

  const notTonight = () => {
    Haptics.selectionAsync().catch(() => {});
    track('demo_skipped', { at: open ? 'card' : 'cards', after: done });
    stopSample();
    router.replace(isAuthenticated ? '/search' : '/curtain');
  };

  const begin = (scene: GuidedScene, character: string, voices: Record<string, string>) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    track('demo_begun', { key: scene.key, character, after: done });
    stopSample();
    router.push({
      pathname: '/play/[id]',
      params: { id: String(scene.scene_id), from: 'demo', guided: 'pick', cast: character, voices: JSON.stringify(voices), demo: String(done + 1), key: scene.key },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 0, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* The bar of the house, the same as the curtain's: a way in on the left, the lamp, the way past on the right. */}
        <View style={{ height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {isAuthenticated ? <View style={{ width: 44 }} /> : (
            <Pressable onPress={() => { stopSample(); router.push('/auth'); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Sign in">
              <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, letterSpacing: 0.6, color: c.mutedForeground }}>sign in</Text>
            </Pressable>
          )}
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, alignItems: 'center' }}>
            <GhostLight size={18} />
          </View>
          <Pressable onPress={notTonight} hitSlop={10} accessibilityRole="button" accessibilityLabel="Not tonight">
            <Text style={{ fontFamily: 'CourierPrime_400Regular_Italic', fontSize: 13, letterSpacing: 0.6, color: c.mutedForeground }}>not tonight</Text>
          </Pressable>
        </View>

          <Text style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 50, letterSpacing: -0.8, color: c.foreground }}>
            {done ? 'Another, in a' : 'Run a scene.'}{'\n'}
            <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>{done ? 'different key?' : 'Right now.'}</Text>
          </Text>
          <Steps stage={stage} />

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
            <View style={{ marginTop: 26, gap: 16 }}>
              {scenes.map((s, i) => (
                <Card
                  key={s.key}
                  scene={s}
                  tilt={TILTS[i % TILTS.length]}
                  open={open === s.key}
                  onOpen={() => { Haptics.selectionAsync().catch(() => {}); stopSample(); setOpen(open === s.key ? null : s.key); if (open !== s.key) { setStage(2); track('demo_card', { key: s.key }); } }}
                  onStage={setStage}
                  onBegin={(ch, v) => begin(s, ch, v)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

/** One scene as a card: the key, the hook, the two names; open, the parts and the voices. */
/** The rule and the caption: which of the three choices is next. */
function Steps({ stage }: { stage: 1 | 2 | 3 }) {
  const { colors: c } = useTheme();
  const lines = ['pick a key.', 'pick your part.', 'who plays opposite? then begin.'];
  return (
    <View style={{ marginTop: 14 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3].map(n => (
          <View key={n} style={{ flex: 1, height: 3, borderRadius: 1.5, backgroundColor: n <= stage ? c.accentText : c.divider }} />
        ))}
      </View>
      <Animated.View key={stage} entering={FadeIn.duration(220)} style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontFamily: SANS_B, fontSize: 11, letterSpacing: 1.4, color: c.accentText }}>{stage} OF 3</Text>
        <StageDirection numberOfLines={2} style={{ flex: 1 }}>({lines[stage - 1]})</StageDirection>
      </Animated.View>
    </View>
  );
}

function Card({ scene, tilt, open, onOpen, onStage, onBegin }: {
  scene: GuidedScene; tilt: number; open: boolean; onOpen: () => void; onStage: (s: 2 | 3) => void; onBegin: (character: string, voices: Record<string, string>) => void;
}) {
  const { colors: c } = useTheme();
  const words = KEY_WORDS[scene.key] ?? { eyebrow: scene.title.toUpperCase(), tone: scene.hook ?? '' };
  const names = scene.characters.map(ch => ch.name);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${scene.title}. ${scene.hook ?? ''}`}>
      <PaperCard rotate={open ? 0 : tilt} shadow={open ? 10 : 6} style={{ padding: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: CAP, fontSize: 9.5, letterSpacing: 1.6, color: c.accentText }}>{words.eyebrow}</Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={c.paperMuted} />
        </View>
        <Text style={{ marginTop: 8, fontFamily: SERIF, fontSize: 26, lineHeight: 30, letterSpacing: -0.3, color: c.paperInk }}>{scene.hook ?? scene.title}</Text>
        <Text style={{ marginTop: 8, fontFamily: MONO, fontSize: 12.5, letterSpacing: 1.2, textTransform: 'uppercase', color: c.paperMuted }}>{names.join('  ·  ')}</Text>
        {open ? <Inside scene={scene} onStage={onStage} onBegin={onBegin} /> : null}
      </PaperCard>
    </Pressable>
  );
}

/** The open card: who you are, who plays the other, and Begin. */
function Inside({ scene, onStage, onBegin }: { scene: GuidedScene; onStage: (s: 2 | 3) => void; onBegin: (character: string, voices: Record<string, string>) => void }) {
  const { colors: c } = useTheme();
  const payload = useRehearsalScene(scene.scene_id);
  const [me, setMe] = useState<string | null>(null);
  // One part only (the cast not yet known, or a scene for one): it is yours.
  useEffect(() => { if (scene.characters.length === 1) setMe(scene.characters[0].name); }, [scene.characters]);
  const [voice, setVoice] = useState<string | null>(null);
  const [hearing, setHearing] = useState<{ id: string; state: 'waiting' | 'sounding' } | null>(null);
  const other = me ? scene.characters.find(ch => !sameCharacter(ch.name, me)) ?? null : null;

  // Three voices for the other part: the one the server would cast first, then two more.
  const voices: Voice[] = useMemo(() => {
    const all = payload.data?.voices ?? [];
    if (!other || !all.length) return [];
    const cast = Object.entries(payload.data?.defaults?.[me ?? ''] ?? {}).find(([k]) => sameCharacter(k, other.name))?.[1]
      ?? Object.values(payload.data?.defaults ?? {}).map(d => Object.entries(d).find(([k]) => sameCharacter(k, other.name))?.[1]).find(Boolean);
    const first = all.find(v => v.id === cast) ?? all[0];
    return [first, ...all.filter(v => v.id !== first.id)].slice(0, 3);
  }, [payload.data, me, other]);
  const chosen = voice ?? voices[0]?.id ?? null;

  useEffect(() => () => stopSample(), []);
  useEffect(() => { onStage(me ? 3 : 2); }, [me, onStage]);

  const hear = (v: Voice) => {
    Haptics.selectionAsync().catch(() => {});
    if (hearing?.id === v.id) { stopSample(); setHearing(null); return; }
    const line = other?.first_line ?? payload.data?.lines.find(l => other && sameCharacter(l.character, other.name))?.index ?? 0;
    track('demo_heard', { key: scene.key, voice: v.id });
    void playSample(scene.scene_id, line, v.id, st => setHearing(st === 'done' ? null : { id: v.id, state: st }));
  };

  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: c.paperRule }}>
      <Text style={{ marginTop: 16, fontFamily: MONO_I, fontSize: 12.5, letterSpacing: 0.6, color: c.paperMuted }}>(who are you?)</Text>
      <View style={{ marginTop: 10, gap: 8 }}>
        {scene.characters.map(ch => {
          const on = me !== null && sameCharacter(ch.name, me);
          return (
            <Pressable key={ch.name} onPress={() => { Haptics.selectionAsync().catch(() => {}); setMe(ch.name); setVoice(null); stopSample(); setHearing(null); track('demo_part', { key: scene.key, character: ch.name }); }}
              accessibilityRole="button" accessibilityState={{ selected: on }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: on ? c.ink : c.paperRule, backgroundColor: on ? c.yellow : 'transparent' }}>
              <Text style={{ fontFamily: SANS_B, fontSize: 15, letterSpacing: 0.4, color: on ? c.ink : c.paperInk }}>{ch.name}</Text>
              {on ? <Ionicons name="checkmark" size={16} color={c.ink} /> : null}
            </Pressable>
          );
        })}
      </View>

      {me && other ? (
        <Animated.View entering={FadeIn.duration(220)}>
          <Text style={{ marginTop: 18, fontFamily: MONO_I, fontSize: 12.5, letterSpacing: 0.6, color: c.paperMuted }}>(who plays {other.name.toLowerCase()}?)</Text>
          {payload.isLoading && !voices.length ? (
            <ActivityIndicator color={c.paperMuted} style={{ marginTop: 14 }} />
          ) : (
            <View style={{ marginTop: 10, gap: 8 }}>
              {voices.map(v => {
                const on = chosen === v.id;
                const busy = hearing?.id === v.id;
                return (
                  <Pressable key={v.id} onPress={() => { Haptics.selectionAsync().catch(() => {}); setVoice(v.id); track('demo_voice', { key: scene.key, voice: v.id }); }}
                    accessibilityRole="button" accessibilityState={{ selected: on }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5, borderColor: on ? c.ink : c.paperRule, backgroundColor: on ? c.yellow : 'transparent' }}>
                    <Pressable onPress={() => hear(v)} hitSlop={10} accessibilityRole="button" accessibilityLabel={busy ? `Stop ${nameOf(v)}` : `Hear ${nameOf(v)}`}
                      style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: busy ? c.accentText : on ? c.ink : c.paperRule, alignItems: 'center', justifyContent: 'center' }}>
                      {busy && hearing?.state === 'waiting' ? (
                        <ActivityIndicator size="small" color={c.accentText} />
                      ) : (
                        <Ionicons name={busy ? 'stop' : 'volume-medium-outline'} size={16} color={busy ? c.accentText : c.ink} />
                      )}
                    </Pressable>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontFamily: SANS_B, fontSize: 15, color: on ? c.ink : c.paperInk }}>{nameOf(v)}</Text>
                      {asideOf(v) ? <Text numberOfLines={2} style={{ marginTop: 1, fontFamily: SANS, fontSize: 12.5, lineHeight: 16, color: on ? c.ink : c.paperMuted }}>{asideOf(v)}</Text> : null}
                    </View>
                    {on ? <Ionicons name="checkmark" size={18} color={c.ink} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
          <PrimaryPill
            label="Begin"
            onPress={() => { if (me && chosen) onBegin(me, { [other.name]: chosen }); }}
            disabled={!chosen}
            height={54}
            block
            haptic="medium"
            style={{ marginTop: 18 }}
          />
        </Animated.View>
      ) : me ? (
        <PrimaryPill label="Begin" onPress={() => onBegin(me, {})} height={54} block haptic="medium" style={{ marginTop: 18 }} />
      ) : null}
    </Animated.View>
  );
}

/** A voice's name: the server's label up to its first dot. */
function nameOf(v: Voice): string { return v.label.split(/\s*[·.]\s*/)[0] || v.id; }
/** What the voice is like, after the dot. */
function asideOf(v: Voice): string { const i = v.label.search(/\s*[·]\s*/); return i >= 0 ? v.label.slice(i).replace(/^\s*[·]\s*/, '') : ''; }

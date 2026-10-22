import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { StageBackdrop } from '../../src/components/StageBackdrop';
import { StageDirection } from '../../src/components/StageDirection';
import { BackHeader } from '../../src/components/BackHeader';
import { PrimaryPill } from '../../src/components/PrimaryPill';
import { PaperCard } from '../../src/components/PaperCard';
import { Sketch } from '../../src/components/Sketches';
import { useStageMotion } from '../../src/hooks/useStageMotion';
import { useEntitlement } from '../../src/hooks/useEntitlement';
import { useRunStats, useScenes, useScript, useScripts } from '../../src/hooks/useScenePartner';
import type { SceneSummary, ScriptSummary } from '../../src/api/rehearsal';
import { useGoBack } from '../../src/lib/nav';
import { useSession } from '../../src/lib/useSession';
import { useTheme } from '../../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const MONO = 'CourierPrime_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';
const CAP = 'CourierPrime_700Bold';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';
const TILTS = [-0.5, 0.4, -0.3];

/**
 * Scene partner: your sides first, the library under them. A first run is
 * offered to anyone who has never run one. Anyone with a session (a stranger
 * has one) can run the guided scene and the library; bringing your own sides
 * asks for the account they will live on.
 */
export default function RehearseHub() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const goBack = useGoBack('/search');
  const { tiltX, tiltY } = useStageMotion();
  const { session, isAuthenticated } = useSession();
  // Runs and the library need a session, which every stranger has; your own sides need the account they will live on.
  const ready = Boolean(session);
  const { isPaid } = useEntitlement();
  const { script: openScript } = useLocalSearchParams<{ script?: string }>();
  const scripts = useScripts(isAuthenticated);
  const scenes = useScenes(ready);
  const stats = useRunStats(ready);
  const mine = (scripts.data ?? []).filter(s => !s.is_sample);
  const library = (scenes.data ?? []).filter(s => s.is_library);
  const neverRun = stats.data ? stats.data.runs === 0 : false;

  // A script still being read: ask again every few seconds until it settles.
  const reading = mine.some(s => s.processing_status !== 'completed' && s.processing_status !== 'failed');
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(() => void scripts.refetch(), 3000);
    return () => clearInterval(t);
  }, [reading, scripts]);

  const add = () => { Haptics.selectionAsync().catch(() => {}); router.push('/rehearse/add'); };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <BackHeader label="Search" onPress={goBack} right={isAuthenticated ? (
          <Pressable onPress={add} hitSlop={12} accessibilityRole="button" accessibilityLabel="Add sides" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={24} color={c.mutedForeground} />
          </Pressable>
        ) : undefined} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 110 }}>
          <View style={{ paddingTop: 8, paddingHorizontal: 2 }}>
            <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 52, letterSpacing: -0.8, color: c.foreground }}>
              Scene <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>partner.</Text>
            </Text>
            <StageDirection numberOfLines={2} style={{ marginTop: 6 }}>
              {isAuthenticated ? '(it reads the other parts. you read yours.)' : '(a partner who already knows the play.)'}
            </StageDirection>
          </View>

          {!ready ? (
            <View style={{ marginTop: 40, alignItems: 'center' }}>
              <Sketch name="masks" size={96} stroke={c.mutedForeground} accent={c.yellow} />
              <StageDirection style={{ marginTop: 22 }}>(the house is dark. check your connection.)</StageDirection>
            </View>
          ) : (
            <>
              {neverRun ? (
                <Animated.View entering={FadeIn.duration(260)} style={{ marginTop: 22 }}>
                  <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/rehearse/[id]', params: { id: 'guided', from: 'guided' } }); }} accessibilityRole="button">
                    {({ pressed }) => (
                      <PaperCard rotate={-0.4} shadow={6} style={{ padding: 18 }}>
                        <Text style={{ fontFamily: CAP, fontSize: 9, letterSpacing: 1.3, color: c.paperMuted }}>FIRST, TRY IT</Text>
                        <Text style={{ marginTop: 6, fontFamily: SERIF, fontSize: 26, lineHeight: 30, color: c.paperInk }}>Run a scene with a partner.</Text>
                        <Text style={{ marginTop: 6, fontFamily: MONO_I, fontSize: 13, lineHeight: 19, color: c.paperMuted }}>(two minutes. nothing to set up. the part is cast.)</Text>
                      </PaperCard>
                    )}
                  </Pressable>
                </Animated.View>
              ) : null}

              <Shelf title="Your sides" aside={mine.length ? `(${mine.length}.)` : undefined}>
                {!isAuthenticated ? (
                  <View style={{ paddingVertical: 4 }}>
                    <StageDirection numberOfLines={3}>(a pdf, a word file or the text itself. sign in and your sides stay with you.)</StageDirection>
                    <PrimaryPill label="Sign in" onPress={() => router.push('/auth')} style={{ marginTop: 14, alignSelf: 'flex-start' }} />
                  </View>
                ) : scripts.isLoading ? (
                  <StageDirection style={{ paddingVertical: 6 }}>(gathering your scripts…)</StageDirection>
                ) : mine.length === 0 ? (
                  <View style={{ paddingVertical: 4 }}>
                    <StageDirection numberOfLines={3}>{'(nothing here yet. a pdf, a word file or the text itself:\nit finds the cast and splits the scenes.)'}</StageDirection>
                    <PrimaryPill label="Add sides" onPress={add} style={{ marginTop: 14, alignSelf: 'flex-start' }} />
                  </View>
                ) : (
                  <Animated.View layout={LinearTransition.duration(240)}>
                    {mine.map((s, i) => <ScriptRow key={s.id} script={s} tilt={TILTS[i % 3]} startOpen={openScript === String(s.id)} />)}
                    <PrimaryPill label="Add sides" variant="outline" onPress={add} style={{ marginTop: 14, alignSelf: 'flex-start' }} />
                  </Animated.View>
                )}
              </Shelf>

              <Shelf title="The library" aside={library.length ? `(${library.length} scenes.)` : undefined}>
                {scenes.isLoading ? (
                  <StageDirection style={{ paddingVertical: 6 }}>(raising the house lights…)</StageDirection>
                ) : scenes.isError ? (
                  <StageDirection style={{ paddingVertical: 6 }}>(the library is dark. pull to try again.)</StageDirection>
                ) : (
                  library.map((s, i) => <SceneRow key={s.id} scene={s} tilt={TILTS[(i + 1) % 3]} locked={!isPaid && !s.is_free_library} />)
                )}
              </Shelf>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Shelf({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginTop: 30 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 12, paddingHorizontal: 2 }}>
        <Text style={{ fontFamily: SANS_B, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: c.mutedForeground }}>{title}</Text>
        {aside ? <StageDirection>{aside}</StageDirection> : null}
      </View>
      {children}
    </View>
  );
}

/** One of the actor's scripts. Tap: one scene goes straight to the sheet; more open under it. */
function ScriptRow({ script, tilt, startOpen }: { script: ScriptSummary; tilt: number; startOpen: boolean }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const detail = useScript(script.id, open);
  const ready = script.processing_status === 'completed';
  const broke = script.processing_status === 'failed';
  const cast = script.characters.map(ch => ch.name).filter(Boolean).slice(0, 4).join(', ');
  const go = (sceneId: number) => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/rehearse/[id]', params: { id: String(sceneId), from: 'script' } }); };
  useEffect(() => {
    if (open && detail.data && detail.data.scenes.length === 1 && !startOpen) go(detail.data.scenes[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, detail.data]);
  return (
    <View style={{ marginBottom: 12 }}>
      <Pressable onPress={() => { if (!ready) return; Haptics.selectionAsync().catch(() => {}); setOpen(o => !o); }} disabled={!ready} accessibilityRole="button">
        {({ pressed }) => (
          <PaperCard rotate={tilt} shadow={4} style={{ padding: 16 }}>
            <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 24, lineHeight: 28, color: c.paperInk }}>{script.title}</Text>
            {script.author ? <Text style={{ marginTop: 2, fontFamily: MONO, fontSize: 12, color: c.paperMuted }}>{script.author}</Text> : null}
            <Text style={{ marginTop: 8, fontFamily: MONO_I, fontSize: 13, color: broke ? c.accentText : c.paperMuted }} numberOfLines={2}>
              {broke ? `(${script.processing_error?.toLowerCase() ?? 'it could not be read.'})`
                : !ready ? '(still reading the pages…)'
                : `(${cast || `${script.num_characters} parts`} · ${script.num_scenes_extracted} ${script.num_scenes_extracted === 1 ? 'scene' : 'scenes'}.)`}
            </Text>
          </PaperCard>
        )}
      </Pressable>
      {open && detail.data && detail.data.scenes.length > 1 ? (
        <Animated.View entering={FadeIn.duration(220)} style={{ paddingLeft: 16, paddingTop: 8, gap: 2 }}>
          {detail.data.scenes.map(sc => (
            <Pressable key={sc.id} onPress={() => go(sc.id)} accessibilityRole="button" style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 6 }}>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: SANS, fontSize: 15, color: c.foreground }}>{sc.title}</Text>
              <Text style={{ fontFamily: MONO, fontSize: 12, color: c.mutedForeground }}>{Math.max(1, Math.round(sc.estimated_duration_seconds / 60))} min</Text>
            </Pressable>
          ))}
        </Animated.View>
      ) : open && detail.isLoading ? (
        <StageDirection style={{ paddingLeft: 16, paddingTop: 8 }}>(opening…)</StageDirection>
      ) : null}
    </View>
  );
}

function SceneRow({ scene, tilt, locked }: { scene: SceneSummary; tilt: number; locked: boolean }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const minutes = Math.max(1, Math.round(scene.estimated_duration_seconds / 60));
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/rehearse/[id]', params: { id: String(scene.id), from: 'library' } }); }}
      accessibilityRole="button" style={{ marginBottom: 12 }}
    >
      {({ pressed }) => (
        <PaperCard rotate={tilt} shadow={4} style={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ flex: 1, fontFamily: MONO, fontSize: 12, color: c.paperMuted }} numberOfLines={1}>{scene.play_title}</Text>
            <Text style={{ fontFamily: CAP, fontSize: 9, letterSpacing: 1.3, color: locked ? c.paperMuted : c.accentText }}>{locked ? 'PREMIUM' : `${minutes} MIN`}</Text>
          </View>
          <Text numberOfLines={2} style={{ marginTop: 4, fontFamily: SERIF, fontSize: 24, lineHeight: 28, color: c.paperInk }}>{scene.title}</Text>
          <Text style={{ marginTop: 8, fontFamily: MONO_I, fontSize: 13, color: c.paperMuted }} numberOfLines={1}>
            ({scene.character_1_name} and {scene.character_2_name}.)
          </Text>
        </PaperCard>
      )}
    </Pressable>
  );
}

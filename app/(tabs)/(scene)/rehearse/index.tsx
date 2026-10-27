import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { StageBackdrop } from '../../../../src/components/StageBackdrop';
import { StageDirection } from '../../../../src/components/StageDirection';
import { PrimaryPill } from '../../../../src/components/PrimaryPill';
import { PaperCard } from '../../../../src/components/PaperCard';
import { GhostLight } from '../../../../src/components/GhostLight';
import { RoomHeader, RoomTitle } from '../../../../src/components/RoomHeader';
import { HowItWorksSheet } from '../../../../src/components/HowItWorksSheet';
import { PartnerScene } from '../../../../src/components/PartnerScene';
import { useTabBarSpace } from '../../../../src/components/TabBar';
import { useRoomScroll } from '../../../../src/lib/barScroll';
import { Sketch } from '../../../../src/components/Sketches';
import { useStageMotion } from '../../../../src/hooks/useStageMotion';
import { useEntitlement } from '../../../../src/hooks/useEntitlement';
import { useDeleteScript, useGuided, useLatestRun, useRunStats, useScenes, useScript, useScripts } from '../../../../src/hooks/useScenePartner';
import { useQueryClient } from '@tanstack/react-query';
import { reorderScripts } from '../../../../src/api/rehearsal';
import { ConfirmSheet } from '../../../../src/components/ConfirmSheet';
import { SortableList } from '../../../../src/components/SortableList';
import { SwipeRow } from '../../../../src/components/SwipeRow';
import { KEY_WORDS, demoDone, firstScenes } from '../../../../src/lib/demo';
import type { LatestRun, SceneSummary, ScriptSummary } from '../../../../src/api/rehearsal';
import { track } from '../../../../src/lib/analytics';
import { useSession } from '../../../../src/lib/useSession';
import { Mic } from '../../../../src/rehearsal/native/mic';
import { useTheme } from '../../../../src/theme/ThemeContext';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const MONO = 'CourierPrime_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';
const CAP = 'CourierPrime_700Bold';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';

/**
 * Scene partner. First, the scene you left, as an ink card with how far you
 * got and Resume; then your sides as rows; then Add sides as the last row,
 * a dashed tile, not a button standing on its own. The library under it only
 * when there is one. Anyone with a session (a stranger has one) can run the
 * guided scene; bringing your own sides asks for the account they live on.
 */
export default function RehearseHub() {
  const { onScroll: onBarScroll, scrollY } = useRoomScroll();
  const tabSpace = useTabBarSpace();
  const { colors: c } = useTheme();
  const router = useRouter();
  const { tiltX, tiltY } = useStageMotion();
  const { session, isAuthenticated } = useSession();
  const ready = Boolean(session);
  const { isPaid } = useEntitlement();
  const { script: openScript } = useLocalSearchParams<{ script?: string }>();
  const scripts = useScripts(isAuthenticated);
  const scenes = useScenes(ready);
  const stats = useRunStats(ready);
  const latest = useLatestRun(ready);
  const mine = (scripts.data ?? []).filter(s => !s.is_sample);
  const library = (scenes.data ?? []).filter(s => s.is_library);
  // The shelf of your own sides, in the order the actor put it: hold a row
  // and drag it, or slide it left to delete it (with a word first).
  const qc = useQueryClient();
  const removeScript = useDeleteScript();
  const [order, setOrder] = useState<number[] | null>(null);
  const shelf = useMemo(() => {
    if (!order) return mine;
    const at = new Map(order.map((id, i) => [id, i]));
    return [...mine].sort((a, b) => (at.get(a.id) ?? 1e9) - (at.get(b.id) ?? 1e9));
  }, [mine, order]);
  const [dropping, setDropping] = useState<ScriptSummary | null>(null);
  const [sorting, setSorting] = useState(false);
  const reorder = (next: ScriptSummary[]) => {
    const ids = next.map((x) => x.id);
    setOrder(ids);
    void reorderScripts(ids).then(() => qc.invalidateQueries({ queryKey: ['scripts'] })).catch(() => setOrder(null));
  };
  const neverRun = stats.data ? stats.data.runs === 0 : false;
  const left = latest.data ?? null;

  // A script still being read: ask again every few seconds until it settles.
  const reading = mine.some(s => s.processing_status !== 'completed' && s.processing_status !== 'failed');
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(() => void scripts.refetch(), 3000);
    return () => clearInterval(t);
  }, [reading, scripts]);

  // The microphone and the recogniser are asked for on arrival, with the room in view.
  useEffect(() => { if (ready) void Mic.permission(); }, [ready]);

  // The three first scenes, for everyone, always: they are guided, so never metered.
  const guidedList = useGuided(ready);
  const firstThree = useMemo(() => (guidedList.data?.scenes?.length ? firstScenes(guidedList.data) : []), [guidedList.data]);
  // The room comes up whole: the first scenes, your sides and the library
  // together, or a lamp until they are, never one shelf and then the next.
  const settling = !ready || guidedList.isPending || scenes.isPending || (isAuthenticated && scripts.isPending);
  // The three first scenes fold away once there is a shelf of your own or
  // one of them has been run; a tap on the aside opens them again.
  const [done, setDone] = useState<string[] | null>(null);
  useEffect(() => { demoDone().then(setDone).catch(() => setDone([])); }, []);
  const [showStarters, setShowStarters] = useState<boolean | null>(null);
  const startersOpen = showStarters ?? (mine.length === 0 && (done?.length ?? 0) === 0);

  const add = () => { Haptics.selectionAsync().catch(() => {}); router.push(isAuthenticated ? '/sides' : '/auth'); };
  // The first scenes, the three on cards: the help's one thing to do goes there, not to the one scene a server used to have.
  const guided = () => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/demo', params: { after: '9' } }); };
  // How this works, behind a question mark, as on the board: the loop, one
  // paragraph, and the guided scene as the one thing to do next.
  const [how, setHow] = useState(false);
  const help = (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); track('app_partner_how', { from: 'scene' }); setHow(true); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="How this works"
      style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: 'InstrumentSerif_400Regular_Italic', fontSize: 16, lineHeight: 18, color: c.mutedForeground }}>?</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StageBackdrop tiltX={tiltX} tiltY={tiltY} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <RoomHeader title="Scene partner" scrollY={scrollY} right={help} />
        <HowItWorksSheet
          open={how}
          onClose={() => setHow(false)}
          title="It reads the others."
          accent="You read yours."
          body="Your sides in, your part picked, a voice heard. Then it listens, and answers on your last word."
          scene={<PartnerScene style={{ marginTop: 16 }} />}
          primaryLabel="Pick a first scene"
          onPrimary={() => { setHow(false); guided(); }}
        />
        <Animated.ScrollView scrollEnabled={!sorting} showsVerticalScrollIndicator={false} onScroll={onBarScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: tabSpace }}>
          <RoomTitle scrollY={scrollY} style={{ paddingTop: 4, paddingHorizontal: 2 }}>
            <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 44, lineHeight: 52, letterSpacing: -0.8, color: c.foreground }}>
              Scene <Text style={{ fontFamily: SERIF_I, color: c.accentText }}>partner.</Text>
            </Text>
          </RoomTitle>
          {settling ? (
            <View style={{ marginTop: 80, alignItems: 'center' }}>
              <GhostLight size={34} />
              <StageDirection style={{ marginTop: 18 }}>(raising the house lights.)</StageDirection>
            </View>
          ) : (
            <Animated.View entering={FadeIn.duration(380)}>

          {!ready ? (
            <View style={{ marginTop: 40, alignItems: 'center' }}>
              <Sketch name="masks" size={96} stroke={c.mutedForeground} accent={c.yellow} />
              <StageDirection style={{ marginTop: 22 }}>(the house is dark. check your connection.)</StageDirection>
            </View>
          ) : (
            <>
              {left ? (
                <Animated.View entering={FadeIn.duration(260)} style={{ marginTop: 22 }}>
                  <PickUp r={left} />
                </Animated.View>
              ) : neverRun && mine.length === 0 && !firstThree.length ? (
                <Animated.View entering={FadeIn.duration(260)} style={{ marginTop: 22 }}>
                  <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/demo', params: { after: '9' } }); }} accessibilityRole="button">
                    <PaperCard rotate={-0.4} shadow={6} style={{ padding: 18 }}>
                      <Text style={{ fontFamily: CAP, fontSize: 9, letterSpacing: 1.3, color: c.paperMuted }}>FIRST, TRY IT</Text>
                      <Text style={{ marginTop: 6, fontFamily: SERIF, fontSize: 26, lineHeight: 30, color: c.paperInk }}>Run a scene with a partner.</Text>
                      <Text style={{ marginTop: 6, fontFamily: MONO_I, fontSize: 13, lineHeight: 19, color: c.paperMuted }}>(two minutes. nothing to set up. the part is cast.)</Text>
                    </PaperCard>
                  </Pressable>
                </Animated.View>
              ) : null}

              {firstThree.length ? (
                <Shelf title="Three to start with" aside={startersOpen ? '(fold.)' : '(open.)'} onAside={() => { Haptics.selectionAsync().catch(() => {}); setShowStarters(!startersOpen); }}>
                  {startersOpen ? firstThree.map((s) => {
                    const words = KEY_WORDS[s.key] ?? { eyebrow: s.title.toUpperCase(), tone: s.hook ?? '' };
                    return (
                      <Pressable key={s.key} onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/demo', params: { key: s.key, after: '9' } }); }}
                        accessibilityRole="button" accessibilityLabel={s.title}
                        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, opacity: pressed ? 0.7 : 1 })}>
                        <View style={{ width: 54, height: 54, borderRadius: 12, backgroundColor: c.yellow, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontFamily: SERIF, fontSize: 24, color: c.ink }}>{s.title.replace(/^A /, '').slice(0, 1).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontFamily: SANS_B, fontSize: 18, color: c.foreground }}>{s.title}</Text>
                          <Text numberOfLines={2} style={{ marginTop: 2, fontFamily: SANS, fontSize: 14, lineHeight: 19, color: c.mutedForeground }}>{s.characters.map((ch) => ch.name).join(' and ')}. {words.tone}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={c.chevron} />
                      </Pressable>
                    );
                  }) : null}
                </Shelf>
              ) : null}

              <Shelf title="Your sides" aside={mine.length ? `(${mine.length}.)` : undefined}>
                <Animated.View layout={LinearTransition.duration(240)}>
                  {scripts.isLoading && isAuthenticated ? (
                    <StageDirection style={{ paddingVertical: 10 }}>(gathering your scripts…)</StageDirection>
                  ) : null}
                  <SortableList
                    items={shelf}
                    keyOf={(s) => s.id}
                    onReorder={reorder}
                    onHolding={setSorting}
                    renderItem={(s) => (
                      <SwipeRow asks word="Delete" label={`Delete ${s.title}`} onRemove={() => setDropping(s)} style={{ backgroundColor: c.background }}>
                        <View style={{ backgroundColor: c.background }}>
                          <ScriptRow script={s} startOpen={openScript === String(s.id)} left={left} />
                        </View>
                      </SwipeRow>
                    )}
                  />
                  {shelf.length > 1 ? (
                    <StageDirection style={{ marginTop: 8, paddingHorizontal: 2 }}>(hold one to move it. slide it left to delete.)</StageDirection>
                  ) : null}
                  {/* Add sides, as the last row of the sides. */}
                  <Pressable onPress={add} accessibilityRole="button" accessibilityLabel="Add sides"
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, opacity: pressed ? 0.7 : 1 })}>
                    <View style={{ width: 54, height: 54, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.accentText, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="add" size={22} color={c.accentText} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: SANS_B, fontSize: 18, color: c.accentText }}>Add sides</Text>
                      {isAuthenticated ? null : (
                        <Text style={{ marginTop: 2, fontFamily: SANS, fontSize: 14, color: c.mutedForeground }}>Sign in first</Text>
                      )}
                    </View>
                  </Pressable>
                </Animated.View>
              </Shelf>

              {scenes.isLoading || scenes.isError || library.length > 0 ? (
                <Shelf title="The library" aside={library.length ? `(${library.length} scenes.)` : undefined}>
                  {scenes.isLoading ? (
                    <StageDirection style={{ paddingVertical: 6 }}>(raising the house lights…)</StageDirection>
                  ) : scenes.isError ? (
                    <StageDirection style={{ paddingVertical: 6 }}>(the library is dark. pull to try again.)</StageDirection>
                  ) : (
                    library.map((s) => <SceneRow key={s.id} scene={s} locked={!isPaid && !s.is_free_library} />)
                  )}
                </Shelf>
              ) : null}
            </>
          )}
            </Animated.View>
          )}
        </Animated.ScrollView>
      </SafeAreaView>
      <ConfirmSheet
        open={dropping !== null}
        title="Delete these"
        accent="sides?"
        body={`${dropping?.title ?? 'These sides'} and every scene in them go, with your runs of them. This cannot be undone.`}
        confirm="Delete"
        cancel="Keep them"
        danger
        busy={removeScript.isPending}
        onConfirm={() => { const d = dropping; if (!d) return; removeScript.mutate(d.id, { onSettled: () => setDropping(null) }); }}
        onCancel={() => setDropping(null)}
      />
    </View>
  );
}

/** The scene you left: an ink card, how far you got, Resume in gel yellow, Start over beside it. */
function PickUp({ r }: { r: LatestRun }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const progress = r.line_count > 0 ? Math.min(1, (r.line_index + 1) / r.line_count) : 0;
  const partner = r.partners[0];
  const who = partner ? `(you're ${r.character}. ${partner.voice} reads ${partner.character}.)` : `(you're ${r.character}.)`;
  const go = (resume: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    track('app_rehearse_opened', { from: 'home' });
    router.push({ pathname: '/rehearse/[id]', params: resume ? { id: String(r.scene_id), from: 'script', go: '1', resume: '1' } : { id: String(r.scene_id), from: 'script' } });
  };
  return (
    <View>
      <View style={{ position: 'absolute', left: 4, top: 4, right: -4, bottom: -4, borderRadius: 18, backgroundColor: c.yellow }} />
      <View style={{ borderRadius: 18, backgroundColor: c.ink, padding: 20 }}>
        <Text style={{ fontFamily: SANS_B, fontSize: 11, letterSpacing: 1.6, color: c.yellow }}>PICK UP WHERE YOU LEFT</Text>
        <Text numberOfLines={2} style={{ marginTop: 10, fontFamily: SERIF, fontSize: 30, lineHeight: 34, letterSpacing: -0.4, color: '#f7f3ec' }}>{r.title}</Text>
        <Text numberOfLines={2} style={{ marginTop: 4, fontFamily: MONO_I, fontSize: 13, lineHeight: 18, color: '#b5ada3' }}>{who}</Text>
        <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: '#3a2c24', overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(progress * 100)}%`, height: 4, backgroundColor: c.yellow }} />
          </View>
          <Text style={{ fontFamily: SANS_B, fontSize: 13, color: '#f7f3ec' }}>line {r.line_index + 1} of {r.line_count}</Text>
        </View>
        <View style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => go(false)} hitSlop={10} accessibilityRole="button">
            <Text style={{ fontFamily: SANS_B, fontSize: 15, color: '#f7f3ec' }}>Start over</Text>
          </Pressable>
          <Pressable onPress={() => go(true)} accessibilityRole="button" accessibilityLabel="Resume"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, height: 46, borderRadius: 23, backgroundColor: c.yellow, opacity: pressed ? 0.8 : 1 })}>
            <Ionicons name="play" size={14} color={c.ink} />
            <Text style={{ fontFamily: SANS_B, fontSize: 16, color: c.ink }}>Resume</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Shelf({ title, aside, onAside, children }: { title: string; aside?: string; onAside?: () => void; children: React.ReactNode }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginTop: 30 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4, paddingHorizontal: 2 }}>
        <Text style={{ fontFamily: SANS_B, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', color: c.mutedForeground }}>{title}</Text>
        {aside && onAside ? (
          <Pressable onPress={onAside} hitSlop={10} accessibilityRole="button"><StageDirection link style={{ color: c.accentText }}>{aside}</StageDirection></Pressable>
        ) : aside ? <StageDirection>{aside}</StageDirection> : null}
      </View>
      {children}
    </View>
  );
}

/**
 * One of the actor's scripts, as a row: the pages, the title, who is in it.
 * A tap opens the list of its scenes under it (one scene goes straight to the
 * sheet the first time); the scene you left carries its bar of progress.
 */
function ScriptRow({ script, startOpen, left }: { script: ScriptSummary; startOpen: boolean; left: LatestRun | null }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const detail = useScript(script.id, open);
  const ready = script.processing_status === 'completed';
  const broke = script.processing_status === 'failed';
  const cast = script.characters.map(ch => ch.name).filter(Boolean).slice(0, 3).join(', ');
  const go = (sceneId: number) => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/rehearse/[id]', params: { id: String(sceneId), from: 'script' } }); };
  const line = broke ? `(${script.processing_error?.toLowerCase() ?? 'it could not be read.'})`
    : !ready ? '(still reading the pages…)'
    : `(${cast || `${script.num_characters} parts`} · ${script.num_scenes_extracted} ${script.num_scenes_extracted === 1 ? 'scene' : 'scenes'}.)`;
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: c.divider }}>
      <Pressable onPress={() => { if (!ready) return; Haptics.selectionAsync().catch(() => {}); setOpen(o => !o); }} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityHint="Hold to move it, slide left to delete"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ width: 54, height: 54, alignItems: 'center', justifyContent: 'center' }}>
          <Sketch name="scriptPages" size={46} stroke={ready ? c.foreground : c.mutedForeground} accent={c.yellow} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ fontFamily: SERIF, fontSize: 23, lineHeight: 27, color: c.foreground }}>{script.title}</Text>
          <Text numberOfLines={2} style={{ marginTop: 2, fontFamily: MONO_I, fontSize: 12.5, lineHeight: 17, color: broke ? c.accentText : c.mutedForeground }}>{line}</Text>
        </View>
        {ready ? <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.mutedForeground} /> : null}
      </Pressable>
      {open && detail.data ? (
        <Animated.View entering={FadeIn.duration(220)} style={{ paddingLeft: 68, paddingBottom: 12, gap: 2 }}>
          {detail.data.scenes.map(sc => {
            const here = left && left.scene_id === sc.id ? left : null;
            const progress = here && here.line_count > 0 ? Math.min(1, (here.line_index + 1) / here.line_count) : 0;
            return (
              <Pressable key={sc.id} onPress={() => go(sc.id)} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingRight: 6, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={{ flex: 1, fontFamily: SANS, fontSize: 15, lineHeight: 21, color: c.foreground }}>{sc.title}</Text>
                  <Text style={{ fontFamily: MONO, fontSize: 12, color: c.mutedForeground }}>{here ? `line ${here.line_index + 1} of ${here.line_count}` : `${Math.max(1, Math.round(sc.estimated_duration_seconds / 60))} min`}</Text>
                </View>
                {here ? (
                  <View style={{ marginTop: 6, height: 3, borderRadius: 1.5, backgroundColor: c.inactiveMeter, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.round(progress * 100)}%`, height: 3, backgroundColor: c.yellow }} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </Animated.View>
      ) : open && detail.isLoading ? (
        <View style={{ paddingLeft: 68, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ActivityIndicator size="small" color={c.mutedForeground} />
          <StageDirection>(opening the sides.)</StageDirection>
        </View>
      ) : open && detail.isError ? (
        <StageDirection style={{ paddingLeft: 68, paddingBottom: 12 }}>(it would not open. try again.)</StageDirection>
      ) : null}
    </View>
  );
}

function SceneRow({ scene, locked }: { scene: SceneSummary; locked: boolean }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const minutes = Math.max(1, Math.round(scene.estimated_duration_seconds / 60));
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/rehearse/[id]', params: { id: String(scene.id), from: 'library' } }); }}
      accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.divider, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {scene.play_title && scene.play_title.trim().toLowerCase() !== scene.title.trim().toLowerCase() ? (
          <Text numberOfLines={2} style={{ fontFamily: MONO, fontSize: 12, lineHeight: 16, color: c.mutedForeground }}>{scene.play_title}</Text>
        ) : null}
        <Text numberOfLines={2} style={{ marginTop: 2, fontFamily: SERIF, fontSize: 22, lineHeight: 26, color: c.foreground }}>{scene.title}</Text>
        <Text numberOfLines={2} style={{ marginTop: 2, fontFamily: MONO_I, fontSize: 12.5, lineHeight: 17, color: c.mutedForeground }}>({scene.character_1_name} and {scene.character_2_name} · {minutes} min.)</Text>
      </View>
      <Text style={{ fontFamily: CAP, fontSize: 9, letterSpacing: 1.3, color: locked ? c.mutedForeground : c.accentText }}>{locked ? 'PREMIUM' : ''}</Text>
    </Pressable>
  );
}

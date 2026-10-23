import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ScenePayload } from '../../rehearsal/contract';
import { sameCharacter } from '../../rehearsal/contract';
import { useTheme } from '../../theme/ThemeContext';
import { PrimaryPill } from '../PrimaryPill';
import { StageDirection } from '../StageDirection';

const SERIF = 'InstrumentSerif_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';

/** Where the part you last played in a scene is kept, so the sheet opens on it. */
const partKey = (sceneId: number) => `ghostlight:part:${sceneId}`;

interface Props {
  payload: ScenePayload;
  guided: boolean;
  /** Begin was tapped: the run is opening and the first line warming. */
  preparing: boolean;
  /** One line under Begin while it is not lit: what it is waiting on. */
  waiting: string | null;
  error: string | null;
  /** The gate said no. */
  gated: boolean;
  onBegin: (character: string, voices: Record<string, string>, resume?: { runId: number; lineIndex: number }) => void;
  onPlans: () => void;
  onClose: () => void;
}

/**
 * Who are you: a sheet that rises from the bottom over the dimmed stage. Each
 * part is a card; the chosen one carries the yellow shadow and an ink check,
 * the others say who reads them, and tapping that name turns the voice over
 * to the next one. The part you played last time is chosen on open, so Begin
 * is never dark. Begin reads "Begin as Mark" and starts the run the moment
 * the first line is ready.
 */
export function CastSheet({ payload, guided, preparing, waiting, error, gated, onBegin, onPlans, onClose }: Props) {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const resume = guided ? null : payload.resume;
  const [mine, setMine] = useState<string | null>(() => (guided ? null : (payload.characters[0] ?? null)));
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const defaults = useMemo(
    () => Object.entries(payload.defaults).find(([k]) => sameCharacter(k, mine ?? payload.characters[0] ?? ''))?.[1] ?? {},
    [payload.defaults, payload.characters, mine],
  );
  const voiceOf = (ch: string) => overrides[ch] ?? Object.entries(defaults).find(([k]) => sameCharacter(k, ch))?.[1] ?? payload.voices[0]?.id ?? '';
  const voice = (id: string) => payload.voices.find(v => v.id === id);
  const linesOf = (ch: string) => payload.lines.filter(l => sameCharacter(l.character, ch)).length;

  // The part played last time opens chosen.
  useEffect(() => {
    if (guided) return;
    void AsyncStorage.getItem(partKey(payload.scene.id)).then(saved => {
      if (saved && payload.characters.some(ch => sameCharacter(ch, saved))) setMine(saved);
    }).catch(() => {});
  }, [guided, payload.scene.id, payload.characters]);

  const cycle = (ch: string) => {
    if (preparing || payload.voices.length < 2) return;
    Haptics.selectionAsync().catch(() => {});
    const ids = payload.voices.map(v => v.id);
    setOverrides(o => ({ ...o, [ch]: ids[(ids.indexOf(voiceOf(ch)) + 1) % ids.length] }));
  };
  const begin = (pickUp?: { runId: number; lineIndex: number }) => {
    if (!mine && !guided) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (mine) void AsyncStorage.setItem(partKey(payload.scene.id), mine).catch(() => {});
    const partners = payload.characters.filter(p => !mine || !sameCharacter(p, mine));
    onBegin(mine ?? '', Object.fromEntries(partners.map(p => [p, voiceOf(p)])), pickUp);
  };

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      {/* The stage behind, dimmed. A tap on it is a way out. */}
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#15110f', opacity: 0.22 }} />
      <Animated.View entering={SlideInDown.duration(420).springify().damping(22)} style={{ maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: c.background, paddingBottom: insets.bottom + 12 }}>
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: c.border, marginTop: 10 }} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 8 }}>
          {payload.scene.play_title && payload.scene.play_title.trim().toLowerCase() !== payload.scene.title.trim().toLowerCase() ? (
            <Text style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: c.mutedForeground }}>{payload.scene.play_title}</Text>
          ) : null}
          <Text style={{ marginTop: 4, fontFamily: SERIF, fontSize: 34, lineHeight: 38, letterSpacing: -0.5, color: c.foreground }}>{payload.scene.title}</Text>

          {guided ? (
            <Text style={{ marginTop: 16, fontFamily: SANS, fontSize: 15, lineHeight: 22, color: c.foreground }}>
              Two minutes with a partner. Your lines are lit; speak them, and the scene moves on your last word.
            </Text>
          ) : (
            <>
              <Text style={{ marginTop: 18, fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.8, color: c.accentText }}>(who are you?)</Text>
              <View style={{ marginTop: 12, gap: 12 }}>
                {payload.characters.map(ch => {
                  const on = mine !== null && sameCharacter(ch, mine);
                  const v = voice(voiceOf(ch));
                  return (
                    <View key={ch}>
                      {on ? <View style={{ position: 'absolute', left: 4, top: 4, right: -4, bottom: -4, borderRadius: 16, backgroundColor: c.yellow }} /> : null}
                      <Pressable onPress={() => { if (preparing) return; Haptics.selectionAsync().catch(() => {}); setMine(ch); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderRadius: 16, borderWidth: on ? 2 : 1.5, borderColor: on ? c.ink : c.border, backgroundColor: c.card }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 34, color: c.foreground }}>{ch}</Text>
                          {on ? (
                            <StageDirection on="paper" numberOfLines={1}>(you · {linesOf(ch)} lines.)</StageDirection>
                          ) : (
                            <Pressable onPress={() => cycle(ch)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Voice for ${ch}: ${v?.label ?? ''}. Tap for the next`} style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Text numberOfLines={1} style={{ fontFamily: MONO_I, fontSize: 13, color: c.paperMuted }}>
                                (read by <Text style={{ color: c.accentText, textDecorationLine: 'underline' }}>{v?.label ?? '…'}</Text>{v ? ` · ${v.gender === 'female' ? 'f' : 'm'}.` : '.'})
                              </Text>
                            </Pressable>
                          )}
                        </View>
                        <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: on ? 0 : 1.5, borderColor: c.border, backgroundColor: on ? c.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                          {on ? <Ionicons name="checkmark" size={16} color={c.yellow} /> : null}
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          <View style={{ marginTop: 26 }}>
            {gated ? (
              <>
                <Text style={{ fontFamily: SANS, fontSize: 15, lineHeight: 22, color: c.foreground }}>{error}</Text>
                <PrimaryPill label="See Premium" onPress={onPlans} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
              </>
            ) : (
              <>
                {error ? (
                  <StageDirection numberOfLines={3} style={{ marginBottom: 12 }}>({error.toLowerCase()})</StageDirection>
                ) : preparing && waiting ? (
                  <Animated.View entering={FadeIn.duration(200)}><StageDirection numberOfLines={2} style={{ marginBottom: 12 }}>({waiting})</StageDirection></Animated.View>
                ) : null}
                {resume && !preparing ? (
                  <View style={{ gap: 10 }}>
                    <StageDirection>(you left this one at line {resume.line_index + 1}.)</StageDirection>
                    <PrimaryPill label={`Pick up at line ${resume.line_index + 1}`} onPress={() => begin({ runId: resume.run_id, lineIndex: resume.line_index })} height={54} block haptic="medium" />
                    <PrimaryPill label={mine ? `Begin as ${mine}, from the top` : 'From the top'} variant="outline" onPress={() => begin()} height={50} block />
                  </View>
                ) : (
                  <PrimaryPill label={preparing ? 'Warming up' : guided ? 'Begin' : mine ? `Begin as ${mine}` : 'Begin'} onPress={() => begin()} disabled={preparing || (!mine && !guided)} height={54} block haptic="medium" />
                )}
              </>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

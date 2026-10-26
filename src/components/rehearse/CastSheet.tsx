import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import type { ScenePayload, Voice } from '../../rehearsal/contract';
import { sameCharacter } from '../../rehearsal/contract';
import { useTrialOffer } from '../../hooks/useTrialOffer';
import { useTheme } from '../../theme/ThemeContext';
import { PrimaryPill } from '../PrimaryPill';
import { playSample, primeSample, stopSample } from '../../rehearsal/native/sample';
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
 * Who are you: a sheet at the foot of the dimmed stage. Each part is a card;
 * the chosen one carries the yellow shadow and an ink check, the others say
 * who reads them, and tapping that opens the list of voices to choose from.
 * Begin is pinned at the foot, whatever the cast runs to. The part you played last time is chosen on open, so Begin
 * is never dark. Begin reads "Begin as Mark" and starts the run the moment
 * the first line is ready.
 */
export function CastSheet({ payload, guided, preparing, waiting, error, gated, onBegin, onPlans, onClose }: Props) {
  const router = useRouter();
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

  // Which part's voice is being chosen, or none.
  const [picking, setPicking] = useState<string | null>(null);
  // The voice being heard, and whether it is still on its way or sounding.
  const [hearing, setHearing] = useState<{ id: string; state: 'waiting' | 'sounding' } | null>(null);
  const hear = (v: Voice) => {
    if (picking === null) return;
    Haptics.selectionAsync().catch(() => {});
    if (hearing?.id === v.id) { stopSample(); setHearing(null); return; }
    // The character's first line, in this voice: the same line the scene will play.
    const line = payload.lines.find(l => sameCharacter(l.character, picking))?.index ?? payload.lines[0]?.index ?? 0;
    void playSample(payload.scene.id, line, v.id, st => setHearing(st === 'done' ? null : { id: v.id, state: st }));
  };
  useEffect(() => { if (picking === null) { stopSample(); setHearing(null); } }, [picking]);
  // The voices are pulled down ahead of the tap: each part's own voice as the
  // sheet opens, the rest of the list the moment a part's voices are opened.
  useEffect(() => {
    for (const ch of payload.characters) {
      const line = payload.lines.find(l => sameCharacter(l.character, ch))?.index;
      if (line !== undefined) void primeSample(payload.scene.id, line, voiceOf(ch));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.scene.id]);
  useEffect(() => {
    if (picking === null) return;
    const line = payload.lines.find(l => sameCharacter(l.character, picking))?.index;
    if (line === undefined) return;
    for (const v of payload.voices) void primeSample(payload.scene.id, line, v.id);
  }, [picking, payload]);
  useEffect(() => () => stopSample(), []);
  const pick = (ch: string) => { if (preparing || payload.voices.length < 2) return; Haptics.selectionAsync().catch(() => {}); setPicking(ch); };
  const choose = (id: string) => {
    if (!picking) return;
    Haptics.selectionAsync().catch(() => {});
    setOverrides(o => ({ ...o, [picking]: id }));
    setPicking(null);
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
      <Animated.View entering={FadeIn.duration(280)} style={{ maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: c.background, paddingBottom: insets.bottom + 12 }}>
        <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: c.border, marginTop: 10 }} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 8 }}>
          {payload.scene.play_title && payload.scene.play_title.trim().toLowerCase() !== payload.scene.title.trim().toLowerCase() ? (
            <Text style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: c.mutedForeground }}>{payload.scene.play_title}</Text>
          ) : null}
          <Text style={{ marginTop: 4, fontFamily: SERIF, fontSize: 34, lineHeight: 38, letterSpacing: -0.5, color: c.foreground }}>{payload.scene.title}</Text>
          {!guided && !payload.scene.is_library ? (
            /* Your own sides can be read through and put right before the run: a speaker, a direction, a line split in two. */
            <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); router.push({ pathname: '/edit/[id]', params: { id: String(payload.scene.id) } }); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Read and fix the sides"
              style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
              <Ionicons name="create-outline" size={14} color={c.accentText} />
              <Text numberOfLines={1} style={{ fontFamily: SANS_B, fontSize: 13, color: c.accentText }}>Fix the sides</Text>
            </Pressable>
          ) : null}

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
                            <StageDirection on="paper" numberOfLines={1}>(you · {linesOf(ch)} {linesOf(ch) === 1 ? 'line' : 'lines'}.)</StageDirection>
                          ) : (
                            <Pressable onPress={() => pick(ch)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Voice for ${ch}: ${v ? nameOf(v) : ''}. Tap to choose another`}
                              style={{ marginTop: 6, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 8, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: c.paperRule }}>
                              <Text numberOfLines={1} style={{ fontFamily: SANS, fontSize: 13, color: c.paperInk }}>read by {v ? nameOf(v) : '…'}</Text>
                              <Ionicons name="chevron-down" size={13} color={c.paperMuted} />
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

        </ScrollView>
        {/* Begin, pinned at the foot of the sheet, whatever the cast runs to. */}
        <View style={{ paddingHorizontal: 24, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.divider }}>
            {gated ? (
              <GateFoot mine={mine} onBought={() => begin()} onPlans={onPlans} />
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
        {/* The voices, as a list to choose from. */}
        <Modal visible={picking !== null} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
          <Pressable onPress={() => setPicking(null)} accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(21,17,15,0.45)' }}>
            <Pressable onPress={() => {}} style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: c.background, paddingBottom: insets.bottom + 12, maxHeight: '70%' }}>
              <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: c.border, marginTop: 10 }} />
              <Text style={{ marginTop: 16, marginHorizontal: 24, fontFamily: MONO_I, fontSize: 13, letterSpacing: 0.8, color: c.accentText }}>(who reads {picking}?)</Text>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}>
                {payload.voices.map(v => {
                  const on = picking !== null && voiceOf(picking) === v.id;
                  return (
                    <Pressable key={v.id} onPress={() => choose(v.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 8, borderRadius: 12, backgroundColor: pressed ? c.panel : 'transparent' })}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: on ? c.ink : c.panel, borderWidth: on ? 0 : 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontFamily: SERIF, fontSize: 18, color: on ? c.yellow : c.foreground }}>{nameOf(v).slice(0, 1)}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontFamily: SANS_B, fontSize: 16, color: c.foreground }}>{nameOf(v)}</Text>
                        <Text numberOfLines={1} style={{ marginTop: 1, fontFamily: SANS, fontSize: 13, color: c.mutedForeground }}>{asideOf(v)}</Text>
                      </View>
                      {on ? <Ionicons name="checkmark" size={18} color={c.foreground} /> : null}
                      {/* Hear it: the character's first line in this voice. */}
                      <Pressable onPress={() => hear(v)} hitSlop={10} accessibilityRole="button" accessibilityLabel={hearing?.id === v.id ? `Stop ${nameOf(v)}` : `Hear ${nameOf(v)}`}
                        style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: hearing?.id === v.id ? c.accentText : c.border, alignItems: 'center', justifyContent: 'center' }}>
                        {hearing?.id === v.id && hearing.state === 'waiting' ? (
                          <ActivityIndicator size="small" color={c.accentText} />
                        ) : (
                          <Ionicons name={hearing?.id === v.id ? 'stop' : 'volume-medium-outline'} size={17} color={hearing?.id === v.id ? c.accentText : c.foreground} />
                        )}
                      </Pressable>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      </Animated.View>
    </View>
  );
}

/**
 * The offer, at the foot of the sheet, when the month's free run is spent:
 * one line that says so and what the week costs after, and the pill that
 * starts the week and then the scene, in that order. The same head as the
 * paywall (useTrialOffer), so the two can never disagree about the money.
 * Buying here begins the run the moment the store answers.
 */
function GateFoot({ mine, onBought, onPlans }: { mine: string | null; onBought: () => void; onPlans: () => void }) {
  const { colors: c } = useTheme();
  const router = useRouter();
  const offer = useTrialOffer({ from: 'cast', onDone: onBought, onSignIn: () => router.push('/auth') });
  const week = offer.trialDays === 7 ? 'week' : offer.trialLabel ?? '';
  const then = mine ? `, then begin as ${mine}` : ', then begin';
  const line = offer.storeDown
    ? '(the app store is out of reach. try again in a moment.)'
    : offer.trialLabel
      ? `(your free run this month is spent. free for ${offer.trialLabel}, then ${offer.billed} ${offer.cadence}.)`
      : `(your free run this month is spent. ${offer.billed} ${offer.cadence}, cancel any time.)`;
  return (
    <View>
      <StageDirection numberOfLines={3} style={{ marginBottom: 12 }}>{line}</StageDirection>
      {offer.busy ? (
        <ActivityIndicator color={c.accentText} style={{ height: 54 }} />
      ) : offer.storeDown ? (
        <PrimaryPill label="Try again" onPress={offer.retry} height={54} block haptic="medium" />
      ) : (
        <PrimaryPill label={offer.trialLabel ? `Start the free ${week}${then}` : `Unlock everything${then}`} onPress={offer.buy} height={54} block haptic="medium" />
      )}
      {offer.note ? <Text style={{ marginTop: 8, fontFamily: SANS, fontSize: 12, lineHeight: 17, color: c.mutedForeground }}>{offer.note}</Text> : null}
      <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={onPlans} hitSlop={8} accessibilityRole="button"><Text style={{ fontFamily: SANS, fontSize: 12.5, color: c.mutedForeground }}>See the plans</Text></Pressable>
        <Pressable onPress={offer.onRestore} hitSlop={8} accessibilityRole="button"><Text style={{ fontFamily: SANS, fontSize: 12.5, color: c.mutedForeground }}>{offer.restoring ? 'Restoring…' : 'Restore purchases'}</Text></Pressable>
      </View>
    </View>
  );
}

/** A voice's name: the server's label up to its first dot, "Aoede · breezy, easy, 30s" is Aoede. */
function nameOf(v: Voice): string { return v.label.split('·')[0].trim(); }
/** What the server says about it after the dot, or just whether it is a woman's or a man's. */
function asideOf(v: Voice): string {
  const rest = v.label.split('·').slice(1).join('·').trim();
  return rest || (v.gender === 'female' ? 'a woman' : 'a man');
}

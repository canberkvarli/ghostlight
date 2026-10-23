import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import type { ScenePayload } from '../../rehearsal/contract';
import { sameCharacter } from '../../rehearsal/contract';
import { useTheme } from '../../theme/ThemeContext';
import { PrimaryPill } from '../PrimaryPill';
import { StageDirection } from '../StageDirection';

const SERIF = 'InstrumentSerif_400Regular';
const MONO = 'CourierPrime_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';
const SANS_B = 'BricolageGrotesque_600SemiBold';

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
}

/**
 * Before the run. The play and the scene; your part, as a row of names to
 * tap; the voice for each of the other parts, chosen from a short list that
 * opens under the name; a few lines of the scene as they are, so you know
 * what you are walking into; Begin. One decision at a time and nothing
 * else on the sheet. Begin opens the run and starts it the moment the first
 * line is ready, so there is one tap, not two.
 */
export function CastSheet({ payload, guided, preparing, waiting, error, gated, onBegin, onPlans }: Props) {
  const { colors: c } = useTheme();
  const resume = guided ? null : payload.resume;
  const [mine, setMine] = useState<string | null>(() => (guided ? null : (payload.characters[0] ?? null)));
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null); // the part whose voice list is open
  const defaults = useMemo(
    () => Object.entries(payload.defaults).find(([k]) => sameCharacter(k, mine ?? payload.characters[0] ?? ''))?.[1] ?? {},
    [payload.defaults, payload.characters, mine],
  );
  const voiceOf = (ch: string) => overrides[ch] ?? Object.entries(defaults).find(([k]) => sameCharacter(k, ch))?.[1] ?? payload.voices[0]?.id ?? '';
  const labelOf = (id: string) => payload.voices.find(v => v.id === id)?.label ?? id;
  const others = payload.characters.filter(ch => !mine || !sameCharacter(ch, mine));
  const minutes = Math.max(1, Math.round(payload.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0) / 150));
  const preview = payload.lines.slice(0, 4);

  const begin = (pickUp?: { runId: number; lineIndex: number }) => {
    if (!mine && !guided) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const partners = payload.characters.filter(p => !mine || !sameCharacter(p, mine));
    onBegin(mine ?? '', Object.fromEntries(partners.map(p => [p, voiceOf(p)])), pickUp);
  };

  const chip = (label: string, on: boolean, onPress: () => void, disabled = false) => (
    <Pressable key={label} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: 16, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: on ? c.foreground : c.border, backgroundColor: on ? c.foreground : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: SANS_B, fontSize: 14, color: on ? c.background : c.foreground }}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 }}>
      {payload.scene.play_title && payload.scene.play_title.trim().toLowerCase() !== payload.scene.title.trim().toLowerCase() ? (
        <Text style={{ fontFamily: MONO, fontSize: 13, color: c.mutedForeground }}>{payload.scene.play_title}</Text>
      ) : null}
      <Text style={{ marginTop: 4, fontFamily: SERIF, fontSize: 38, lineHeight: 42, letterSpacing: -0.6, color: c.foreground }}>{payload.scene.title}</Text>
      <StageDirection style={{ marginTop: 8 }}>({payload.lines.length} lines · about {minutes} min.)</StageDirection>

      {guided ? (
        <Text style={{ marginTop: 22, fontFamily: SANS, fontSize: 15, lineHeight: 22, color: c.foreground }}>
          Two minutes with a partner. Your lines are lit; speak them, and the scene moves on your last word.
        </Text>
      ) : (
        <>
          <Section title="Your part">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {payload.characters.map(ch => chip(ch, mine !== null && sameCharacter(ch, mine), () => { Haptics.selectionAsync().catch(() => {}); setMine(ch); setOpen(null); }, preparing))}
            </View>
          </Section>

          {others.length > 0 && payload.voices.length > 0 ? (
            <Section title={others.length === 1 ? 'The other part' : 'The other parts'}>
              <Animated.View layout={LinearTransition.duration(200)}>
                {others.map(ch => {
                  const isOpen = open === ch;
                  const current = voiceOf(ch);
                  return (
                    <View key={ch} style={{ borderBottomWidth: 1, borderBottomColor: c.divider }}>
                      <Pressable onPress={() => { if (preparing) return; Haptics.selectionAsync().catch(() => {}); setOpen(isOpen ? null : ch); }}
                        accessibilityRole="button" accessibilityLabel={`${ch}, read by ${labelOf(current)}`}
                        style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontFamily: SANS_B, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: c.foreground }}>{ch}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontFamily: MONO_I, fontSize: 13, color: c.mutedForeground }}>read by</Text>
                          <Text style={{ fontFamily: SANS_B, fontSize: 14, color: c.accentText }}>{labelOf(current)}</Text>
                          <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.mutedForeground} />
                        </View>
                      </Pressable>
                      {isOpen ? (
                        <Animated.View entering={FadeIn.duration(160)} style={{ paddingBottom: 10, gap: 2 }}>
                          {payload.voices.map(v => {
                            const on = v.id === current;
                            return (
                              <Pressable key={v.id} onPress={() => { Haptics.selectionAsync().catch(() => {}); setOverrides(o => ({ ...o, [ch]: v.id })); setOpen(null); }}
                                accessibilityRole="button" accessibilityState={{ selected: on }}
                                style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 12 }}>
                                <Text style={{ fontFamily: SANS, fontSize: 15, color: on ? c.foreground : c.mutedForeground }}>{v.label}</Text>
                                <Text style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, color: c.mutedForeground }}>{v.gender === 'female' ? 'F' : 'M'}{on ? '  ·  chosen' : ''}</Text>
                              </Pressable>
                            );
                          })}
                        </Animated.View>
                      ) : null}
                    </View>
                  );
                })}
              </Animated.View>
            </Section>
          ) : null}

          <Section title="The scene, as written">
            <View style={{ gap: 10 }}>
              {preview.map(l => (
                <View key={l.index} style={{ opacity: mine && sameCharacter(l.character, mine) ? 1 : 0.6 }}>
                  <Text style={{ fontFamily: SANS_B, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: mine && sameCharacter(l.character, mine) ? c.accentText : c.mutedForeground }}>{l.character}</Text>
                  <Text numberOfLines={2} style={{ marginTop: 2, fontFamily: MONO, fontSize: 14, lineHeight: 21, color: c.foreground }}>{l.text}</Text>
                </View>
              ))}
              {payload.lines.length > preview.length ? (
                <StageDirection>(and {payload.lines.length - preview.length} more.)</StageDirection>
              ) : null}
            </View>
          </Section>
        </>
      )}

      <View style={{ marginTop: 30 }}>
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
              <StageDirection numberOfLines={2} style={{ marginBottom: 12 }}>({waiting})</StageDirection>
            ) : null}
            {resume && !preparing ? (
              <View style={{ gap: 10 }}>
                <StageDirection>(you left this one at line {resume.line_index + 1}.)</StageDirection>
                <PrimaryPill label={`Pick up at line ${resume.line_index + 1}`} onPress={() => begin({ runId: resume.run_id, lineIndex: resume.line_index })} height={54} block haptic="medium" />
                <PrimaryPill label="From the top" variant="outline" onPress={() => begin()} height={50} block />
              </View>
            ) : (
              <PrimaryPill label={preparing ? 'Warming up' : 'Begin'} onPress={() => begin()} disabled={preparing || (!mine && !guided)} height={54} block haptic="medium" />
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors: c } = useTheme();
  return (
    <View style={{ marginTop: 26 }}>
      <Text style={{ fontFamily: SANS_B, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: c.mutedForeground, marginBottom: 12 }}>{title}</Text>
      {children}
    </View>
  );
}

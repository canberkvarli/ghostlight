import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import type { ScenePayload } from '../../rehearsal/contract';
import { sameCharacter } from '../../rehearsal/contract';
import { useTheme } from '../../theme/ThemeContext';
import { PrimaryPill } from '../PrimaryPill';
import { StageDirection } from '../StageDirection';

const SERIF = 'InstrumentSerif_400Regular';
const SERIF_I = 'InstrumentSerif_400Regular_Italic';
const MONO = 'CourierPrime_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';
const SANS = 'BricolageGrotesque_500Medium';

interface Props {
  payload: ScenePayload;
  guided: boolean;
  /** The part already committed (the run is open), or null. */
  chosen: string | null;
  canBegin: boolean;
  /** One line under Begin while it is not lit: what it is waiting on. */
  waiting: string | null;
  error: string | null;
  /** The gate said no. */
  gated: boolean;
  onChoose: (character: string, voices: Record<string, string>, resume?: { runId: number; lineIndex: number }) => void;
  onBegin: () => void;
  onPlans: () => void;
}

/**
 * Before the run: the play, the scene, the parts as plain tappable lines with
 * the voice under each, Begin. Tapping a part is the commitment (it opens the
 * run), so the voices are set first; tap a voice to hear the next one. With a
 * run to pick up, the part tap is followed by where to start. A guided run
 * shows the title and Begin, nothing else.
 */
export function CastSheet({ payload, guided, chosen, canBegin, waiting, error, gated, onChoose, onBegin, onPlans }: Props) {
  const { colors: c } = useTheme();
  const [picked, setPicked] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const mine = chosen ?? picked;
  const locked = Boolean(chosen);
  const resume = guided ? null : payload.resume;
  const previewFor = mine ?? payload.characters[0] ?? '';
  const defaults = useMemo(
    () => Object.entries(payload.defaults).find(([k]) => sameCharacter(k, previewFor))?.[1] ?? {},
    [payload.defaults, previewFor],
  );
  const voiceOf = (ch: string) => overrides[ch] ?? Object.entries(defaults).find(([k]) => sameCharacter(k, ch))?.[1] ?? payload.voices[0]?.id ?? '';
  const labelOf = (id: string) => payload.voices.find(v => v.id === id)?.label ?? id;
  const cycle = (ch: string) => {
    if (locked || payload.voices.length < 2) return;
    Haptics.selectionAsync().catch(() => {});
    const ids = payload.voices.map(v => v.id);
    const at = ids.indexOf(voiceOf(ch));
    setOverrides(o => ({ ...o, [ch]: ids[(at + 1) % ids.length] }));
  };
  const commit = (character: string, pickUp?: { runId: number; lineIndex: number }) => {
    const partners = payload.characters.filter(p => !sameCharacter(p, character));
    onChoose(character, Object.fromEntries(partners.map(p => [p, voiceOf(p)])), pickUp);
  };
  const tapPart = (ch: string) => {
    if (locked) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (resume) setPicked(ch); else { setPicked(ch); commit(ch); }
  };
  const starting = picked;

  return (
    <View style={{ flex: 1, paddingHorizontal: 26, paddingTop: 36 }}>
      {payload.scene.play_title ? (
        <Text style={{ fontFamily: MONO, fontSize: 13, color: c.mutedForeground }}>{payload.scene.play_title}</Text>
      ) : null}
      <Text style={{ marginTop: 4, fontFamily: SERIF, fontSize: 38, lineHeight: 42, letterSpacing: -0.6, color: c.foreground }}>
        {payload.scene.title}
      </Text>
      {guided ? (
        <StageDirection style={{ marginTop: 14 }} numberOfLines={3}>
          {'(two minutes with a partner. your lines are lit;\nspeak them, and the scene moves.)'}
        </StageDirection>
      ) : (
        <View style={{ marginTop: 30, gap: 18 }}>
          <StageDirection>(who are you?)</StageDirection>
          {payload.characters.map(ch => {
            const isMine = mine !== null && sameCharacter(ch, mine);
            const soft = mine !== null && !isMine;
            return (
              <View key={ch}>
                <Pressable onPress={() => tapPart(ch)} disabled={locked} accessibilityRole="button" accessibilityState={{ selected: isMine }}
                  style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: SERIF, fontSize: 28, color: soft ? c.mutedForeground : c.foreground }}>{ch}</Text>
                  {isMine ? <Text style={{ fontFamily: SERIF_I, fontSize: 20, color: c.accentText }}>you</Text> : null}
                </Pressable>
                {!isMine && payload.voices.length > 0 ? (
                  <Pressable onPress={() => cycle(ch)} disabled={locked} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Voice for ${ch}: ${labelOf(voiceOf(ch))}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 }}>
                    <Text style={{ fontFamily: MONO_I, fontSize: 13, color: c.mutedForeground }}>read by</Text>
                    <Text style={{ fontFamily: MONO, fontSize: 13, color: locked ? c.mutedForeground : c.accentText, textDecorationLine: locked ? 'none' : 'underline' }}>
                      {labelOf(voiceOf(ch))}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {resume && starting && !locked ? (
        <View style={{ marginTop: 26, gap: 8 }}>
          <StageDirection>(you left this one at line {resume.line_index + 1}.)</StageDirection>
          <PrimaryPill label={`Pick up at line ${resume.line_index + 1}`} onPress={() => commit(starting, { runId: resume.run_id, lineIndex: resume.line_index })} />
          <PrimaryPill label="From the top" variant="outline" onPress={() => commit(starting)} />
        </View>
      ) : null}

      <View style={{ flex: 1 }} />
      {gated ? (
        <View style={{ marginBottom: 28 }}>
          <Text style={{ fontFamily: SANS, fontSize: 15, lineHeight: 22, color: c.foreground }}>{error}</Text>
          <PrimaryPill label="See Premium" onPress={onPlans} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
        </View>
      ) : (
        <View style={{ marginBottom: 28 }}>
          {error ? (
            <StageDirection numberOfLines={3} style={{ marginBottom: 12 }}>({error.toLowerCase()})</StageDirection>
          ) : waiting && (locked || guided) ? (
            <StageDirection numberOfLines={2} style={{ marginBottom: 12 }}>({waiting})</StageDirection>
          ) : null}
          <PrimaryPill label="Begin" onPress={onBegin} disabled={!canBegin} height={54} block haptic="medium" />
        </View>
      )}
    </View>
  );
}

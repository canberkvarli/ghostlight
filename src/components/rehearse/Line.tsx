import { memo, useEffect, useMemo } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { RehearsalLine } from '../../rehearsal/contract';
import { displayRuns } from '../../rehearsal/display-words';
import { useTheme } from '../../theme/ThemeContext';

/** Where the line sits against the run: already said, being said now, still to come. */
export type When = 'past' | 'live' | 'next';
/** On the live line, who has the floor. */
export type Speaking = 'sounding' | 'listening' | 'held' | 'warming';

interface Props {
  line: RehearsalLine;
  mine: boolean;
  when: When;
  speaking?: Speaking;
  /** For the actor's lines: indices of words heard. */
  heard?: Set<number>;
  /** On your live line: the word you are on. */
  at?: number;
  /** A tap starts the run here. Absent on the live line and before Begin. */
  onJump?: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}

const MONO = 'CourierPrime_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';
const SANS_B = 'BricolageGrotesque_600SemiBold';

/**
 * One line of the scene, on the stage: the cue in small caps, the direction,
 * the words in the typewriter face. The margin at the left holds the cue
 * light, lit only on the live line. On the actor's lines every word is its
 * own span: heard words come up to full ink, the word they are on carries a
 * rule in the accent, and neither ever moves back. The light is ink and
 * accent, never gel yellow: the stage is cream in daylight and yellow on
 * cream is nothing. A line's place changes with a fade, not a cut.
 */
function LineView({ line, mine, when, speaking, heard, at, onJump, onLayout }: Props) {
  const { colors: c } = useTheme();
  const words = useMemo(() => displayRuns(line.text), [line.text]);
  const live = when === 'live';
  const dim = when === 'past' ? 0.38 : when === 'next' ? 0.6 : 1;
  const fade = useSharedValue(dim);
  useEffect(() => { fade.value = withTiming(dim, { duration: 240 }); }, [dim, fade]);
  const faded = useAnimatedStyle(() => ({ opacity: fade.value }));
  const lamp = live ? (speaking === 'listening' ? c.accentText : speaking === 'sounding' ? c.stageGlow : c.mutedForeground) : 'transparent';
  const inkOn = c.foreground;
  const inkOff = live && mine ? c.mutedForeground : c.foreground;
  return (
    <Pressable onPress={onJump} disabled={!onJump} onLayout={onLayout}
      accessibilityRole={onJump ? 'button' : 'text'}
      accessibilityLabel={onJump ? `Start from ${line.character}: ${line.text.slice(0, 40)}` : undefined}>
      <Animated.View style={[faded, { flexDirection: 'row', paddingVertical: 10, paddingRight: 22 }]}>
        <View style={{ width: 22, alignItems: 'center', paddingTop: 7 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: lamp }} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: SANS_B, fontSize: 11, letterSpacing: 1.4, color: mine ? c.accentText : c.mutedForeground, textTransform: 'uppercase' }}>
            {line.character}
            {mine ? <Text style={{ fontFamily: MONO_I, fontSize: 11, letterSpacing: 0, textTransform: 'none', color: c.mutedForeground }}>{'  you'}</Text> : null}
          </Text>
          {line.direction && live ? (
            <Text style={{ marginTop: 2, fontFamily: MONO_I, fontSize: 13, lineHeight: 18, color: c.mutedForeground }}>{line.direction}</Text>
          ) : null}
          <Text style={{ marginTop: 4, fontFamily: MONO, fontSize: 17, lineHeight: 26, color: inkOff }}>
            {words.map((w, i) => (
              <Text key={i}>
                <Text
                  style={mine ? {
                    color: heard?.has(i) ? inkOn : inkOff,
                    textDecorationLine: live && at === i ? 'underline' : 'none',
                    textDecorationColor: c.accentText,
                  } : undefined}
                >
                  {w.word}
                </Text>
                {w.gap ? ' ' : ''}
              </Text>
            ))}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function sameWords(a?: Set<number>, b?: Set<number>): boolean {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const i of a) if (!b.has(i)) return false;
  return true;
}

/** The engine publishes a snapshot a frame; only a line whose place, position or heard words changed re-renders. */
export const Line = memo(LineView, (p, n) =>
  p.line === n.line && p.mine === n.mine && p.when === n.when && p.speaking === n.speaking && p.at === n.at
  && Boolean(p.onJump) === Boolean(n.onJump) && sameWords(p.heard, n.heard));

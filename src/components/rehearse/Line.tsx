import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent, type NativeSyntheticEvent, type TextLayoutEventData } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

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
  /** On your live line: where the word you are on sits, as a height from the line's top. The script follows it. */
  onCursor?: (y: number) => void;
}

/** Which row of the wrapped text holds `at`, from the rows the text laid itself out in. */
function rowOf(rows: { start: number; end: number; y: number }[], offsets: number[], at: number): number | null {
  const o = offsets[at];
  if (o === undefined) return null;
  for (const r of rows) if (o >= r.start && o < r.end) return r.y;
  return rows.length ? rows[rows.length - 1].y : null;
}

const MONO = 'CourierPrime_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';
const SANS_B = 'BricolageGrotesque_600SemiBold';

/**
 * One line of the scene. The cue in small caps, the direction, the words in
 * the typewriter face. Your live line carries a YOUR LINE pill, a rule of gel
 * down its left and the words at 21pt; every other line sits plain on the stage. Lines already said
 * fade to about forty percent, lines to come are muted. On your lines every
 * word is its own span: heard words come up to full ink, the word you are on
 * carries a rule in the accent, and neither ever moves back. A line's place
 * changes with a fade, not a cut.
 */
function LineView({ line, mine, when, speaking, heard, at, onJump, onLayout, onCursor }: Props) {
  const { colors: c } = useTheme();
  const words = useMemo(() => displayRuns(line.text), [line.text]);
  const live = when === 'live';
  const yours = live && mine;
  // Where each word starts in the text as laid out, and the rows the text
  // wrapped into: together they say which row the word you are on is in, so
  // the script can hold that row in the light, not just the line's head.
  const offsets = useMemo(() => {
    const out: number[] = []; let n = 0;
    for (const w of words) { out.push(n); n += w.word.length + (w.gap ? 1 : 0); }
    return out;
  }, [words]);
  const [rows, setRows] = useState<{ start: number; end: number; y: number }[]>([]);
  const bodyTop = useRef(0);
  const onTextLayout = yours ? (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    let n = 0;
    setRows(e.nativeEvent.lines.map(l => { const r = { start: n, end: n + l.text.length, y: l.y }; n += l.text.length; return r; }));
  } : undefined;
  useEffect(() => {
    if (!yours || !onCursor || at === undefined) return;
    const y = rowOf(rows, offsets, at);
    if (y !== null) onCursor(bodyTop.current + y);
  }, [yours, onCursor, at, rows, offsets]);
  const dim = when === 'past' ? 0.42 : when === 'next' ? 0.62 : 1;
  const fade = useSharedValue(dim);
  useEffect(() => { fade.value = withTiming(dim, { duration: 340, easing: Easing.out(Easing.cubic) }); }, [dim, fade]);
  const faded = useAnimatedStyle(() => ({ opacity: fade.value }));
  const size = yours ? 21 : 17;
  // Your line comes up a size when it is yours, and goes back when it is
  // said: a move of a third of a second, not a jump between two pages.
  const sz = useSharedValue(size);
  useEffect(() => { sz.value = withTiming(size, { duration: 340, easing: Easing.out(Easing.cubic) }); }, [size, sz]);
  const sized = useAnimatedStyle(() => ({ fontSize: sz.value, lineHeight: Math.round(sz.value * 1.5) }));
  // On your live line the words you have not said yet sit back; a word heard
  // comes up to full ink and stays; the word you are on carries a rule in gel.
  // Only colour moves, never weight: a wider word would re-wrap the line.
  const body = (
    <Animated.Text
      onTextLayout={onTextLayout}
      onLayout={yours ? (e) => { bodyTop.current = e.nativeEvent.layout.y; } : undefined}
      style={[sized, { marginTop: yours ? 8 : 4, fontFamily: MONO, color: c.foreground }]}
    >
      {words.map((w, i) => {
        const said = heard?.has(i) ?? false;
        const here = live && at === i;
        const style = mine
          ? { color: said || here || !live ? c.foreground : c.mutedForeground, textDecorationLine: here ? 'underline' as const : 'none' as const, textDecorationColor: c.yellow }
          : undefined;
        return (
          <Text key={i}>
            <Text style={style}>{w.word}</Text>
            {w.gap ? ' ' : ''}
          </Text>
        );
      })}
    </Animated.Text>
  );
  return (
    <Pressable onPress={onJump} disabled={!onJump} onLayout={onLayout}
      accessibilityRole={onJump ? 'button' : 'text'}
      accessibilityLabel={onJump ? `Start from ${line.character}: ${line.text.slice(0, 40)}` : undefined}>
      <Animated.View style={[faded, { paddingVertical: yours ? 14 : 12, paddingHorizontal: 8, paddingLeft: yours ? 14 : 8, borderLeftWidth: yours ? 3 : 0, borderLeftColor: c.yellow, marginLeft: yours ? -6 : 0 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontFamily: SANS_B, fontSize: 11, letterSpacing: 1.6, color: mine ? c.accentText : c.mutedForeground, textTransform: 'uppercase' }}>{line.character}</Text>
          {yours ? (
            <View style={{ paddingHorizontal: 10, height: 22, borderRadius: 11, backgroundColor: c.yellow, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: SANS_B, fontSize: 10, letterSpacing: 0.6, color: c.ink }}>YOUR LINE</Text>
            </View>
          ) : live && speaking === 'sounding' ? (
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.stageGlow }} />
          ) : null}
        </View>
        {line.direction && live ? (
          <Text style={{ marginTop: 4, fontFamily: MONO_I, fontSize: 13, lineHeight: 18, color: c.mutedForeground }}>{line.direction}</Text>
        ) : null}
        {body}
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
  && Boolean(p.onJump) === Boolean(n.onJump) && p.onCursor === n.onCursor && sameWords(p.heard, n.heard));

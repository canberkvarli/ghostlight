import { useCallback } from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeContext';

/**
 * How the partner works, in one looping picture, the way the board has one
 * for auditions. Three lines of a scene on the dark stage: the partner's
 * line sounds (a dot breathes beside it), then the handover, and your line
 * carries the gel rule and the YOUR LINE pill while its words come up to
 * full ink one by one as you say them, the one you are on underlined; on
 * the last word the partner's next line sounds at once. Then it goes round.
 *
 * One clock drives everything on the UI thread, held half a second after
 * the sheet lands so the first beat is seen, parked on the finished picture
 * with motion reduced. Always a dark stage, on both themes: one lighting
 * plot, as the board's loop is.
 */

const LOOP = 9000;
const HOLD = 500;
const H = 300;

const STAGE = {
  bg: '#17100c',
  line: 'rgba(226, 212, 190, 0.28)',
  fg: '#f1e8d6',
  muted: '#8f7f6c',
  dim: '#5e5245',
};

const MONO = 'CourierPrime_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';
const SANS_B = 'BricolageGrotesque_600SemiBold';

/** The beats, in ms on the loop. */
const P1 = { from: 300, to: 2300 }; // partner line 1 sounds
const YOU = { from: 2500, to: 5400 }; // your line, word by word
const P2 = { from: 5450, to: 7300 }; // partner line 2 sounds
const WORDS = ['I', 'know.', "I'm", 'sorry.'];
const WORD_MS = (YOU.to - YOU.from - 500) / WORDS.length;

function seg(v: number, a: number, b: number): number {
  'worklet';
  return interpolate(v, [a, b], [0, 1], Extrapolation.CLAMP);
}

export function PartnerScene({ style }: { style?: ViewStyle }) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? 5300 : 0);

  useFocusEffect(
    useCallback(() => {
      if (reduce) { t.value = 5300; return; }
      t.value = 0;
      t.value = withDelay(HOLD, withRepeat(withTiming(LOOP, { duration: LOOP, easing: Easing.linear }), -1, false));
      return () => cancelAnimation(t);
    }, [reduce, t]),
  );

  const all = useAnimatedStyle(() => ({ opacity: 1 - seg(t.value, 8300, 8900) }));
  const line1 = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * seg(t.value, P1.from, P1.from + 200) * (1 - 0.45 * seg(t.value, YOU.from, YOU.from + 300)) }));
  const line3 = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * seg(t.value, P2.from, P2.from + 200) }));
  // Your line: the rule and the pill come up at the handover and stay until the last word.
  const yours = useAnimatedStyle(() => ({ opacity: seg(t.value, YOU.from - 100, YOU.from + 200) * (1 - seg(t.value, YOU.to, YOU.to + 250)) }));
  const listening = useAnimatedStyle(() => ({ opacity: seg(t.value, YOU.from, YOU.from + 300) * (1 - seg(t.value, YOU.to - 100, YOU.to + 150)) }));
  const gel = useAnimatedStyle(() => ({ opacity: 0.05 + 0.08 * seg(t.value, YOU.from, YOU.from + 600) * (1 - seg(t.value, YOU.to, YOU.to + 400)) }));

  return (
    <View
      accessible
      accessibilityLabel="The partner reads its line; your line lights up word by word as you say it, and on your last word the partner answers at once."
      style={[{ height: H, borderRadius: 18, backgroundColor: STAGE.bg, borderWidth: 1, borderColor: STAGE.line, overflow: 'hidden' }, style]}
    >
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -150, left: -130, width: 340, height: 340, borderRadius: 170, backgroundColor: c.yellow }, gel]} />
      <Animated.View style={[{ flex: 1, paddingHorizontal: 20, paddingTop: 22, gap: 18 }, all]}>
        <Cue who="RILEY" beat={P1} t={t}>
          <Animated.Text style={[{ fontFamily: MONO, fontSize: 15, lineHeight: 22, color: STAGE.fg }, line1]}>You&apos;re late.</Animated.Text>
        </Cue>

        <View style={{ flexDirection: 'row' }}>
          <Animated.View style={[{ width: 3, borderRadius: 2, backgroundColor: c.yellow, marginRight: 12 }, yours]} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontFamily: SANS_B, fontSize: 10, letterSpacing: 1.6, color: c.yellow }}>ALEX</Text>
              <Animated.View style={[{ paddingHorizontal: 8, height: 18, borderRadius: 9, backgroundColor: c.yellow, justifyContent: 'center' }, yours]}>
                <Text style={{ fontFamily: SANS_B, fontSize: 9, letterSpacing: 0.6, color: '#1c1511' }}>YOUR LINE</Text>
              </Animated.View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
              {WORDS.map((w, i) => <Word key={i} word={w} i={i} t={t} yellow={c.yellow} />)}
            </View>
            <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }, listening]}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.yellow }} />
              <Text style={{ fontFamily: MONO_I, fontSize: 11.5, letterSpacing: 0.6, color: STAGE.muted }}>(listening.)</Text>
            </Animated.View>
          </View>
        </View>

        <Cue who="RILEY" beat={P2} t={t}>
          <Animated.Text style={[{ fontFamily: MONO, fontSize: 15, lineHeight: 22, color: STAGE.fg }, line3]}>I waited an hour. I almost left.</Animated.Text>
        </Cue>
      </Animated.View>
    </View>
  );
}

/** A partner cue: the name, and a dot that breathes beside it while the line sounds. */
function Cue({ who, beat, t, children }: { who: string; beat: { from: number; to: number }; t: SharedValue<number>; children: React.ReactNode }) {
  const dot = useAnimatedStyle(() => ({
    opacity: seg(t.value, beat.from, beat.from + 200) * (1 - seg(t.value, beat.to, beat.to + 150)),
    transform: [{ scale: 0.8 + 0.3 * Math.abs(Math.sin((t.value / 1000) * Math.PI * 1.6)) }],
  }));
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontFamily: SANS_B, fontSize: 10, letterSpacing: 1.6, color: STAGE.muted }}>{who}</Text>
        <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#e0a24a' }, dot]} />
      </View>
      <View style={{ marginTop: 4 }}>{children}</View>
    </View>
  );
}

/** One word of your line: comes up to full ink at its moment, underlined while it is the one. */
function Word({ word, i, t, yellow }: { word: string; i: number; t: SharedValue<number>; yellow: string }) {
  const at = YOU.from + 400 + i * WORD_MS;
  const text = useAnimatedStyle(() => ({ opacity: 0.4 + 0.6 * seg(t.value, at, at + 160) * (1 - 0.45 * seg(t.value, YOU.to + 300, YOU.to + 500)) }));
  const rule = useAnimatedStyle(() => ({ opacity: seg(t.value, at, at + 120) * (1 - seg(t.value, at + WORD_MS, at + WORD_MS + 120)) }));
  return (
    <View style={{ marginRight: 9 }}>
      <Animated.Text style={[{ fontFamily: MONO, fontSize: 19, lineHeight: 27, color: STAGE.fg }, text]}>{word}</Animated.Text>
      <Animated.View style={[{ height: 2, borderRadius: 1, backgroundColor: yellow, marginTop: -3 }, rule]} />
    </View>
  );
}

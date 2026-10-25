import { useCallback } from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
 * How the partner works, in one looping picture with almost no words, the
 * way the board has one for auditions. Four beats on the dark stage:
 *
 *   1. sides come in: a page drops onto the stage and its two names appear
 *   2. a part is chosen: one name takes the gel; beside the other, a voice
 *      is heard (a dot breathes by a name with a little speaker)
 *   3. the read: the partner's line sounds, your line lights word by word,
 *      the one you are on underlined, and on the last word the partner comes
 *      straight back in
 *   4. a breath, and it goes round again
 *
 * One clock drives everything on the UI thread, held half a second after
 * the sheet lands so the first beat is seen, parked on the read with motion
 * reduced. Always a dark stage, on both themes: one lighting plot, as the
 * board's loop is.
 */

const LOOP = 13000;
const HOLD = 500;
const H = 316;

const STAGE = {
  bg: '#17100c',
  line: 'rgba(226, 212, 190, 0.28)',
  fg: '#f1e8d6',
  muted: '#8f7f6c',
  paper: '#f7f1e5',
  ink: '#1c1511',
  inkMuted: '#6b5e51',
};

const MONO = 'CourierPrime_400Regular';
const MONO_I = 'CourierPrime_400Regular_Italic';
const SANS_B = 'BricolageGrotesque_600SemiBold';

/** The beats, in ms on the loop. */
const PAGE = { from: 300, to: 1500 }; // the page drops in
const NAMES = { from: 1500, to: 2200 }; // the two names appear
const PICK = { from: 2600, to: 3200 }; // one name takes the gel
const HEAR = { from: 3400, to: 4900 }; // a voice is heard for the other
const CARD_OUT = { from: 5100, to: 5600 }; // the card gives way to the read
const P1 = { from: 5700, to: 7500 }; // partner line 1 sounds
const YOU = { from: 7700, to: 10400 }; // your line, word by word
const P2 = { from: 10450, to: 12000 }; // partner line 2 sounds
const WORDS = ['I', 'know.', "I'm", 'sorry.'];
const WORD_MS = (YOU.to - YOU.from - 500) / WORDS.length;

function seg(v: number, a: number, b: number): number {
  'worklet';
  return interpolate(v, [a, b], [0, 1], Extrapolation.CLAMP);
}

export function PartnerScene({ style }: { style?: ViewStyle }) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const t = useSharedValue(reduce ? 10300 : 0);

  useFocusEffect(
    useCallback(() => {
      if (reduce) { t.value = 10300; return; }
      t.value = 0;
      t.value = withDelay(HOLD, withRepeat(withTiming(LOOP, { duration: LOOP, easing: Easing.linear }), -1, false));
      return () => cancelAnimation(t);
    }, [reduce, t]),
  );

  const all = useAnimatedStyle(() => ({ opacity: 1 - seg(t.value, 12400, 12900) }));
  // Beat 1 and 2: the card with the sides.
  const card = useAnimatedStyle(() => {
    const k = seg(t.value, PAGE.from, PAGE.to);
    return {
      opacity: k * (1 - seg(t.value, CARD_OUT.from, CARD_OUT.to)),
      transform: [{ translateY: interpolate(k, [0, 1], [-60, 0]) }, { rotate: `${interpolate(k, [0, 1], [-4, -1])}deg` }, { scale: 1 - 0.04 * seg(t.value, CARD_OUT.from, CARD_OUT.to) }],
    };
  });
  const names = useAnimatedStyle(() => ({ opacity: seg(t.value, NAMES.from, NAMES.to) }));
  const pickA = useAnimatedStyle(() => ({ backgroundColor: `rgba(255, 211, 0, ${seg(t.value, PICK.from, PICK.to)})` }));
  const youTag = useAnimatedStyle(() => ({ opacity: seg(t.value, PICK.from + 200, PICK.to + 100) }));
  const hearDot = useAnimatedStyle(() => ({
    opacity: seg(t.value, HEAR.from, HEAR.from + 200) * (1 - seg(t.value, HEAR.to, HEAR.to + 150)),
    transform: [{ scale: 0.8 + 0.35 * Math.abs(Math.sin((t.value / 1000) * Math.PI * 1.8)) }],
  }));
  const hearIcon = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * seg(t.value, HEAR.from - 200, HEAR.from) }));
  // Beat 3: the read.
  const read = useAnimatedStyle(() => ({ opacity: seg(t.value, CARD_OUT.to - 100, CARD_OUT.to + 300) }));
  const line1 = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * seg(t.value, P1.from, P1.from + 200) * (1 - 0.45 * seg(t.value, YOU.from, YOU.from + 300)) }));
  const line3 = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * seg(t.value, P2.from, P2.from + 200) }));
  const yours = useAnimatedStyle(() => ({ opacity: seg(t.value, YOU.from - 100, YOU.from + 200) * (1 - seg(t.value, YOU.to, YOU.to + 250)) }));
  const listening = useAnimatedStyle(() => ({ opacity: seg(t.value, YOU.from, YOU.from + 300) * (1 - seg(t.value, YOU.to - 100, YOU.to + 150)) }));
  const gel = useAnimatedStyle(() => ({ opacity: 0.05 + 0.08 * (seg(t.value, PICK.from, PICK.to) * (1 - seg(t.value, CARD_OUT.from, CARD_OUT.to)) + seg(t.value, YOU.from, YOU.from + 600) * (1 - seg(t.value, YOU.to, YOU.to + 400))) }));

  return (
    <View
      accessible
      accessibilityLabel="Your sides come in, you pick your part and hear a voice for the other, then the partner reads its line, your line lights up word by word as you say it, and on your last word the partner answers at once."
      style={[{ height: H, borderRadius: 18, backgroundColor: STAGE.bg, borderWidth: 1, borderColor: STAGE.line, overflow: 'hidden' }, style]}
    >
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -150, left: -130, width: 340, height: 340, borderRadius: 170, backgroundColor: c.yellow }, gel]} />
      <Animated.View style={[{ flex: 1 }, all]}>
        {/* Beats 1 and 2: the page, the names, the pick, the voice. */}
        <Animated.View style={[{ position: 'absolute', left: 22, right: 22, top: 26 }, card]}>
          <View style={{ borderRadius: 10, backgroundColor: STAGE.paper, paddingHorizontal: 16, paddingVertical: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="document-text-outline" size={14} color={STAGE.inkMuted} />
              <Text style={{ fontFamily: SANS_B, fontSize: 10, letterSpacing: 1.6, color: STAGE.inkMuted }}>LATE.PDF</Text>
            </View>
            <View style={{ marginTop: 10, gap: 5 }}>
              {[0.92, 0.7, 0.84, 0.5].map((w, i) => <View key={i} style={{ height: 6, width: `${w * 100}%`, borderRadius: 3, backgroundColor: 'rgba(28,21,17,0.12)' }} />)}
            </View>
            <Animated.View style={[{ marginTop: 14, flexDirection: 'row', gap: 8 }, names]}>
              <Animated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: STAGE.ink }, pickA]}>
                <Text style={{ fontFamily: SANS_B, fontSize: 12, letterSpacing: 0.4, color: STAGE.ink }}>ALEX</Text>
                <Animated.Text style={[{ fontFamily: MONO_I, fontSize: 11, color: STAGE.ink }, youTag]}>(you.)</Animated.Text>
              </Animated.View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(28,21,17,0.35)' }}>
                <Text style={{ fontFamily: SANS_B, fontSize: 12, letterSpacing: 0.4, color: STAGE.ink }}>RILEY</Text>
                <Animated.View style={hearIcon}><Ionicons name="volume-medium-outline" size={13} color={STAGE.ink} /></Animated.View>
                <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#e0a24a' }, hearDot]} />
              </View>
            </Animated.View>
          </View>
        </Animated.View>

        {/* Beat 3: the read. */}
        <Animated.View style={[{ flex: 1, paddingHorizontal: 20, paddingTop: 22, gap: 18 }, read]}>
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

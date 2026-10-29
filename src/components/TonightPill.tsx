import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { clock, useElapsed, useTonightSession } from '../lib/tonightTimer';
import type { Streak } from '../rehearsal/streak';
import { useTheme } from '../theme/ThemeContext';

const MARK = require('../../assets/ghostlight-lamp.png');
const SANS_B = 'BricolageGrotesque_600SemiBold';

/**
 * Tonight, top left of Search, saying where it stands: "Start tonight" with
 * the lamp down before there is any work in it, the clock while a session
 * runs (the lamp breathing), and "Night 4" with the lamp up once tonight is
 * in. A tap opens tonight.
 */
export function TonightPill({ streak, glow, accent, onPress }: { streak: Streak; glow: string; accent: string; onPress: () => void }) {
  const { colors: c } = useTheme();
  const session = useTonightSession();
  const seconds = useElapsed(session);
  const running = session != null && session.endedAt == null;
  const ended = session != null && session.endedAt != null;
  const lit = running || streak.today;

  const breath = useSharedValue(1);
  useEffect(() => {
    if (running) {
      breath.value = withRepeat(withSequence(withTiming(0.45, { duration: 1100, easing: Easing.inOut(Easing.sin) }), withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) })), -1);
    } else {
      cancelAnimation(breath);
      breath.value = withTiming(1, { duration: 200 });
    }
  }, [running, breath]);
  const lamp = useAnimatedStyle(() => ({ opacity: breath.value }));

  const label = running ? clock(seconds) : ended ? 'Finish tonight' : streak.today ? `Night ${streak.days}` : 'Start tonight';
  const a11y = running
    ? `Tonight's session, ${clock(seconds)}`
    : ended ? 'Finish tonight' : streak.today ? `Night ${streak.days}, tonight is in` : 'Start tonight';

  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint="Opens tonight"
      style={({ pressed }) => ({
        height: 42, paddingLeft: 6, paddingRight: 16, borderRadius: 21, flexDirection: 'row', alignItems: 'center', gap: 8,
        borderWidth: 1.5, borderColor: running || ended ? accent : c.border, opacity: pressed ? 0.7 : 1,
      })}
    >
      <Animated.View style={[{ shadowColor: glow, shadowOpacity: lit ? 0.8 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }, lamp]}>
        {/* Down, not gone: the lamp before tonight's work is still plainly a lamp. */}
        <View style={{ opacity: lit ? 1 : 0.7 }}>
          <Image source={MARK} style={{ width: 34, height: 34, marginVertical: -4 }} contentFit="contain" accessibilityIgnoresInvertColors />
        </View>
      </Animated.View>
      <Text style={{ fontFamily: SANS_B, fontSize: 14.5, color: running || ended || streak.today ? accent : c.foreground, fontVariant: ['tabular-nums'] }}>{label}</Text>
    </Pressable>
  );
}

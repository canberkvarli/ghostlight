import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const SANS_X = 'BricolageGrotesque_700Bold';

/**
 * The week, Monday first: a night in the work is a filled circle with a check
 * in it, today is ringed, the rest are empty. `stamp` is the night just
 * earned: its circle fills and the check lands, once, as it is shown.
 */
export function WeekMarks({ week, stamp, size = 30 }: { week: boolean[]; stamp?: boolean; size?: number }) {
  const { colors: c } = useTheme();
  const today = (new Date().getDay() + 6) % 7;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {LETTERS.map((d, i) => {
        const now = i === today;
        const on = week[i] || (now && stamp);
        return (
          <View key={i} style={{ alignItems: 'center', gap: 6 }}>
            <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : now ? 1.5 : 1, borderColor: now ? c.accentText : c.divider }}>
              {on ? <Mark size={size} fresh={now && stamp && !week[i]} /> : null}
            </View>
            <Text style={{ fontFamily: SANS_X, fontSize: 10, letterSpacing: 1, color: now ? c.accentText : c.chevron }}>{d}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Mark({ size, fresh }: { size: number; fresh?: boolean }) {
  const { colors: c } = useTheme();
  const fill = useSharedValue(fresh ? 0 : 1);
  const check = useSharedValue(fresh ? 0 : 1);
  useEffect(() => {
    if (!fresh) return;
    fill.value = withDelay(180, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
    check.value = withDelay(420, withSpring(1, { damping: 11, stiffness: 180 }));
  }, [fresh, fill, check]);
  const disc = useAnimatedStyle(() => ({ opacity: fill.value, transform: [{ scale: 0.55 + 0.45 * fill.value }] }));
  const tick = useAnimatedStyle(() => ({ opacity: Math.min(1, check.value * 1.4), transform: [{ scale: 0.4 + 0.6 * check.value }] }));
  return (
    <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: c.yellow, alignItems: 'center', justifyContent: 'center' }, disc]}>
      <Animated.View style={tick}>
        <Ionicons name="checkmark" size={Math.round(size * 0.52)} color={c.ink} />
      </Animated.View>
    </Animated.View>
  );
}

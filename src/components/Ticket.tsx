import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import type { Nudge } from '../lib/nudges';
import { useTheme } from '../theme/ThemeContext';

/**
 * The ticket: one torn paper stub under the search field with one sentence on
 * it, the most urgent thing today. Tap it and you are there. Slide it aside
 * and that sentence is not shown again today.
 *
 * Paper, Courier italic, lowercase, in brackets, the name in bold roman. The
 * perforated edge on the left is what makes it a ticket and not a button.
 */

const DISMISS_AT = 96;

export function Ticket({ nudge, onPress, onDismiss }: { nudge: Nudge; onPress: () => void; onDismiss: () => void }) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const x = useSharedValue(0);
  const shown = useSharedValue(0);

  useEffect(() => {
    shown.value = 0;
    shown.value = withTiming(1, { duration: reduce ? 120 : 360, easing: Easing.out(Easing.cubic) });
  }, [nudge.key, reduce, shown]);

  const dismiss = () => onDismiss();

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      x.value = e.translationX;
    })
    .onEnd((e) => {
      const gone = Math.abs(x.value) > DISMISS_AT || Math.abs(e.velocityX) > 900;
      if (gone) {
        const dir = x.value < 0 || e.velocityX < 0 ? -1 : 1;
        x.value = withTiming(dir * 420, { duration: 200 });
        shown.value = withTiming(0, { duration: 180 }, (done) => {
          if (done) runOnJS(dismiss)();
        });
      } else {
        x.value = withSpring(0, { damping: 22, stiffness: 260, mass: 0.7 });
      }
    });

  const style = useAnimatedStyle(() => ({
    opacity: shown.value * (1 - Math.min(1, Math.abs(x.value) / 260) * 0.6),
    transform: [
      { translateX: x.value },
      { translateY: reduce ? 0 : (1 - shown.value) * 8 },
      { rotate: `${-0.3 + x.value / 600}deg` },
    ],
  }));

  const text = {
    fontFamily: 'CourierPrime_400Regular_Italic',
    fontSize: 13.5,
    lineHeight: 18,
    letterSpacing: 0.3,
    color: c.paperMuted,
  } as const;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[style, { width: '100%' }]}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={nudge.accessibility}
          accessibilityHint="Swipe to put it away for today"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'stretch',
            minHeight: 44,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: c.cardBorder,
            backgroundColor: c.paper,
            overflow: 'hidden',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {/* The stub: a strip of gel with the perforation beside it. */}
          <View style={{ width: 14, backgroundColor: c.yellow }} />
          <View style={{ width: 0, borderLeftWidth: 1.5, borderStyle: 'dashed', borderColor: c.cardBorder }} />
          <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' }}>
            <Text numberOfLines={2} style={text}>
              {nudge.pre}
              {nudge.name ? (
                <Text style={{ fontFamily: 'CourierPrime_700Bold', fontStyle: 'normal', color: c.paperInk }}>{nudge.name}</Text>
              ) : null}
              {nudge.post}
            </Text>
          </View>
          <View style={{ justifyContent: 'center', paddingRight: 10 }}>
            <Ionicons name="chevron-forward" size={14} color={c.paperFaint} />
          </View>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

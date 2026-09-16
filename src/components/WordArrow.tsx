import { Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors } from '../theme/tokens';

/**
 * A word and an arrow whose gap opens on press (12 → 18pt).
 *
 * This WAS the primary action everywhere. In v2 `PrimaryPill` is — an ink fill
 * with a gel arrow disc — and this survives as the quieter secondary it always
 * really was, still in use on Auth and Paywall. Its motion is the one thing that
 * carried forward: the pill translates its disc on press for exactly the same
 * reason, because a gap opening under a thumb reads as the button leaving.
 *
 * The uppercase-and-2.5pt-tracking treatment went with Montserrat. Bricolage has
 * enough voice at 14pt that shouting a secondary action makes it louder than the
 * primary one sitting next to it.
 */
export function WordArrow({
  label,
  onPress,
  tint,
  disabled,
  size = 14,
  haptic = 'selection',
}: {
  label: string;
  onPress: () => void;
  /** House accent, as hex. Defaults to the amber stage glow. */
  tint?: string;
  disabled?: boolean;
  size?: number;
  haptic?: 'selection' | 'soft' | 'medium' | 'none';
}) {
  const tintC = tint ?? colors.stageGlow;
  const gap = useSharedValue(12);
  const arrowStyle = useAnimatedStyle(() => ({ marginLeft: gap.value }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={14}
      onPressIn={() => {
        if (haptic === 'soft') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
        else if (haptic === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        else if (haptic === 'selection') Haptics.selectionAsync().catch(() => {});
        gap.value = withTiming(18, { duration: 120 });
      }}
      onPressOut={() => (gap.value = withTiming(12, { duration: 260 }))}
      style={{ flexDirection: 'row', alignItems: 'center', opacity: disabled ? 0.5 : 1, paddingVertical: 6 }}
    >
      <Text
        style={{
          fontFamily: 'BricolageGrotesque_700Bold',
          fontSize: size + 1,
          letterSpacing: 0.2,
          color: tintC,
        }}
      >
        {label}
      </Text>
      <Animated.View style={arrowStyle}>
        <Ionicons name="arrow-forward" size={Math.round(size * 1.4)} color={tintC} />
      </Animated.View>
    </Pressable>
  );
}

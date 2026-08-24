import { Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { colors } from '../theme/tokens';

/**
 * The primary action, everywhere (handoff §3): not a filled slab — a word and an
 * arrow whose gap opens on press (12 → 18px). Montserrat 600 / uppercase / 2.5px
 * in the house accent. Used for Search, Request it, Begin, Enter, Done, Stay on,
 * Start the trial. The only real rectangle in the app is Sign in with Apple.
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
          fontFamily: 'Montserrat_600SemiBold',
          fontSize: size,
          letterSpacing: 2.5,
          textTransform: 'uppercase',
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

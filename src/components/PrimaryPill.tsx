import { Pressable, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../theme/ThemeContext';
import { colors } from '../theme/tokens';

/**
 * The primary action, everywhere: Search's field disc aside, this is the button.
 *
 * An ink fill with cream type and a gel-yellow disc carrying an ink arrow. It
 * replaces WordArrow at every primary site (Enter, Request it, Sign in, Stay on,
 * Sign out) and keeps the one thing WordArrow got right — the gap opening under
 * your thumb — by translating the disc 4pt instead of animating a margin.
 *
 * Why not yellow-on-ink type: the gel is a fill behind ink and nothing else. It
 * sits at about 1.2:1 against cream, so a yellow word on this pill would be a
 * decision to make the label unreadable in exchange for it being bright.
 *
 * `variant="outline"` is the secondary: no fill, the same geometry, the label in
 * the current foreground. Used for Cancel and Try again, never for the action
 * the screen is actually asking for.
 */

const AnimatedView = Animated.createAnimatedComponent(View);

export function PrimaryPill({
  label,
  onPress,
  disabled,
  variant = 'primary',
  /** 52 on a screen, 44 inside a card, 50 in a dialog. */
  height = 52,
  /** Stretch to the container instead of hugging the label. */
  block = false,
  haptic = 'soft',
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
  height?: number;
  block?: boolean;
  haptic?: 'selection' | 'soft' | 'medium' | 'none';
  style?: ViewStyle;
}) {
  const { colors: c } = useTheme();
  const reduce = useReducedMotion();
  const press = useSharedValue(0);

  const disc = Math.round(height * 0.73); // 38 at 52, 34 at 46
  const outline = variant === 'outline';

  // The whole pill takes the press, the disc takes a little more — so the gap
  // between word and arrow opens rather than the button simply getting bigger.
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + press.value * 0.03 }],
  }));
  const discStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: press.value * 4 }],
  }));

  const fire = (v: number) => {
    if (reduce) return;
    press.value = withTiming(v, { duration: v ? 110 : 280 });
  };

  /**
   * The fill has to separate from the floor it is standing on, and ink does not
   * do that on the ink stage: #15110f against #130b08 is about 1.1:1, so on a
   * dark screen the pill was an invisible rectangle that you located by its
   * border, its label and its gel disc. It read as three loose pieces rather
   * than one button — most obviously on the launch screen, where Enter is the
   * only thing to press.
   *
   * On paper, ink is exactly right and stays. On the stage the fill lifts to a
   * warm near-black that is visibly a shape, and the border comes up with it.
   */
  const fill = outline ? 'transparent' : c.isLight ? colors.ink : '#241a14';
  // The fill only lifts the pill to 1.14:1 off the stage, so on the dark scheme
  // the BORDER is what draws the button's edge — and 1.4.11 asks a control
  // boundary for 3:1. #6b5b4e measured 2.99. One step warmer clears it at 3.22.
  const edge = outline ? c.foreground : c.isLight ? colors.ink : '#70604f';

  return (
    // `alignSelf` is deliberately left alone unless `block` asks for stretch.
    // Forcing `flex-start` here meant the pill pinned itself to the left edge of
    // every centred parent — it ignored the launch screen's `alignItems:
    // 'center'` entirely — and top-aligned itself inside any row. A caller that
    // wants it to hug in a stretching column says so in `style`.
    <Animated.View style={[pillStyle, block ? { alignSelf: 'stretch' } : null, style]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: Boolean(disabled) }}
        onPressIn={() => {
          if (haptic === 'soft') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
          else if (haptic === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          else if (haptic === 'selection') Haptics.selectionAsync().catch(() => {});
          fire(1);
        }}
        onPressOut={() => fire(0)}
        style={{
          height,
          flexDirection: 'row',
          alignItems: 'center',
          // The label needs real room on the left and the disc sits almost flush
          // right, which is what makes the arrow read as leaving the button.
          paddingLeft: 22,
          paddingRight: outline ? 22 : (height - disc) / 2,
          borderRadius: 999,
          borderWidth: 1.5,
          borderColor: edge,
          backgroundColor: fill,
          opacity: disabled ? 0.45 : 1,
          justifyContent: outline ? 'center' : 'space-between',
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            fontFamily: 'BricolageGrotesque_700Bold',
            fontSize: Math.min(16, Math.round(height * 0.3)),
            letterSpacing: 0.2,
            color: outline ? c.foreground : '#f7f3ec',
          }}
        >
          {label}
        </Text>
        {outline ? null : (
          <AnimatedView
            style={[
              discStyle,
              {
                marginLeft: 12,
                width: disc,
                height: disc,
                borderRadius: 999,
                backgroundColor: c.yellow,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
          >
            <Ionicons name="arrow-forward" size={Math.round(disc * 0.42)} color={colors.ink} />
          </AnimatedView>
        )}
      </Pressable>
    </Animated.View>
  );
}

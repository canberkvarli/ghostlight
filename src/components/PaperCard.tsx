import { useMemo } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { radius } from '../theme/tokens';
import { useTheme } from '../theme/ThemeContext';

/**
 * A page of sides, pinned to the stage.
 *
 * Every card in v2 is this: cream paper, a 1.5pt ink rule all the way round, a
 * six-point corner, and a slight rotation so a column of them reads as paper
 * someone put down rather than a table someone rendered. Crucially it is paper
 * on BOTH schemes — see the note in theme/tokens.ts.
 *
 * ## The hard shadow
 *
 * The lit card sits on a block of gel yellow offset down and right with no blur
 * at all, the way a two-colour print misregisters. React Native cannot draw
 * that: `shadowRadius: 0` still lays a soft alpha edge on iOS, `shadowOpacity`
 * is capped by the layer's own opacity, and `overflow: 'hidden'` — which every
 * card with a poster in it needs — clips the shadow away entirely. So the block
 * is a real View sitting behind the paper. It also animates better: offset is a
 * transform, which stays on the UI thread, where an animated `shadowOffset`
 * crosses to the shadow layer on every frame.
 *
 * ## Lit
 *
 * `lit` is the results list's scroll-spotlight value (0–1, derived from scroll
 * offset alone — see MonologueCard). It drives three things at once, because
 * they are one gesture: the yellow block slides out from under the card, the
 * rotation eases to square, and the paper comes up out of its dim. `pressed`
 * does the same to the rotation on its own, so a card you are touching
 * straightens whether or not the light is on it.
 */

export interface PaperCardProps {
  children: React.ReactNode;
  /**
   * Resting rotation in degrees. Alternate −0.6 / +0.5 / −0.4 down a list; a
   * uniform tilt reads as a skewed table, not as paper.
   */
  rotate?: number;
  /** Hard offset shadow at full strength, in points. 0 for no block. */
  shadow?: number;
  /** The block's colour. Gel yellow on the stage, violet in the cinema. */
  shadowColor?: string;
  /**
   * 0–1. Slides the block out, squares the rotation, lifts the dim. Omit for a
   * card that is simply always lit (Saves, Read, the plan card).
   */
  lit?: SharedValue<number>;
  /** 0–1 press value; squares the rotation the same way `lit` does. */
  pressed?: SharedValue<number>;
  /** How far an unlit card recedes. 1 = never dims. */
  dimTo?: number;
  /** Paper override — the brighter cream, or a poster-backed face. */
  background?: string;
  /** Applied to the paper itself (padding, height, overflow). */
  style?: ViewStyle;
  /** Applied to the rotating wrapper (margins, flex). */
  wrapperStyle?: ViewStyle;
}

export function PaperCard({
  children,
  rotate = 0,
  shadow = 0,
  shadowColor,
  lit,
  pressed,
  dimTo = 1,
  background,
  style,
  wrapperStyle,
}: PaperCardProps) {
  const { colors: c } = useTheme();
  const block = shadowColor ?? c.yellow;

  // One value for "this card is the subject" — the light, or your thumb.
  const attention = useDerivedValue(() => {
    const l = lit ? lit.value : 1;
    const p = pressed ? pressed.value : 0;
    return Math.max(l, p);
  });

  const wrapper = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate * (1 - attention.value)}deg` }],
    opacity: dimTo + attention.value * (1 - dimTo),
  }));

  // Translated rather than inset so the block can slide with no relayout. It is
  // absolutely filling the wrapper, which the paper (in normal flow) sizes.
  const blockStyle = useAnimatedStyle(() => {
    const d = shadow * attention.value;
    return { opacity: shadow > 0 ? attention.value : 0, transform: [{ translateX: d }, { translateY: d }] };
  });

  const paper = useMemo<ViewStyle>(
    () => ({
      borderRadius: radius.card,
      borderWidth: 1.5,
      borderColor: c.ink,
      backgroundColor: background ?? c.paper,
    }),
    [c.ink, c.paper, background],
  );

  return (
    <Animated.View style={[wrapper, wrapperStyle]}>
      {shadow > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            blockStyle,
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: radius.card,
              backgroundColor: block,
            },
          ]}
        />
      ) : null}
      <View style={[paper, style]}>{children}</View>
    </Animated.View>
  );
}

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeContext';

/** The two cards waiting behind the top one show this much at the head. */
export const DECK_PEEK = 22;
/** The row of the two buttons under the deck. */
export const DECK_DOCK = 64;

const FLY_MS = 320;

/**
 * A deck you throw. One card at a time, the next two waiting behind it, a
 * touch smaller and a touch higher so their heads show. Drag the top card and
 * it tilts with your thumb; past a third of the screen it flies, right to
 * keep, left to pass, and the one behind comes up to full size as it goes.
 * A tap on the card is the card's own business (it opens the speech).
 *
 * Everything that moves is a function of the drag on the UI thread. The index
 * moves on the JS thread once the card has gone. Two round buttons under the
 * deck do the same two things for a thumb that would rather tap, and for
 * anyone with motion reduced, where the throw is a fade.
 */
export function Deck<T>({
  items,
  keyOf,
  deckKey,
  height,
  renderCard,
  onKeep,
  onPass,
  reduce,
  keepLabel = 'keep',
  passLabel = 'pass',
}: {
  items: T[];
  keyOf: (item: T) => string;
  /** A new value is a new deck, back to the first card. The list's own identity is not: it changes on every refetch. */
  deckKey: string;
  /** The whole deck's height, dock included. */
  height: number;
  renderCard: (item: T, first: boolean) => ReactNode;
  onKeep: (item: T) => void;
  onPass: (item: T) => void;
  reduce: boolean;
  keepLabel?: string;
  passLabel?: string;
}) {
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  const [at, setAt] = useState(0);
  const cardH = Math.max(0, height - DECK_DOCK - DECK_PEEK);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const throwing = useSharedValue(0); // 1 while a card is in the air; the next one may not be grabbed

  // A new house is a new deck.
  useEffect(() => { setAt(0); x.value = 0; y.value = 0; throwing.value = 0; }, [deckKey, x, y, throwing]);

  const top = items.length ? items[at % items.length] : undefined;
  const second = items.length > 1 ? items[(at + 1) % items.length] : undefined;
  const third = items.length > 2 ? items[(at + 2) % items.length] : undefined;

  const gone = useCallback((dir: 1 | -1) => {
    const item = items[at % items.length];
    if (item) (dir > 0 ? onKeep : onPass)(item);
    setAt((n) => n + 1);
    x.value = 0;
    y.value = 0;
    throwing.value = 0;
  }, [at, items, onKeep, onPass, x, y, throwing]);

  const fly = useCallback((dir: 1 | -1) => {
    'worklet';
    throwing.value = 1;
    if (reduce) {
      x.value = withTiming(dir * width * 0.4, { duration: 160 }, () => runOnJS(gone)(dir));
      return;
    }
    x.value = withTiming(dir * width * 1.5, { duration: FLY_MS, easing: Easing.in(Easing.cubic) }, () => runOnJS(gone)(dir));
    y.value = withTiming(y.value + 40, { duration: FLY_MS });
  }, [gone, reduce, throwing, width, x, y]);

  const haptic = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }, []);

  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-24, 24])
    .onUpdate((e) => {
      if (throwing.value) return;
      x.value = e.translationX;
      y.value = e.translationY;
    })
    .onEnd((e) => {
      if (throwing.value) return;
      const far = Math.abs(x.value) > width * 0.34;
      const fast = Math.abs(e.velocityX) > 900;
      if (far || fast) {
        const dir: 1 | -1 = (far ? x.value : e.velocityX) > 0 ? 1 : -1;
        runOnJS(haptic)();
        fly(dir);
      } else {
        x.value = withSpring(0, { damping: 18, stiffness: 220 });
        y.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value * 0.35 },
      { rotate: `${interpolate(x.value, [-width, 0, width], [-14, 0, 14], Extrapolation.CLAMP)}deg` },
    ],
    opacity: reduce ? interpolate(Math.abs(x.value), [0, width * 0.4], [1, 0], Extrapolation.CLAMP) : 1,
  }));
  const secondStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.abs(x.value) / (width * 0.5));
    return { transform: [{ translateY: interpolate(p, [0, 1], [-DECK_PEEK / 2, 0]) }, { scale: interpolate(p, [0, 1], [0.96, 1]) }], opacity: interpolate(p, [0, 1], [0.92, 1]) };
  });
  const thirdStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.abs(x.value) / (width * 0.5));
    return { transform: [{ translateY: interpolate(p, [0, 1], [-DECK_PEEK, -DECK_PEEK / 2]) }, { scale: interpolate(p, [0, 1], [0.92, 0.96]) }], opacity: interpolate(p, [0, 1], [0.8, 0.92]) };
  });
  const keepStamp = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, width * 0.22], [0, 1], Extrapolation.CLAMP) }));
  const passStamp = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-width * 0.22, 0], [1, 0], Extrapolation.CLAMP) }));

  const stamp = (label: string, tilt: number, side: 'left' | 'right') => (
    <View pointerEvents="none" style={{ position: 'absolute', top: 22, [side]: 22, transform: [{ rotate: `${tilt}deg` }], borderWidth: 3, borderColor: c.yellow, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 2 }}>
      <Text style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 26, letterSpacing: 3, color: c.yellow, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );

  const button = (label: string, icon: 'close' | 'bookmark', onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => ({ width: 54, height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={icon === 'close' ? 24 : 20} color={icon === 'bookmark' ? c.yellow : c.mutedForeground} />
    </Pressable>
  );

  // The dock's throws go through the same flight as a thumb's.
  const throwFrom = (dir: 1 | -1) => () => { if (!top || throwing.value) return; haptic(); fly(dir); };

  return (
    <View style={{ height }}>
      <View style={{ height: cardH + DECK_PEEK, paddingTop: DECK_PEEK }}>
        {third ? (
          <Animated.View key={`${keyOf(third)}-3`} pointerEvents="none" style={[thirdStyle, { position: 'absolute', left: 0, right: 0, top: DECK_PEEK, height: cardH, transformOrigin: 'top' }]}>
            {renderCard(third, false)}
          </Animated.View>
        ) : null}
        {second ? (
          <Animated.View key={`${keyOf(second)}-2`} pointerEvents="none" style={[secondStyle, { position: 'absolute', left: 0, right: 0, top: DECK_PEEK, height: cardH, transformOrigin: 'top' }]}>
            {renderCard(second, false)}
          </Animated.View>
        ) : null}
        {top ? (
          <GestureDetector gesture={pan}>
            <Animated.View key={`${keyOf(top)}-1`} style={[topStyle, { position: 'absolute', left: 0, right: 0, top: DECK_PEEK, height: cardH }]}>
              {renderCard(top, at === 0)}
              <Animated.View pointerEvents="none" style={[keepStamp, { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }]}>{stamp(keepLabel, -14, 'left')}</Animated.View>
              <Animated.View pointerEvents="none" style={[passStamp, { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }]}>{stamp(passLabel, 14, 'right')}</Animated.View>
            </Animated.View>
          </GestureDetector>
        ) : null}
      </View>
      <View style={{ height: DECK_DOCK, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36 }}>
        {button(passLabel, 'close', throwFrom(-1))}
        {button(keepLabel, 'bookmark', throwFrom(1))}
      </View>
    </View>
  );
}

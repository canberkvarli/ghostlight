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
  type SharedValue,
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
 * keep, left to pass, and the one behind rises to the top as it goes.
 *
 * The deck owns every gesture on the stack: the pan, the tap that opens the
 * speech and the hold that shares it. They are exclusive, so a throw that
 * ends over the card is never also a tap, which is what made a pass open the
 * speech. Cards keep their identity across slots (keyed by the item, not the
 * slot), so the one behind becomes the one on top without being remounted:
 * no picture reloads, no gradient redraws, no flicker at the throw.
 *
 * Everything that moves is a function of the drag and the rise on the UI
 * thread. Two round buttons under the deck throw the same way for a thumb
 * that would rather tap, and for anyone with motion reduced, where the throw
 * is a fade.
 */
export function Deck<T>({
  items,
  keyOf,
  deckKey,
  height,
  renderCard,
  onKeep,
  onPass,
  onOpen,
  onHold,
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
  /** A tap on the top card. */
  onOpen: (item: T) => void;
  /** A hold on the top card. */
  onHold?: (item: T) => void;
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
  // 1 the instant a card has gone, easing to 0: the card behind rises to the top, rather than snapping.
  const rise = useSharedValue(0);

  // A new house is a new deck.
  useEffect(() => { setAt(0); x.value = 0; y.value = 0; throwing.value = 0; rise.value = 0; }, [deckKey, x, y, throwing, rise]);

  const n = items.length;
  const top = n ? items[at % n] : undefined;
  const second = n > 1 ? items[(at + 1) % n] : undefined;
  const third = n > 2 ? items[(at + 2) % n] : undefined;

  const gone = useCallback((dir: 1 | -1) => {
    const item = items[at % Math.max(1, items.length)];
    if (item) (dir > 0 ? onKeep : onPass)(item);
    setAt((k) => k + 1);
    x.value = 0;
    y.value = 0;
    throwing.value = 0;
    rise.value = 1;
    rise.value = withTiming(0, { duration: reduce ? 120 : 260, easing: Easing.out(Easing.cubic) });
  }, [at, items, onKeep, onPass, x, y, throwing, rise, reduce]);

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
  const openTop = useCallback(() => { if (top) onOpen(top); }, [top, onOpen]);
  const holdTop = useCallback(() => { if (top && onHold) onHold(top); }, [top, onHold]);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-28, 28])
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
  const tap = Gesture.Tap().maxDuration(300).onEnd((_e, ok) => { if (ok && !throwing.value) runOnJS(openTop)(); });
  const hold = Gesture.LongPress().minDuration(420).onStart(() => { if (!throwing.value) runOnJS(holdTop)(); });
  // A pan that activates wins outright; a hold or a tap only counts when no pan did.
  const gestures = Gesture.Exclusive(pan, hold, tap);

  const keepStamp = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, width * 0.22], [0, 1], Extrapolation.CLAMP) }));
  const passStamp = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-width * 0.22, 0], [1, 0], Extrapolation.CLAMP) }));

  const stamp = (label: string, tilt: number, side: 'left' | 'right') => (
    <View pointerEvents="none" style={{ position: 'absolute', top: 22, [side]: 22, transform: [{ rotate: `${tilt}deg` }], borderWidth: 3, borderColor: c.primary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 2 }}>
      <Text style={{ fontFamily: 'CourierPrime_700Bold', fontSize: 26, letterSpacing: 3, color: c.primary, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );

  const button = (label: string, icon: 'close' | 'bookmark', onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => ({ width: 54, height: 54, borderRadius: 27, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={icon === 'close' ? 24 : 20} color={icon === 'bookmark' ? c.primary : c.mutedForeground} />
    </Pressable>
  );

  // The dock's throws go through the same flight as a thumb's.
  const throwFrom = (dir: 1 | -1) => () => { if (!top || throwing.value) return; haptic(); fly(dir); };

  const stack = [third, second, top].filter((it): it is T => it !== undefined);
  const slotOf = (it: T) => (it === top ? 0 : it === second ? 1 : 2);

  return (
    <View style={{ height }}>
      <GestureDetector gesture={gestures}>
        <View style={{ height: cardH + DECK_PEEK, paddingTop: DECK_PEEK }}>
          {stack.map((it) => (
            <DeckSlot key={keyOf(it)} slot={slotOf(it)} x={x} y={y} rise={rise} width={width} cardH={cardH} reduce={reduce}>
              {renderCard(it, it === top && at === 0)}
              {it === top ? (
                <>
                  <Animated.View pointerEvents="none" style={[keepStamp, { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }]}>{stamp(keepLabel, -14, 'left')}</Animated.View>
                  <Animated.View pointerEvents="none" style={[passStamp, { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }]}>{stamp(passLabel, 14, 'right')}</Animated.View>
                </>
              ) : null}
            </DeckSlot>
          ))}
        </View>
      </GestureDetector>
      <View style={{ height: DECK_DOCK, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36 }}>
        {button(passLabel, 'close', throwFrom(-1))}
        {button(keepLabel, 'bookmark', throwFrom(1))}
      </View>
    </View>
  );
}

/**
 * One slot of the stack. Its look is a function of its visual position: the
 * slot number, plus the rise still to come after a throw, minus how far the
 * top card has been dragged (the ones behind come up as it goes). Slot 0 also
 * follows the thumb.
 */
function DeckSlot({ slot, x, y, rise, width, cardH, reduce, children }: {
  slot: number; x: SharedValue<number>; y: SharedValue<number>; rise: SharedValue<number>; width: number; cardH: number; reduce: boolean; children: ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const drag = slot === 0 ? 0 : Math.min(1, Math.abs(x.value) / (width * 0.5));
    const vp = Math.max(0, slot + rise.value - drag);
    const translateY = interpolate(vp, [0, 1, 2], [0, -DECK_PEEK / 2, -DECK_PEEK], Extrapolation.CLAMP);
    const scale = interpolate(vp, [0, 1, 2], [1, 0.96, 0.92], Extrapolation.CLAMP);
    const opacity = interpolate(vp, [0, 1, 2], [1, 0.92, 0.8], Extrapolation.CLAMP);
    if (slot !== 0) return { transform: [{ translateY }, { scale }], opacity, zIndex: 3 - slot };
    const gone = reduce ? interpolate(Math.abs(x.value), [0, width * 0.4], [1, 0], Extrapolation.CLAMP) : 1;
    return {
      transform: [
        { translateY: translateY + y.value * 0.35 },
        { translateX: x.value },
        { rotate: `${interpolate(x.value, [-width, 0, width], [-14, 0, 14], Extrapolation.CLAMP)}deg` },
        { scale },
      ],
      opacity: Math.min(opacity, gone),
      zIndex: 3,
    };
  });
  return (
    <Animated.View style={[style, { position: 'absolute', left: 0, right: 0, top: DECK_PEEK, height: cardH, transformOrigin: 'top' }]}>
      {children}
    </Animated.View>
  );
}

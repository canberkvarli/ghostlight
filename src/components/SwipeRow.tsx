import { useCallback, useState } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius } from '../theme/tokens';

/**
 * A row you can slide aside to take out of the book, the way a mail row slides.
 *
 * Drag the page left and a red block grows out from under its right edge, as
 * wide as the drag, with a bin and the word Remove riding its outer end. Let
 * go short of halfway and it settles open at the width of the action, a tap
 * on the bin removes. Drag past the middle of the row and the bin lets go of
 * the edge and follows your finger (with a tick), which is the row telling
 * you that releasing now removes without the second tap. The screen's undo
 * bar gives the page back either way.
 *
 * The pan only wins past fourteen points sideways and gives up at ten points
 * of travel up or down, so the list still scrolls freely over it.
 */
const ACTION = 84;
const SPRING = { damping: 24, stiffness: 260, mass: 0.8 };
const FOLLOW = { damping: 20, stiffness: 300, mass: 0.6 };

export function SwipeRow({
  children,
  onRemove,
  label,
  style,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const width = useSharedValue(360);
  // 1 once the drag has gone past the middle: the bin leaves the edge and
  // rides the page instead.
  const follow = useSharedValue(0);
  const committed = useSharedValue(false);
  const [open, setOpen] = useState(false);

  const opened = useCallback(() => {
    setOpen(true);
    Haptics.selectionAsync().catch(() => {});
  }, []);
  const closed = useCallback(() => setOpen(false), []);
  const tick = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);
  const remove = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setOpen(false);
    onRemove();
  }, [onRemove]);
  const close = useCallback(() => {
    x.value = withSpring(0, SPRING);
    follow.value = 0;
    committed.value = false;
    setOpen(false);
  }, [x, follow, committed]);

  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-10, 10])
    .onStart(() => {
      start.value = x.value;
    })
    .onUpdate((e) => {
      const next = start.value + e.translationX;
      // Left only. A little give to the right, so it feels like paper and not
      // a rail, then nothing.
      x.value = next > 0 ? next * 0.12 : Math.max(next, -width.value);
      const past = -x.value > width.value * 0.5;
      if (past !== committed.value) {
        committed.value = past;
        follow.value = withSpring(past ? 1 : 0, FOLLOW);
        if (past) runOnJS(tick)();
      }
    })
    .onEnd((e) => {
      if (committed.value) {
        x.value = withTiming(-width.value - 24, { duration: 180 });
        runOnJS(remove)();
        return;
      }
      follow.value = 0;
      committed.value = false;
      const shouldOpen = x.value < -ACTION / 2 || (e.velocityX < -700 && x.value < -24);
      x.value = withSpring(shouldOpen ? -ACTION : 0, SPRING);
      runOnJS(shouldOpen ? opened : closed)();
    });

  const page = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  // The block is exactly as wide as the drag, so it reads as uncovered, not
  // as something that was always there.
  const block = useAnimatedStyle(() => ({
    width: Math.max(0, -x.value),
  }));
  // The bin sits at the block's outer end until the drag commits, then slides
  // in to the page's edge and stays with it.
  const bin = useAnimatedStyle(() => {
    const w = Math.max(0, -x.value);
    const atEdge = Math.max(0, w - ACTION);
    return { transform: [{ translateX: atEdge * (1 - follow.value) }] };
  });

  return (
    <View
      style={style}
      onLayout={(e) => {
        width.value = e.nativeEvent.layout.width;
      }}
    >
      <Animated.View
        style={[
          block,
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            borderRadius: radius.card,
            backgroundColor: colors.remove,
            overflow: 'hidden',
          },
        ]}
      >
        <Animated.View style={[bin, { position: 'absolute', left: 0, top: 0, bottom: 0, width: ACTION }]}>
          <Pressable
            onPress={remove}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="trash-outline" size={22} color="#ffffff" />
            <Text
              style={{
                marginTop: 3,
                fontFamily: 'BricolageGrotesque_600SemiBold',
                fontSize: 12,
                color: '#ffffff',
              }}
            >
              Remove
            </Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={page}>
          {children}
          {/* Open, a tap on the page closes it rather than opening the piece. */}
          {open ? (
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
            />
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

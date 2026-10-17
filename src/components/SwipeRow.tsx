import { useCallback, useState } from "react";
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "../theme/ThemeContext";
import { radius } from "../theme/tokens";

/**
 * A row you can slide aside to take out of the book.
 *
 * Drag the page left and a block of the accent comes out from under it with
 * one word on it: remove. Tap the word, or keep dragging past the middle of
 * the screen and let go, and the page is gone (the screen's undo bar gives it
 * back). The row used to carry a tiny bookmark under the tick for this, two
 * targets a thumb's width apart that did opposite things; now the tick is the
 * only thing on the row and removing is a motion you cannot make by accident.
 *
 * The pan only wins past fourteen points sideways and gives up at ten points
 * of travel up or down, so the list still scrolls freely over it.
 */
const OPEN = 92;
const FLING = 168;
const SPRING = { damping: 24, stiffness: 260, mass: 0.8 };

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
  const { colors: c } = useTheme();
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const [open, setOpen] = useState(false);

  const opened = useCallback(() => {
    setOpen(true);
    Haptics.selectionAsync().catch(() => {});
  }, []);
  const closed = useCallback(() => setOpen(false), []);
  const remove = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setOpen(false);
    onRemove();
  }, [onRemove]);
  const close = useCallback(() => {
    x.value = withSpring(0, SPRING);
    setOpen(false);
  }, [x]);

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
      x.value = next > 0 ? next * 0.12 : Math.max(next, -FLING - 32);
    })
    .onEnd((e) => {
      if (x.value < -FLING) {
        x.value = withTiming(-480, { duration: 200 });
        runOnJS(remove)();
        return;
      }
      const shouldOpen =
        x.value < -OPEN / 2 || (e.velocityX < -700 && x.value < -24);
      x.value = withSpring(shouldOpen ? -OPEN : 0, SPRING);
      runOnJS(shouldOpen ? opened : closed)();
    });

  const page = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  const block = useAnimatedStyle(() => ({
    opacity: Math.min(1, -x.value / (OPEN * 0.55)),
  }));

  return (
    <View style={style}>
      <Animated.View
        style={[
          block,
          {
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            alignItems: "flex-end",
          },
        ]}
      >
        <Pressable
          onPress={remove}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={{
            width: OPEN,
            alignSelf: "stretch",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: radius.card,
            backgroundColor: c.accentText,
          }}
        >
          <Ionicons name="bookmark-outline" size={18} color={c.paper} />
          <Text
            style={{
              marginTop: 4,
              fontFamily: "CourierPrime_700Bold",
              fontSize: 10,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: c.paper,
            }}
          >
            remove
          </Text>
        </Pressable>
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
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
              }}
            />
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

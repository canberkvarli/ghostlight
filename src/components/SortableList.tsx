import { useCallback, useLayoutEffect } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

/**
 * A short list you put in order by hand: hold a row until it lifts, drag it
 * up or down, and the others step out of its way; let go and it settles into
 * the gap. Rows may be any height (one opened to show its scenes is tall), so
 * each one's height is measured, and where the held row lands is counted
 * from the middles of the others.
 *
 * Everything that moves is a shared value on the UI thread. The list tells
 * its screen when a row is held (`onHolding`) so the page can stop scrolling
 * under the finger.
 */
const SETTLE = { duration: 160 };

export function SortableList<T>({
  items,
  keyOf,
  renderItem,
  onReorder,
  onHolding,
}: {
  items: T[];
  keyOf: (item: T) => string | number;
  renderItem: (item: T) => React.ReactNode;
  onReorder: (next: T[]) => void;
  onHolding?: (holding: boolean) => void;
}) {
  const heights = useSharedValue<number[]>([]);
  const active = useSharedValue(-1);
  const target = useSharedValue(-1);
  const dy = useSharedValue(0);

  // A new order has rendered: the rows are where they belong, so the offsets go.
  useLayoutEffect(() => {
    if (heights.value.length > items.length) heights.value = heights.value.slice(0, items.length);
    active.value = -1;
    target.value = -1;
    dy.value = 0;
  }, [items, heights, active, target, dy]);

  const lift = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onHolding?.(true);
  }, [onHolding]);
  const cross = useCallback(() => { Haptics.selectionAsync().catch(() => {}); }, []);
  const drop = useCallback((from: number, to: number) => {
    onHolding?.(false);
    if (from === to || from < 0) { active.value = -1; target.value = -1; dy.value = 0; return; }
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onReorder(next);
  }, [items, onReorder, onHolding, active, target, dy]);

  return (
    <View>
      {items.map((item, i) => (
        <SortableItem key={keyOf(item)} index={i} heights={heights} active={active} target={target} dy={dy}
          onLift={lift} onCross={cross} onDrop={drop}>
          {renderItem(item)}
        </SortableItem>
      ))}
    </View>
  );
}

function SortableItem({
  index, heights, active, target, dy, onLift, onCross, onDrop, children,
}: {
  index: number;
  heights: SharedValue<number[]>;
  active: SharedValue<number>;
  target: SharedValue<number>;
  dy: SharedValue<number>;
  onLift: () => void;
  onCross: () => void;
  onDrop: (from: number, to: number) => void;
  children: React.ReactNode;
}) {
  const pan = Gesture.Pan()
    .activateAfterLongPress(320)
    .onStart(() => {
      active.value = index;
      target.value = index;
      dy.value = 0;
      runOnJS(onLift)();
    })
    .onUpdate((e) => {
      dy.value = e.translationY;
      const hs = heights.value;
      let top = 0;
      for (let k = 0; k < index; k++) top += hs[k] ?? 0;
      const center = top + (hs[index] ?? 0) / 2 + e.translationY;
      // Where it lands: past how many of the others' middles it has gone.
      let at = 0;
      let y = 0;
      for (let k = 0; k < hs.length; k++) {
        if (k !== index && y + (hs[k] ?? 0) / 2 < center) at += 1;
        y += hs[k] ?? 0;
      }
      if (at !== target.value) {
        target.value = at;
        runOnJS(onCross)();
      }
    })
    .onEnd(() => {
      const hs = heights.value;
      const t = target.value;
      let to = 0;
      if (t > index) for (let k = index + 1; k <= t; k++) to += hs[k] ?? 0;
      if (t < index) for (let k = t; k < index; k++) to -= hs[k] ?? 0;
      dy.value = withTiming(to, SETTLE, (finished) => {
        if (finished) runOnJS(onDrop)(index, t);
      });
    })
    .onFinalize((_, success) => {
      // Cancelled before it ever lifted, or taken away by the system.
      if (!success && active.value === index) runOnJS(onDrop)(-1, -1);
    });

  const style = useAnimatedStyle(() => {
    const a = active.value;
    if (a < 0) return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0, opacity: 1 };
    if (a === index) return { transform: [{ translateY: dy.value }, { scale: 1.02 }], zIndex: 10, opacity: 0.96 };
    const t = target.value;
    const h = heights.value[a] ?? 0;
    let off = 0;
    if (a < t && index > a && index <= t) off = -h;
    if (t < a && index >= t && index < a) off = h;
    return { transform: [{ translateY: withTiming(off, SETTLE) }, { scale: 1 }], zIndex: 0, opacity: 1 };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={style}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          const next = [...heights.value];
          next[index] = h;
          heights.value = next;
        }}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

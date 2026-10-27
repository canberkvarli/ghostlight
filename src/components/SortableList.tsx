import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * A short list you put in order by hand: hold a row until it lifts, drag it
 * up or down, and the others glide out of its way; let go and it settles into
 * the gap.
 *
 * Every row is placed by the list, not by the layout: its place is the sum of
 * the heights above it in an order kept on the UI thread. The order changes
 * while the finger moves, so the rows spring to their new places as it goes,
 * and when the new order is handed back to the screen nothing on it moves,
 * because it is already where it is. (Reordering the children and undoing an
 * offset in the same frame is what made the last version jump.)
 *
 * Rows may be any height (one opened to show its scenes is tall); each is
 * measured, and a row that grows pushes the ones under it down smoothly.
 */
const PLACE = { damping: 22, stiffness: 240, mass: 0.7 };
const LIFT = { damping: 16, stiffness: 260 };

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
  const ids = items.map((it) => String(keyOf(it)));
  const order = useSharedValue<string[]>(ids);
  const heights = useSharedValue<Record<string, number>>({});
  const active = useSharedValue<string>('');
  // Rows are hidden until every one has been measured, then placed without a spring.
  const ready = useSharedValue(false);

  const idsKey = ids.join('|');
  useEffect(() => {
    if (active.value) return;
    order.value = ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const total = useDerivedValue(() => {
    let t = 0;
    for (const k of order.value) t += heights.value[k] ?? 0;
    return t;
  });
  const box = useAnimatedStyle(() => ({ height: total.value }));

  const lift = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onHolding?.(true);
  }, [onHolding]);
  const cross = useCallback(() => { Haptics.selectionAsync().catch(() => {}); }, []);
  const drop = useCallback((next: string[]) => {
    onHolding?.(false);
    const byId = new Map(items.map((it) => [String(keyOf(it)), it]));
    const now = next.map((k) => byId.get(k)).filter((x): x is T => x !== undefined);
    if (now.length !== items.length || now.every((it, i) => it === items[i])) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onReorder(now);
  }, [items, keyOf, onReorder, onHolding]);

  return (
    <Animated.View style={box}>
      {items.map((item) => {
        const id = String(keyOf(item));
        return (
          <SortableItem key={id} id={id} count={ids.length} order={order} heights={heights} active={active} ready={ready}
            onLift={lift} onCross={cross} onDrop={drop}>
            {renderItem(item)}
          </SortableItem>
        );
      })}
    </Animated.View>
  );
}

function topOf(id: string, order: string[], heights: Record<string, number>): number {
  'worklet';
  let t = 0;
  for (const k of order) {
    if (k === id) break;
    t += heights[k] ?? 0;
  }
  return t;
}

function SortableItem({
  id, count, order, heights, active, ready, onLift, onCross, onDrop, children,
}: {
  id: string;
  count: number;
  order: SharedValue<string[]>;
  heights: SharedValue<Record<string, number>>;
  active: SharedValue<string>;
  ready: SharedValue<boolean>;
  onLift: () => void;
  onCross: () => void;
  onDrop: (next: string[]) => void;
  children: React.ReactNode;
}) {
  const y = useSharedValue(0);
  const startY = useSharedValue(0);
  const scale = useSharedValue(1);
  const lifted = useSharedValue(false);
  const downY = useSharedValue(0);

  // Where this row belongs; it springs there whenever that changes, unless it is the one in the hand.
  const home = useDerivedValue(() => topOf(id, order.value, heights.value));
  useAnimatedReaction(() => [home.value, ready.value] as const, ([t, isReady], prev) => {
    if (active.value === id) return;
    if (!isReady || !prev || !prev[1]) { y.value = t; return; }
    y.value = withSpring(t, PLACE);
  });

  const hold = Gesture.LongPress()
    .minDuration(300)
    .maxDistance(12)
    .onStart(() => {
      lifted.value = true;
      active.value = id;
      startY.value = y.value;
      scale.value = withSpring(1.03, LIFT);
      runOnJS(onLift)();
    });
  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e) => { downY.value = e.allTouches[0]?.absoluteY ?? 0; })
    .onTouchesMove((e, mgr) => {
      if (lifted.value) { mgr.activate(); return; }
      const ty = e.allTouches[0]?.absoluteY ?? downY.value;
      if (Math.abs(ty - downY.value) > 12) mgr.fail();
    })
    .onUpdate((e) => {
      const hs = heights.value;
      const mine = hs[id] ?? 0;
      const others = order.value.filter((k) => k !== id);
      // Kept inside the list: the row cannot be dragged past either end.
      let span = 0;
      for (const k of others) span += hs[k] ?? 0;
      const yy = Math.max(-mine * 0.3, Math.min(span + mine * 0.3, startY.value + e.translationY));
      y.value = yy;
      const center = yy + mine / 2;
      let at = 0;
      let acc = 0;
      for (const k of others) {
        const h = hs[k] ?? 0;
        if (acc + h / 2 < center) at += 1;
        acc += h;
      }
      const next = [...others.slice(0, at), id, ...others.slice(at)];
      if (next.join('|') !== order.value.join('|')) {
        order.value = next;
        runOnJS(onCross)();
      }
    })
    .onFinalize(() => {
      if (!lifted.value) return;
      lifted.value = false;
      const settled = order.value;
      y.value = withSpring(topOf(id, settled, heights.value), PLACE);
      scale.value = withSpring(1, LIFT);
      active.value = '';
      runOnJS(onDrop)(settled);
    });
  const gesture = Gesture.Simultaneous(hold, pan);

  const style = useAnimatedStyle(() => {
    const on = active.value === id;
    return {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      opacity: ready.value ? withTiming(1, { duration: 160 }) : 0,
      zIndex: on ? 10 : 1,
      transform: [{ translateY: y.value }, { scale: scale.value }],
      shadowColor: '#000',
      shadowOpacity: on ? withTiming(0.22, { duration: 160 }) : withTiming(0, { duration: 220 }),
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={style}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (heights.value[id] === h) return;
          const next = { ...heights.value, [id]: h };
          heights.value = next;
          if (!ready.value && Object.keys(next).length >= count) ready.value = true;
        }}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

import { useCallback, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { makeMutable, useAnimatedScrollHandler, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

/**
 * How far the bar has stepped away, 0 to 1. A room's scroll drives it: down
 * and it leaves, up and it is back, and it is always back at the top of a
 * page and when the room changes. One value for the whole app, on the UI
 * thread, so no frame waits on JavaScript.
 */
export const barShift = makeMutable(0);

export function showBar() {
  barShift.value = withTiming(0, { duration: 220 });
}

/** One scroll step, on the UI thread: a room with its own scroll handler calls this from it. */
export function stepBar(last: { value: number }, y: number) {
  'worklet';
  const dy = y - last.value;
  if (y <= 24) barShift.value = withTiming(0, { duration: 220 });
  else if (dy > 8) barShift.value = withTiming(1, { duration: 280 });
  else if (dy < -8) barShift.value = withTiming(0, { duration: 220 });
  if (Math.abs(dy) > 8) last.value = y;
}

/** The scroll handler a room gives its list. */
export function useHideBarOnScroll() {
  const last = useSharedValue(0);
  return useAnimatedScrollHandler({
    onBeginDrag: (e) => { last.value = e.contentOffset.y; },
    onScroll: (e) => { stepBar(last, e.contentOffset.y); },
  });
}

/**
 * A room's scroll: the bar steps away as it goes down, and the room's big
 * title knows how far it has gone, so it can shrink into the header row
 * instead of sliding under it.
 */
export function useRoomScroll(): { onScroll: ReturnType<typeof useAnimatedScrollHandler>; scrollY: SharedValue<number> } {
  const last = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: (e) => { last.value = e.contentOffset.y; },
    onScroll: (e) => { scrollY.value = e.contentOffset.y; stepBar(last, e.contentOffset.y); },
  });
  return { onScroll, scrollY };
}

/**
 * A screen that needs the whole floor (a dead end with its one button low on
 * the page) sends the bar away while it is up. Counted, so two such screens
 * stacked do not bring it back when the first one goes.
 */
let aside = 0;
const asideListeners = new Set<() => void>();
const tellAside = () => asideListeners.forEach((l) => l());

export function useBarAside(on: boolean) {
  // Only while focused: a room left behind in another tab keeps no claim on the bar.
  useFocusEffect(useCallback(() => {
    if (!on) return;
    aside += 1; tellAside();
    return () => { aside -= 1; tellAside(); };
  }, [on]));
}

export function useBarIsAside(): boolean {
  return useSyncExternalStore(
    (l) => { asideListeners.add(l); return () => { asideListeners.delete(l); }; },
    () => aside > 0,
  );
}

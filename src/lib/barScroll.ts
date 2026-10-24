import { makeMutable, useAnimatedScrollHandler, useSharedValue, withTiming } from 'react-native-reanimated';

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

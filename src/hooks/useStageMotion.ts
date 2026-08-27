import { useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';

/**
 * The tilt spotlight, retired.
 *
 * The phone was the cursor: tilt it and the light on the back wall moved. Two
 * versions of that shipped and both were worse than stillness. A large
 * soft-edged pool sliding behind the content stopped reading as light and
 * started reading as a shape moving under the surface. Replacing it with
 * drifting motes traded that for decoration stuck on top. The stage is a
 * backdrop; it should stay behind the actor.
 *
 * The hook stays, returning values pinned at centre, because eight screens
 * thread `tiltX`/`tiltY` into StageBackdrop and a signature change buys nothing.
 * What matters is that DeviceMotion is no longer subscribed: it was sampling at
 * 60Hz on every screen in the app and feeding shared values that nothing read.
 *
 * Bringing motion back means restoring the listener here — see git history for
 * the sensor plumbing, the neutral-drift recentring and the smoothing spring.
 */

export interface StageMotion {
  /** -1 (left) … 1 (right). */
  tiltX: SharedValue<number>;
  /** -1 (tipped back) … 1 (tipped forward). */
  tiltY: SharedValue<number>;
  /** True when the OS asks us to calm down. The light freezes centred. */
  reduceMotion: boolean;
}

export function useStageMotion(): StageMotion {
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  return { tiltX, tiltY, reduceMotion: useReducedMotion() };
}

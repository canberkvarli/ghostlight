import { useEffect } from 'react';
import { DeviceMotion } from 'expo-sensors';
import {
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * The tilt spotlight.
 *
 * The web app's SpotlightSurface follows the mouse and explicitly bails on
 * touch. Phones have no cursor, so the phone itself becomes the cursor: tilt
 * the device and the light on the back wall moves.
 *
 * Everything downstream of here lives on the UI thread. The sensor callback
 * writes to shared values and nothing else — no setState, no re-render. If you
 * ever find yourself adding one, the spotlight will start dropping frames and
 * the whole idea dies with it.
 */

/** Radians of tilt away from neutral that map to full deflection. ~29°. */
const MAX_TILT = 0.5;

/** How fast neutral follows you. Low enough to feel still, high enough not to trap you at the edge. */
const RECENTRE_RATE = 0.0025;

/**
 * Softer and heavier than it was (damping 24 / stiffness 55 / mass 1.1). A stiff
 * spring tracks the sensor closely, which is the wrong goal: it makes the light
 * feel stuck to the phone, and every small hand tremor arrives on screen. A
 * lamp hanging in a room has mass and lags. Lower stiffness with proportionally
 * higher damping keeps it critically damped — it never overshoots and wobbles,
 * it just takes its time.
 */
const SPRING = {
  damping: 30,
  stiffness: 26,
  mass: 1.6,
} as const;

export interface StageMotion {
  /** -1 (left) … 1 (right). */
  tiltX: SharedValue<number>;
  /** -1 (tipped back) … 1 (tipped forward). */
  tiltY: SharedValue<number>;
  /** True when the OS asks us to calm down. The light freezes centred. */
  reduceMotion: boolean;
}

export function useStageMotion(): StageMotion {
  const rawX = useSharedValue(0);
  const rawY = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      rawX.value = 0;
      rawY.value = 0;
      return;
    }

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;
    // Neutral is wherever you were holding the phone when the stage came up,
    // not some absolute orientation. Then it drifts slowly toward wherever you
    // have settled, so a long read on the sofa doesn't peg the light.
    let neutral: { beta: number; gamma: number } | null = null;

    const start = async () => {
      if (!(await DeviceMotion.isAvailableAsync()) || cancelled) return;

      const permission = await DeviceMotion.getPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) {
        const asked = await DeviceMotion.requestPermissionsAsync();
        if (!asked.granted) return;
      } else if (!permission.granted) {
        return;
      }
      if (cancelled) return;

      DeviceMotion.setUpdateInterval(1000 / 60);
      subscription = DeviceMotion.addListener(({ rotation }) => {
        if (!rotation) return;
        const { beta, gamma } = rotation;
        if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;

        if (!neutral) {
          neutral = { beta, gamma };
          return;
        }

        neutral.beta += (beta - neutral.beta) * RECENTRE_RATE;
        neutral.gamma += (gamma - neutral.gamma) * RECENTRE_RATE;

        rawX.value = clamp((gamma - neutral.gamma) / MAX_TILT);
        rawY.value = clamp((beta - neutral.beta) / MAX_TILT);
      });
    };

    void start();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [reduceMotion, rawX, rawY]);

  // Smoothing runs as a UI-thread spring, so the light glides even though the
  // sensor arrives in steps.
  const tiltX = useDerivedValue(() => withSpring(rawX.value, SPRING));
  const tiltY = useDerivedValue(() => withSpring(rawY.value, SPRING));

  return { tiltX, tiltY, reduceMotion };
}

function clamp(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

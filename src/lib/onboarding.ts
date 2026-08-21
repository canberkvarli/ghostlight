import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/**
 * Whether the actor has already been through (or skipped) onboarding. Device-
 * local on purpose — this is a "have we said hello" flag, not entitlement, so
 * it does not belong on the server. A reinstall re-showing three skippable
 * screens is a fine cost; the read counter that must survive reinstall lives
 * server-side instead (spec §4).
 */

const KEY = 'ghostlight.onboarding.complete.v1';

export async function markOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(KEY, '1');
}

/** `null` while the flag is still being read — callers hold the stage dark until then. */
export function useOnboardingComplete(): boolean | null {
  const [complete, setComplete] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (alive) setComplete(v === '1');
      })
      .catch(() => {
        if (alive) setComplete(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  return complete;
}

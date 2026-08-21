import { useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';

/**
 * A back press that never throws. `router.back()` explodes with
 * "GO_BACK not handled" whenever the screen is the first in the stack — a deep
 * link, a cold launch straight onto Read, or a modal dismissing onto a screen
 * that was itself the entry. So we only pop when there's history, and otherwise
 * fall back to a known-safe route (the home stage).
 */
export function useGoBack(fallback: Href = '/search') {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}

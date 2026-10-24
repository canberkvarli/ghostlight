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

let lastPushed = '';
let lastPushedAt = 0;

/**
 * A push that cannot double. A thumb that taps a row twice while the screen
 * is still coming up used to stack two paywalls; the second tap on the same
 * destination inside a second is the same tap.
 */
export function useGuardedPush() {
  const router = useRouter();
  return useCallback((href: Href) => {
    const key = typeof href === 'string' ? href : JSON.stringify(href);
    const now = Date.now();
    if (key === lastPushed && now - lastPushedAt < 1200) return;
    lastPushed = key;
    lastPushedAt = now;
    router.push(href);
  }, [router]);
}

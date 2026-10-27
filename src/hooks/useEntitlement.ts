import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ApiError, FREE_READS, getReadState, type ReadState } from '../api/client';
import { track } from '../lib/analytics';
import { setOfflineAllowed } from '../lib/offline';
import { hasMonologuesEntitlement, onCustomerInfoUpdate } from '../lib/purchases';

/**
 * One receipt watcher for the whole app, not one per screen.
 *
 * This hook is mounted in the root layout AND in search, account and read, so a
 * per-hook `useEffect` would register four RevenueCat listeners and fire four
 * getCustomerInfo calls on every mount. An external store keeps it to one
 * subscription and hands every caller the same value.
 */
let localPaid = false;
const listeners = new Set<() => void>();
let watching = false;

function publish(on: boolean) {
  if (on === localPaid) return;
  localPaid = on;
  listeners.forEach((l) => l());
}

function subscribeLocal(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  if (!watching) {
    watching = true;
    void hasMonologuesEntitlement().then(publish);
    onCustomerInfoUpdate(publish);
  }
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getLocal(): boolean {
  return localPaid;
}

/**
 * The one answer to "what is this actor allowed to do".
 *
 * `['read-wall']` was queried separately in search, account and the read screen,
 * each re-deriving `isPaid` from `wall?.is_paid === true`. Same key, so React
 * Query deduped the network call, but the derivation was copied three times and
 * nothing owned it — which is how offline access ended up ungated while the
 * paywall and the App Store listing both sold it.
 *
 * Mount this once high in the tree (app/_layout.tsx). Screens may keep their own
 * `useQuery(['read-wall'])` — it's the same cache entry, not another request —
 * but anything that asks "is this actor paid?" should call this hook, because
 * the server flag alone is not the whole answer (see `local` below).
 */
export interface Entitlement {
  isPaid: boolean;
  atWall: boolean;
  readsUsed: number;
  readsLimit: number;
  wall: ReadState | undefined;
  /** False until the server has actually answered. Gate the wall on this. */
  settled: boolean;
  /** Asked, and never got an answer: no wall to show, not even a locked one. */
  failed: boolean;
  /** Ask again. Stable, so a focus effect can depend on it. */
  refresh: () => void;
}

export function useEntitlement(): Entitlement {
  const { data: wall, isFetched, isError, error, refetch } = useQuery({
    queryKey: ['read-wall'],
    queryFn: ({ signal }) => getReadState(signal),
    // A 4xx is an answer and is not asked again (401 and 403 never get here:
    // getReadState turns them into a locked state). Anything else, a dropped
    // connection at the moment of signing in, a 5xx while the server restarts,
    // is asked twice more before it counts as a failure. `retry: false` left
    // the plan card on "Your stage." for as long as the screen stayed open:
    // nothing had answered, so nothing was shown, and nothing asked again.
    retry: (count, err) => count < 2 && !(err instanceof ApiError && err.status < 500),
    retryDelay: (count) => 700 * (count + 1),
    staleTime: 15_000,
  });

  useEffect(() => {
    // So the next "it still says Your stage" can be read off a dashboard with
    // the status the server actually sent, rather than guessed at.
    if (!isError) return;
    track('app_wall_failed', { status: error instanceof ApiError ? error.status : null });
  }, [isError, error]);
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  // The device's own receipt. The server hears about a purchase from a webhook
  // and that gap was visible: the app unlocked, then re-locked when the next
  // poll came back with the pre-webhook answer. See onCustomerInfoUpdate.
  const local = useSyncExternalStore(subscribeLocal, getLocal);

  const isPaid = wall?.is_paid === true || local;

  useEffect(() => {
    // Offline copies are a subscriber feature, and src/lib/offline.ts has no way
    // to ask the server itself. Push the answer down to it whenever it changes:
    // on sign-out the cache is cleared, this reads back undefined, and offline
    // locks again — so a lapsed or signed-out actor stops being served the
    // on-device shelf. The rows survive; only access stops, so re-subscribing
    // doesn't mean re-downloading everything.
    setOfflineAllowed(isPaid);
  }, [isPaid]);

  return {
    isPaid,
    atWall: wall?.atWall === true && !isPaid,
    readsUsed: wall?.reads_used ?? 0,
    // Before the server answers, the same number getReadState falls back to. A
    // literal here once said 3 while the wall said 1.
    readsLimit: wall?.reads_limit ?? FREE_READS,
    wall,
    settled: isFetched,
    failed: isError && wall === undefined,
    refresh,
  };
}

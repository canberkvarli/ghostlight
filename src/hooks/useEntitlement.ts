import { useEffect, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getReadState, type ReadState } from '../api/client';
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
}

export function useEntitlement(): Entitlement {
  const { data: wall, isFetched } = useQuery({
    queryKey: ['read-wall'],
    queryFn: ({ signal }) => getReadState(signal),
    retry: false,
    staleTime: 15_000,
  });

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
    readsLimit: wall?.reads_limit ?? 3,
    wall,
    settled: isFetched,
  };
}

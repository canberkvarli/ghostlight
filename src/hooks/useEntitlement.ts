import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getReadState, type ReadState } from '../api/client';
import { setOfflineAllowed } from '../lib/offline';

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
 * `useQuery(['read-wall'])` — it's the same cache entry, not another request.
 */
export interface Entitlement {
  isPaid: boolean;
  atWall: boolean;
  readsUsed: number;
  readsLimit: number;
  wall: ReadState | undefined;
}

export function useEntitlement(): Entitlement {
  const { data: wall } = useQuery({
    queryKey: ['read-wall'],
    queryFn: ({ signal }) => getReadState(signal),
    retry: false,
    staleTime: 15_000,
  });

  const isPaid = wall?.is_paid === true;

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
    atWall: wall?.atWall === true,
    readsUsed: wall?.reads_used ?? 0,
    readsLimit: wall?.reads_limit ?? 3,
    wall,
  };
}

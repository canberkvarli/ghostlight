import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getFavorites, setFavorite } from '../api/client';
import { apiToMonologue } from '../data/adapt';
import { listOffline, saveOffline } from '../lib/offline';
import type { Monologue } from '../data/monologues';

/**
 * The saved list and the act of saving (spec §5, Step 6). Saves are a paid-tier
 * feature, so they must be real — server-backed, not a local wishlist. The
 * server is the source of truth; every fetch also mirrors the list into
 * on-device SQLite so the shelf survives offline, and a failed fetch (no
 * signal) falls back to that mirror.
 */

const KEY = ['favorites'];

export function useFavorites(enabled: boolean) {
  return useQuery<Monologue[]>({
    queryKey: KEY,
    enabled,
    queryFn: async ({ signal }) => {
      try {
        const list = (await getFavorites(signal)).map(apiToMonologue);
        // Keep the offline shelf warm — full text and all — for readers on a
        // plane. Best-effort; a cache write must never fail the fetch.
        void Promise.all(list.map((m) => saveOffline(m))).catch(() => {});
        return list;
      } catch (err) {
        const local = await listOffline();
        if (local.length) return local;
        throw err;
      }
    },
  });
}

export function useIsFavorited(id: string, enabled: boolean): boolean {
  const { data } = useFavorites(enabled);
  return Boolean(data?.some((m) => m.id === id));
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setFavorite(id, on),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

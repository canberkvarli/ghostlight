import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getFavorites, setFavorite } from '../api/client';
import { apiToMonologue } from '../data/adapt';
import type { Monologue } from '../data/monologues';

/**
 * The saved list and the act of saving (spec §5, Step 6). Saves are a paid-tier
 * feature, so they must be real — server-backed, not a local wishlist. Reads go
 * through react-query; a toggle optimistically flips the cached set so the
 * bookmark responds instantly, then reconciles with the server.
 */

const KEY = ['favorites'];

export function useFavorites(enabled: boolean) {
  return useQuery<Monologue[]>({
    queryKey: KEY,
    enabled,
    queryFn: async ({ signal }) => (await getFavorites(signal)).map(apiToMonologue),
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

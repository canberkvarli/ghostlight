import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getFavorites, setFavorite } from '../api/client';
import { apiToMonologue } from '../data/adapt';
import { listOffline, saveOffline } from '../lib/offline';
import { recordSave } from '../lib/reviewMoments';
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

/**
 * Toggling a save, optimistically.
 *
 * This used to be mutate → await the POST → invalidate → refetch the entire
 * favourites list before the icon could change, so the bookmark sat there doing
 * nothing for as long as the round trip took. On a slow connection that reads as
 * a dead button and you tap it again, which un-saves what you just saved.
 *
 * Now the cache moves first and the network catches up. A failure rolls the
 * cache back to the exact snapshot taken before the tap, so a dropped request
 * can't leave a phantom save on the shelf.
 */
/** `item` is optional: pass it when you have the row and want the add painted too. */
interface ToggleVars {
  id: string;
  on: boolean;
  item?: Monologue;
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: ToggleVars) => setFavorite(id, on),
    onMutate: async ({ id, on, item }: ToggleVars) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<Monologue[]>(KEY);
      qc.setQueryData<Monologue[]>(KEY, (list) => {
        const current = list ?? [];
        if (!on) return current.filter((m) => m.id !== id);
        if (current.some((m) => m.id === id)) return current;
        // Without the row itself we can't paint it into the list, but removing
        // is the half that has to feel instant on the saves screen; adding is
        // already instant on the read screen, where the icon is what changes.
        return item ? [item, ...current] : current;
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEY, ctx.previous);
    },
    // Only a save the server kept counts toward the rating moment.
    onSuccess: (_data, { on }) => {
      if (on) void recordSave();
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

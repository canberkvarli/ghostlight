import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getFavorites, setCut, setFavorite, setMemorized, setPrepState } from '../api/client';
import { apiToMonologue } from '../data/adapt';
import { listOffline, saveOffline } from '../lib/offline';
import { track } from '../lib/analytics';
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

/** Your copy of one piece, if it is in the book: carries off book, notes, dates. */
export function useSavedPiece(id: string, enabled: boolean): Monologue | null {
  const { data } = useFavorites(enabled);
  return data?.find((m) => m.id === id) ?? null;
}

/**
 * The tick. Off book is the one thing you do to the book by hand, so it moves
 * at once: the row re-flows into the pocket before the server has heard, and
 * comes back down if the server says no. The website's "off book" is the same
 * column, so the two agree without either knowing about the other.
 */
export function useSetOffBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => setMemorized(id, on),
    onMutate: async ({ id, on }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<Monologue[]>(KEY);
      qc.setQueryData<Monologue[]>(KEY, (list) => (list ?? []).map((m) => (m.id === id ? { ...m, offBook: on } : m)));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEY, ctx.previous);
    },
    onSuccess: (_data, { on, id }) => {
      track('app_off_book_toggled', { on });
      const row = qc.getQueryData<Monologue[]>(KEY)?.find((m) => m.id === id);
      if (row) void saveOffline(row);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * The cut. Written into the cached row (the book's and the page's) before the
 * server answers, and put back if it says no. Setting a cut on a piece not yet
 * in the book saves it there too, as the server does; the list is refetched so
 * the new row has its place.
 */
export function useSetCut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, start, end }: { id: string; start: number | null; end: number | null; item?: Monologue }) =>
      setCut(id, start, end),
    onMutate: async ({ id, start, end, item }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<Monologue[]>(KEY);
      const patch = { cutStart: start ?? undefined, cutEnd: end ?? undefined };
      qc.setQueryData<Monologue[]>(KEY, (list) => {
        const had = (list ?? []).some((m) => m.id === id);
        if (!had && item) return [{ ...item, ...patch, savedAt: new Date().toISOString() }, ...(list ?? [])];
        return (list ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m));
      });
      qc.setQueryData<Monologue>(['monologue', id], (m) => (m ? { ...m, ...patch } : m));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEY, ctx.previous);
    },
    onSuccess: (_data, { id }) => {
      const row = qc.getQueryData<Monologue[]>(KEY)?.find((m) => m.id === id);
      if (row) void saveOffline(row);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/**
 * "I opened this one." Touches last_studied_at on the server, which is what
 * the Working on shelf reads; a no-op there for a piece not in the book. The
 * cache is stamped first so the shelf is right the moment you come back.
 */
export function useMarkStudied() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setPrepState(id, 'studied'),
    onMutate: (id) => {
      const now = new Date().toISOString();
      qc.setQueryData<Monologue[]>(KEY, (list) => (list ?? []).map((m) => (m.id === id ? { ...m, lastStudiedAt: now } : m)));
    },
  });
}

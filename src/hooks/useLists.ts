import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addToList,
  createList,
  deleteList,
  getLists,
  holds,
  orderLists,
  removeFromList,
  renameList,
  restoreList,
  type BookList,
  type Keepable,
} from '../api/book';
import { track } from '../lib/analytics';

/**
 * The Book's lists, one cache entry for every screen that shows them: the
 * Book, a list's own page, and the "Keep in..." sheet. Every write puts the
 * server's answer straight into the cache, so a tick in the sheet is on the
 * Book behind it before the sheet has closed.
 */
export const LISTS_KEY = ['book-lists'];

export function useLists(enabled: boolean) {
  return useQuery<BookList[]>({
    queryKey: LISTS_KEY,
    enabled,
    queryFn: getLists,
    staleTime: 30_000,
  });
}

function useWrite<V>(fn: (v: V) => Promise<BookList | BookList[] | void>, after?: (v: V) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (out, v) => {
      if (Array.isArray(out)) qc.setQueryData<BookList[]>(LISTS_KEY, out);
      else if (out) {
        qc.setQueryData<BookList[]>(LISTS_KEY, (all) => {
          const list = all ?? [];
          return list.some((l) => l.id === out.id) ? list.map((l) => (l.id === out.id ? out : l)) : [...list, out];
        });
      }
      after?.(v);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: LISTS_KEY }),
  });
}

export function useCreateList() {
  return useWrite(({ title }: { title: string; from: 'book' | 'sheet' }) => createList(title), ({ from }) =>
    track('app_list_created', { from }),
  );
}

export function useRenameList() {
  return useWrite(({ id, title }: { id: number; title: string }) => renameList(id, title));
}

export function useOrderLists() {
  return useWrite(({ ids }: { ids: number[] }) => orderLists(ids));
}

export function useDeleteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number }) => deleteList(id),
    onMutate: ({ id }) => {
      qc.setQueryData<BookList[]>(LISTS_KEY, (all) => (all ?? []).filter((l) => l.id !== id));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: LISTS_KEY }),
  });
}

export function useRestoreList() {
  return useWrite(({ id }: { id: number }) => restoreList(id));
}

/** In or out of one list, whichever it is not. */
export function useToggleInList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ list, what }: { list: BookList; what: Keepable }) => {
      const item = list.items.find((i) =>
        'monologue_id' in what ? i.monologue_id === what.monologue_id : i.user_script_id === what.user_script_id,
      );
      if (item) {
        await removeFromList(list.id, item.id);
        return { ...list, items: list.items.filter((i) => i.id !== item.id) };
      }
      return addToList(list.id, what);
    },
    onSuccess: (out, { list, what }) => {
      qc.setQueryData<BookList[]>(LISTS_KEY, (all) => (all ?? []).map((l) => (l.id === out.id ? out : l)));
      if (!holds(list, what)) track('app_list_kept', { kind: 'monologue_id' in what ? 'speech' : 'sides', into: 'list' });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: LISTS_KEY }),
  });
}

export function useRemoveFromList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, itemId }: { listId: number; itemId: number }) => removeFromList(listId, itemId),
    onMutate: ({ listId, itemId }) => {
      qc.setQueryData<BookList[]>(LISTS_KEY, (all) =>
        (all ?? []).map((l) => (l.id === listId ? { ...l, items: l.items.filter((i) => i.id !== itemId) } : l)),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: LISTS_KEY }),
  });
}

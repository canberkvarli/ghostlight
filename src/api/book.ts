import { API_URL, ApiError, authHeaders } from './client';

/**
 * The Book's lists (backend app/api/book.py). One read returns every list with
 * its items and the titles to draw them; a write returns the list it changed.
 * A speech that leaves the Book drops out of every list on the server's side
 * and comes back with it, so the app never tidies lists after a removal.
 */

export interface ListItem {
  id: number;
  kind: 'speech' | 'sides';
  monologue_id: number | null;
  user_script_id: number | null;
  title: string;
  subtitle: string | null;
  position: number;
}

export interface BookList {
  id: number;
  title: string;
  position: number;
  items: ListItem[];
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = await authHeaders();
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}/api/book${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, `book ${method} ${path} failed (${res.status})`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const getLists = () => call<BookList[]>('GET', '/lists');
export const createList = (title: string) => call<BookList>('POST', '/lists', { title });
export const renameList = (id: number, title: string) => call<BookList>('PATCH', `/lists/${id}`, { title });
export const orderLists = (ids: number[]) => call<BookList[]>('PUT', '/lists/order', { ids });
export const deleteList = (id: number) => call<void>('DELETE', `/lists/${id}`);
export const restoreList = (id: number) => call<BookList>('POST', `/lists/${id}/restore`);

export type Keepable = { monologue_id: number } | { user_script_id: number };

/** A link to the list on actorrise.com: titles and running times, never the words. The same link until it is taken back. */
export const shareList = (id: number) => call<{ token: string; url: string }>('POST', `/lists/${id}/share`);
export const unshareList = (id: number) => call<void>('DELETE', `/lists/${id}/share`);

export const addToList = (id: number, what: Keepable) => call<BookList>('POST', `/lists/${id}/items`, what);
export const removeFromList = (id: number, itemId: number) => call<void>('DELETE', `/lists/${id}/items/${itemId}`);

/** Whether this list already holds the thing. */
export function holds(list: BookList, what: Keepable): boolean {
  return list.items.some((i) =>
    'monologue_id' in what ? i.monologue_id === what.monologue_id : i.user_script_id === what.user_script_id,
  );
}

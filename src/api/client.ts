import type { components, paths } from './schema';
import { supabase } from '../lib/supabase';

/**
 * Typed client for the ActorRise FastAPI backend (`api.actorrise.com`) — the
 * same service the web app uses (spec §4, no new backend). Types come straight
 * from the server's OpenAPI schema via `npm run api:types`, so a backend change
 * that breaks this surfaces as a TypeScript error rather than a runtime 500.
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.actorrise.com';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export type Monologue = components['schemas']['MonologueResponse'];
export type SearchResponse = components['schemas']['SearchResponse'];
export type SearchParams = NonNullable<
  paths['/api/monologues/search']['get']['parameters']['query']
>;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Auth is a Supabase JWT in `Authorization: Bearer <token>` (spec §4). When
 * there is no session yet — anonymous sign-ins still disabled server-side — we
 * fall through with just the anon key so callers get a clean 401 to handle
 * rather than a thrown "no token" surprise.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (ANON_KEY) headers.apikey = ANON_KEY;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function toQuery(params: SearchParams): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    q.set(key, String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function searchMonologues(
  params: SearchParams,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const res = await fetch(`${API_URL}/api/monologues/search${toQuery(params)}`, {
    headers: await authHeaders(),
    signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, `search failed (${res.status})`);
  }
  return (await res.json()) as SearchResponse;
}

/**
 * Read state (spec §4 #2). Typed by hand because these fields are newer than the
 * committed OpenAPI snapshot; regenerate `schema.d.ts` once the backend ships.
 */
export interface ReadState {
  reads_used: number;
  reads_limit: number; // -1 = unlimited (paid)
  is_paid: boolean;
  atWall: boolean; // free user who has spent their lifetime reads
}

/** Lifetime read count + wall state, from GET /api/subscriptions/usage. */
export async function getReadState(signal?: AbortSignal): Promise<ReadState> {
  const res = await fetch(`${API_URL}/api/subscriptions/usage`, {
    headers: await authHeaders(),
    signal,
  });
  if (!res.ok) throw new ApiError(res.status, `usage failed (${res.status})`);
  const j = (await res.json()) as {
    monologue_reads_used?: number;
    monologue_reads_limit?: number;
  };
  const used = j.monologue_reads_used ?? 0;
  const limit = j.monologue_reads_limit ?? 3;
  const isPaid = limit === -1;
  return { reads_used: used, reads_limit: limit, is_paid: isPaid, atWall: !isPaid && used >= limit };
}

/** Save / unsave (spec §4, `POST`/`DELETE /api/monologues/{id}/favorite`). */
export async function setFavorite(id: string | number, on: boolean): Promise<void> {
  const res = await fetch(`${API_URL}/api/monologues/${id}/favorite`, {
    method: on ? 'POST' : 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new ApiError(res.status, `favorite ${id} failed (${res.status})`);
}

/** The saved list (spec §4, `GET /api/monologues/favorites/my`). */
export async function getFavorites(signal?: AbortSignal): Promise<Monologue[]> {
  const res = await fetch(`${API_URL}/api/monologues/favorites/my`, {
    headers: await authHeaders(),
    signal,
  });
  if (!res.ok) throw new ApiError(res.status, `favorites failed (${res.status})`);
  return (await res.json()) as Monologue[];
}

export type PrepState = 'memorized' | 'studied' | 'cut';

/** Prep state (spec §4, `POST /api/monologues/{id}/memorized·studied·cut`). */
export async function setPrepState(id: string | number, kind: PrepState): Promise<void> {
  const res = await fetch(`${API_URL}/api/monologues/${id}/${kind}`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new ApiError(res.status, `${kind} ${id} failed (${res.status})`);
}

/** Notes on a save (spec §4, `PATCH /api/monologues/{id}/favorite/notes`). */
export async function setFavoriteNotes(id: string | number, notes: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/monologues/${id}/favorite/notes`, {
    method: 'PATCH',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) throw new ApiError(res.status, `notes ${id} failed (${res.status})`);
}

/** Full monologue by id (spec §4, `GET /api/monologues/{id}`) — the Read screen. */
export async function getMonologue(id: string | number, signal?: AbortSignal): Promise<Monologue> {
  const res = await fetch(`${API_URL}/api/monologues/${id}`, {
    headers: await authHeaders(),
    signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, `monologue ${id} failed (${res.status})`);
  }
  return (await res.json()) as Monologue;
}

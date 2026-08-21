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

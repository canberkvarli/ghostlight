import type { components, paths } from './schema';
import { deviceId } from '../lib/device';
import { supabase } from '../lib/supabase';

/**
 * Typed client for the ActorRise FastAPI backend (`api.actorrise.com`) — the
 * same service the web app uses (spec §4, no new backend). Types come straight
 * from the server's OpenAPI schema via `npm run api:types`, so a backend change
 * that breaks this surfaces as a TypeScript error rather than a runtime 500.
 */

/**
 * Full reads a day before the wall, refilled at the phone's midnight. The
 * server owns the number (monologue_reads_limit); this is only what is shown
 * before it has answered. It was one for life until the server went to three a
 * day: a habit the wall shuts on the first night is not a habit.
 */
export const FREE_READS = 3;

/** The phone's own zone, so "today" ends at the actor's midnight, not the server's. */
export const TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
})();

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.actorrise.com';
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
 * Which product is asking. The API runs two separate free trials off the same
 * database — the web gets 5 pieces a calendar month, Ghost Light gets 3 for
 * life — and it tells them apart by this header alone. Anything it does not
 * recognise counts as the web, deliberately, because guessing "ghostlight"
 * would spend a stranger's lifetime trial on a request that was never theirs.
 *
 * So the cost of omitting this is not an error, it is Ghost Light quietly
 * drinking from the web's monthly pool: reads in the app would burn the same
 * allowance as reads in a browser, and the wall would say the wrong number.
 * It belongs on every call, not just the ones that count reads today.
 *
 * Must stay exactly "ghostlight" — the server compares lowercased strings.
 */
const CLIENT = 'ghostlight';

/**
 * Auth is a Supabase JWT in `Authorization: Bearer <token>` (spec §4). When
 * there is no session yet — anonymous sign-ins still disabled server-side — we
 * fall through with just the anon key so callers get a clean 401 to handle
 * rather than a thrown "no token" surprise.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Client': CLIENT };
  if (ANON_KEY) headers.apikey = ANON_KEY;
  if (TIMEZONE) headers['X-Timezone'] = TIMEZONE;
  if (token) headers.Authorization = `Bearer ${token}`;
  // Survives sign-out, which `user_id` does not — see src/lib/device.ts. Inert
  // until the backend counts against it; sending it early means the server-side
  // half lands on its own without waiting for another binary to reach everyone.
  const device = await deviceId();
  if (device) headers['X-Device-Id'] = device;
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
  atWall: boolean; // free user who has spent today's reads
  /** Scene partner runs this month, and the month's allowance (-1 = unlimited). */
  runs_used: number;
  runs_limit: number;
  /** Scripts of your own sides on the account, and the allowance (-1 = unlimited). */
  scripts_used: number;
  scripts_limit: number;
}

/** The meter and the plan in one place: free, with no run left this month. */
export function runsSpent(w: ReadState | undefined): boolean {
  if (!w || w.is_paid || w.runs_limit < 0) return false;
  return w.runs_used >= w.runs_limit;
}

/** Today's read count + wall state, from GET /api/subscriptions/usage. */
export async function getReadState(signal?: AbortSignal): Promise<ReadState> {
  const res = await fetch(`${API_URL}/api/subscriptions/usage`, {
    headers: await authHeaders(),
    signal,
  });
  // A 401 means there is no session — anonymous or otherwise — so the honest
  // answer is "not paid", not an error. Throwing here was half of the
  // filters-stay-unlocked-after-sign-out bug: the query is `retry: false`, and
  // React Query keeps the last successful data when a refetch throws, so the
  // signed-out 401 PRESERVED the previous account's `is_paid: true` instead of
  // clearing it. Returning a locked state makes the failure fail closed.
  if (res.status === 401 || res.status === 403) {
    return { reads_used: 0, reads_limit: FREE_READS, is_paid: false, atWall: false, runs_used: 0, runs_limit: 1, scripts_used: 0, scripts_limit: 1 };
  }
  if (!res.ok) throw new ApiError(res.status, `usage failed (${res.status})`);
  const j = (await res.json()) as {
    monologue_reads_used?: number;
    monologue_reads_limit?: number;
    scene_partner_used?: number;
    scene_partner_limit?: number;
    scripts_used?: number;
    scripts_limit?: number;
  };
  const used = j.monologue_reads_used ?? 0;
  const limit = j.monologue_reads_limit ?? FREE_READS;
  const isPaid = limit === -1;
  // The server's number, unclamped: it spends the reads and walls the text, so
  // a stricter count here would only show a wall the server would not.
  return {
    reads_used: used,
    reads_limit: limit,
    is_paid: isPaid,
    atWall: !isPaid && used >= limit,
    // The partner's meter, straight from the server: runs this month and
    // scripts on the account. Paid tiers answer -1.
    runs_used: j.scene_partner_used ?? 0,
    runs_limit: isPaid ? -1 : (j.scene_partner_limit ?? 1),
    scripts_used: j.scripts_used ?? 0,
    scripts_limit: isPaid ? -1 : (j.scripts_limit ?? 1),
  };
}

/**
 * Permanently delete the account and all its data (Apple requires this in-app
 * once sign-in is offered). The caller signs out afterwards.
 */
export async function deleteAccount(): Promise<void> {
  const res = await fetch(`${API_URL}/api/account/delete`, {
    method: 'POST',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new ApiError(res.status, `delete failed (${res.status})`);
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

/**
 * Off book, on or off. `setPrepState('memorized')` can only set it: the route
 * defaults `memorized` to true when no body is sent, so unticking needs one.
 */
export async function setMemorized(id: string | number, on: boolean): Promise<void> {
  const headers = await authHeaders();
  headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}/api/monologues/${id}/memorized`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ memorized: on }),
  });
  if (!res.ok) throw new ApiError(res.status, `memorized ${id} failed (${res.status})`);
}

/**
 * The audition cut (`POST /api/monologues/{id}/cut`): first and last unit, or
 * both null to clear it. The server adds the piece to the book if it isn't there.
 */
export async function setCut(id: string | number, start: number | null, end: number | null): Promise<void> {
  const headers = await authHeaders();
  headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}/api/monologues/${id}/cut`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ start_line: start, end_line: end }),
  });
  if (!res.ok) throw new ApiError(res.status, `cut ${id} failed (${res.status})`);
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

/** Discover / random lineup for the cold start (spec §4, `GET /api/monologues/discover`). */
export async function getDiscover(limit = 30, signal?: AbortSignal): Promise<Monologue[]> {
  const res = await fetch(`${API_URL}/api/monologues/discover?limit=${limit}`, {
    headers: await authHeaders(),
    signal,
  });
  if (!res.ok) throw new ApiError(res.status, `discover failed (${res.status})`);
  return (await res.json()) as Monologue[];
}

/** "More like this" (spec §4, `GET /api/monologues/{id}/similar`) — the Read screen. */
export async function getSimilar(
  id: string | number,
  limit = 6,
  signal?: AbortSignal,
): Promise<Monologue[]> {
  const res = await fetch(`${API_URL}/api/monologues/${id}/similar?limit=${limit}`, {
    headers: await authHeaders(),
    signal,
  });
  if (!res.ok) throw new ApiError(res.status, `similar ${id} failed (${res.status})`);
  return (await res.json()) as Monologue[];
}

/** One day of the house's run (`GET /api/monologues/tonight`). */
export interface TonightDay {
  /** Local calendar date, `YYYY-MM-DD`. */
  day: string;
  /** The one line a widget shows. */
  quote: string;
  /** The piece, with the opening lines only. */
  monologue: Monologue;
}

/**
 * Tonight's speech for a run of days, picked on the server so the phone, the
 * widget and the evening knock all name the same one. Public: no session
 * needed, which is why it is the one list that can fill before one exists.
 */
export async function getTonight(house: 'stage' | 'screen', days = 8, signal?: AbortSignal): Promise<TonightDay[]> {
  const res = await fetch(`${API_URL}/api/monologues/tonight?house=${house}&days=${days}`, {
    headers: { Accept: 'application/json', 'X-Client': CLIENT },
    signal,
  });
  if (!res.ok) throw new ApiError(res.status, `tonight failed (${res.status})`);
  const j = (await res.json()) as { days: TonightDay[] };
  return j.days;
}

/** This actor's own speech tonight, whole: tonight's is never walled. */
export interface MyTonight {
  day: string;
  house: 'stage' | 'screen';
  quote: string;
  /** Null until the actor answers. */
  answer: 'keep' | 'pass' | null;
  monologue: Monologue;
}

/**
 * Chosen once a night on the server from what this actor keeps and what they
 * have passed on, on the phone's own date. Needs a session; null without one
 * or when the house has nothing to give.
 */
export async function getMyTonight(house: 'stage' | 'screen', signal?: AbortSignal): Promise<MyTonight | null> {
  const res = await fetch(`${API_URL}/api/monologues/tonight/mine?house=${house}`, { headers: await authHeaders(), signal });
  if (res.status === 401 || res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, `my tonight failed (${res.status})`);
  return (await res.json()) as MyTonight;
}

/** Keep or Not for me. It shapes tomorrow's pick. */
export async function answerMyTonight(house: 'stage' | 'screen', answer: 'keep' | 'pass'): Promise<void> {
  const headers = await authHeaders();
  headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}/api/monologues/tonight/mine/answer`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ house, answer }),
  });
  if (!res.ok) throw new ApiError(res.status, `tonight answer failed (${res.status})`);
}

/** What other actors are working on (`GET /api/monologues/trending`) — the search screen before a past. */
export async function getTrending(limit = 20, signal?: AbortSignal): Promise<Monologue[]> {
  const res = await fetch(`${API_URL}/api/monologues/trending?limit=${limit}`, {
    headers: await authHeaders(),
    signal,
  });
  if (!res.ok) throw new ApiError(res.status, `trending failed (${res.status})`);
  return (await res.json()) as Monologue[];
}

/** The other speeches in the same play or script (`GET /api/monologues/{id}/from-play`). */
export async function getFromPlay(
  id: string | number,
  limit = 6,
  signal?: AbortSignal,
): Promise<Monologue[]> {
  const res = await fetch(`${API_URL}/api/monologues/${id}/from-play?limit=${limit}`, {
    headers: await authHeaders(),
    signal,
  });
  if (!res.ok) throw new ApiError(res.status, `from-play ${id} failed (${res.status})`);
  return (await res.json()) as Monologue[];
}

/**
 * Ask for a monologue we don't have yet (spec §4, `POST /api/monologues/content-request`)
 * — the graceful answer to an empty search: a play, an author, or the raw query.
 */
export async function requestContent(body: {
  query?: string;
  play_title?: string;
  author?: string;
  character_name?: string;
}): Promise<void> {
  const res = await fetch(`${API_URL}/api/monologues/content-request`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, `content request failed (${res.status})`);
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

/**
 * How many monologues the house holds. The search endpoint's `total` is the
 * size of the page it drew, not the library (an empty query with limit 1
 * answered "1", which is where "all 1" on the paywall came from), so the
 * count comes off the database stats instead.
 */
export async function getCatalogueCount(signal?: AbortSignal): Promise<number | null> {
  const res = await fetch(`${API_URL}/api/monologues/stats/database`, { headers: await authHeaders(), signal });
  if (!res.ok) return null;
  const j = (await res.json()) as { total_monologues?: number };
  return typeof j.total_monologues === 'number' && j.total_monologues > 0 ? j.total_monologues : null;
}

import { authHeaders, API_URL, ApiError } from './client';

/**
 * The audition tracker, over the same `/api/auditions` the website uses. The
 * shapes below are typed by hand from `backend/app/api/auditions.py`: the
 * committed OpenAPI snapshot predates the tracker, and regenerating it pulls in
 * a dozen routes the app will never call.
 *
 * The app sends a deliberately small subset of what the web form knows about:
 * when, what, who, where, and one piece from the book. The rest (casting,
 * bring list, after-notes, the AI help) stays on the website, where there is
 * room for it.
 */

export type AuditionKind = 'in_person' | 'self_tape' | 'virtual';
/** What the chips on the form and the cards on the list call each kind. */
export const KIND_LABEL: Record<AuditionKind, string> = {
  in_person: 'In the room',
  self_tape: 'Self-tape',
  virtual: 'Virtual',
};

export type AuditionStatus = 'submitted' | 'scheduled' | 'callback' | 'booked' | 'pinned' | 'passed';
export type AuditionScope = 'upcoming' | 'waiting' | 'past';

export interface AuditionPiece {
  id: number;
  monologue_id: number | null;
  scene_id: number | null;
  used: boolean;
  title: string | null;
  character: string | null;
  play_title: string | null;
}

export interface Audition {
  id: number;
  project: string;
  role: string | null;
  kind: AuditionKind;
  status: AuditionStatus;
  /** In-person and virtual auditions have a start; a self-tape has a due time. */
  starts_at: string | null;
  due_at: string | null;
  /** Whichever of the two applies. Null for an audition with no date yet. */
  when: string | null;
  tz: string;
  location: string | null;
  tape_link: string | null;
  notes: string | null;
  reminders_on: boolean;
  scope: AuditionScope;
  created_at: string | null;
  pieces: AuditionPiece[];
}

export interface AuditionDraft {
  project: string;
  role?: string | null;
  kind: AuditionKind;
  starts_at?: string | null;
  due_at?: string | null;
  tz?: string;
  location?: string | null;
  tape_link?: string | null;
  notes?: string | null;
}

const BASE = `${API_URL}/api/auditions`;

async function json(method: string, path: string, body?: unknown): Promise<Response> {
  const headers = await authHeaders();
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Every audition that is not deleted; the server sorts and scopes them. */
export async function listAuditions(scope?: AuditionScope, signal?: AbortSignal): Promise<Audition[]> {
  const res = await fetch(`${BASE}${scope ? `?scope=${scope}` : ''}`, {
    headers: await authHeaders(),
    signal,
  });
  if (!res.ok) throw new ApiError(res.status, `auditions failed (${res.status})`);
  return (await res.json()) as Audition[];
}

export async function createAudition(draft: AuditionDraft): Promise<Audition> {
  const res = await json('POST', '', { ...draft, source: 'manual' });
  if (!res.ok) throw new ApiError(res.status, `create audition failed (${res.status})`);
  return (await res.json()) as Audition;
}

export async function patchAudition(id: number, patch: Partial<AuditionDraft>): Promise<Audition> {
  const res = await json('PATCH', `/${id}`, patch);
  if (!res.ok) throw new ApiError(res.status, `patch audition ${id} failed (${res.status})`);
  return (await res.json()) as Audition;
}

export async function deleteAudition(id: number): Promise<void> {
  const res = await json('DELETE', `/${id}`);
  if (!res.ok) throw new ApiError(res.status, `delete audition ${id} failed (${res.status})`);
}

/** Attach a saved piece. A second attach of the same monologue is a no-op server-side. */
export async function addAuditionPiece(id: number, monologueId: number): Promise<Audition> {
  const res = await json('POST', `/${id}/pieces`, { monologue_id: monologueId });
  if (!res.ok) throw new ApiError(res.status, `attach piece failed (${res.status})`);
  return (await res.json()) as Audition;
}

export async function removeAuditionPiece(id: number, pieceId: number): Promise<void> {
  const res = await json('DELETE', `/${id}/pieces/${pieceId}`);
  if (!res.ok) throw new ApiError(res.status, `detach piece failed (${res.status})`);
}

/** The monologue an audition is bringing, if it is bringing one. */
export function attachedPiece(a: Audition): AuditionPiece | null {
  return a.pieces.find((p) => p.monologue_id != null) ?? null;
}

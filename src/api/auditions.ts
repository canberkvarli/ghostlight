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

/** One thing to bring: from the casting email, from the model's read, or typed. */
export interface BringItem {
  text: string;
  done: boolean;
  src: 'email' | 'ai' | 'me';
}

/** How it went, written after. The website's three questions. */
export type AfterNotes = Partial<Record<'how' | 'differently' | 'room', string>>;

/** Which of the three reminder emails this audition gets. */
export type ReminderMoment = 'prep' | 'eve' | 'after';
export const REMINDER_MOMENTS: ReminderMoment[] = ['prep', 'eve', 'after'];

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
  casting: string | null;
  /** What they asked for, in their words ("two contrasting pieces, under 2 min"). */
  material_raw: string | null;
  /** The email's "bring" line as read. The list below is what you tick. */
  bring: string | null;
  tape_link: string | null;
  notes: string | null;
  reminders_on: boolean;
  reminder_moments: ReminderMoment[];
  scope: AuditionScope;
  created_at: string | null;
  after_notes: AfterNotes | null;
  bring_list: BringItem[];
  /** The callback added from this one, if any. */
  callback_id: number | null;
  pieces: AuditionPiece[];
}

/** "How did it go?" The server moves the status for a callback or a pass. */
export type Outcome = 'good' | 'callback' | 'no';
export const OUTCOME_LABEL: Record<Outcome, string> = {
  good: 'Felt good',
  callback: 'Got a callback',
  no: 'Not this time',
};
export const STATUS_LABEL: Record<AuditionStatus, string> = {
  submitted: 'Submitted',
  scheduled: 'Audition',
  callback: 'Callback',
  booked: 'Booked',
  pinned: 'Pinned',
  passed: 'Passed',
};

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
  casting?: string | null;
  material_raw?: string | null;
  /** The email's "bring" line. The server splits it into the first bring items. */
  bring?: string | null;
}

/** What the file can change without opening the form. */
export interface AuditionPatch extends Partial<AuditionDraft> {
  bring_list?: BringItem[];
  after_notes?: AfterNotes;
  reminders_on?: boolean;
  reminder_moments?: ReminderMoment[];
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

export async function patchAudition(id: number, patch: AuditionPatch): Promise<Audition> {
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

export async function logOutcome(id: number, outcome: Outcome): Promise<Audition> {
  const res = await json('POST', `/${id}/outcome`, { outcome });
  if (!res.ok) throw new ApiError(res.status, `log outcome failed (${res.status})`);
  return (await res.json()) as Audition;
}

/**
 * The model reads the part and says what to wear; its ideas land on the bring
 * list marked "ai". Needs a role or an "asked for" line to go on; with neither
 * the server returns the row unchanged.
 */
export async function assistRead(id: number): Promise<Audition> {
  const res = await json('POST', `/${id}/assist/read`);
  if (!res.ok) throw new ApiError(res.status, `assist read failed (${res.status})`);
  return (await res.json()) as Audition;
}

/** A callback: a new audition for the same project, linked from this one. */
export async function addCallback(id: number): Promise<Audition> {
  const res = await json('POST', `/${id}/callback`);
  if (!res.ok) throw new ApiError(res.status, `add callback failed (${res.status})`);
  return (await res.json()) as Audition;
}

/**
 * The private calendar feed for this account, minted on first ask. The same
 * URL the website hands out, so subscribing on the phone and on the laptop is
 * one calendar, not two.
 */
export async function calendarFeedUrl(): Promise<string> {
  const res = await json('GET', '/calendar-link');
  if (!res.ok) throw new ApiError(res.status, `calendar link failed (${res.status})`);
  return ((await res.json()) as { url: string }).url;
}

/** The monologue an audition is bringing, if it is bringing one. */
export function attachedPiece(a: Audition): AuditionPiece | null {
  return a.pieces.find((p) => p.monologue_id != null) ?? null;
}

/**
 * "Paste the casting email." The same reader the website uses: the notice goes
 * up as text, a model reads it into a draft, and every field comes back with
 * how sure it was. Dates are ISO in the zone we send. Free accounts get a few
 * reads a month; the 403 carries the quota so the form can say so.
 */
export interface ParsedField<T = string | null> {
  value: T;
  confidence: 'high' | 'low';
}

export interface ParsedDraft {
  project: ParsedField;
  role: ParsedField;
  kind: ParsedField<AuditionKind>;
  starts_at: ParsedField;
  due_at: ParsedField;
  location: ParsedField;
  casting: ParsedField;
  material_raw: ParsedField;
  bring: ParsedField;
  notes: ParsedField;
}

export interface ParseQuota {
  used: number;
  limit: number;
  remaining: number;
  tier: 'free' | 'plus' | 'pro';
}

export interface ParseResult {
  ok: boolean;
  draft: ParsedDraft;
  quota: ParseQuota;
}

export class ParseQuotaError extends ApiError {
  constructor(public quota: ParseQuota | null) {
    super(403, 'audition parse quota');
  }
}

export async function parseNotice(text: string, tz: string): Promise<ParseResult> {
  const body = new FormData();
  body.append('text', text);
  body.append('tz', tz);
  // No Content-Type: fetch writes the multipart boundary itself.
  const res = await fetch(`${BASE}/parse`, { method: 'POST', headers: await authHeaders(), body });
  if (res.status === 403) {
    let quota: ParseQuota | null = null;
    try {
      const j = (await res.json()) as { detail?: { error?: string; quota?: ParseQuota } };
      if (j.detail?.error === 'audition_parse_quota') quota = j.detail.quota ?? null;
    } catch {
      // Not the quota 403; fall through to the generic error.
    }
    if (quota) throw new ParseQuotaError(quota);
  }
  if (!res.ok) throw new ApiError(res.status, `parse failed (${res.status})`);
  return (await res.json()) as ParseResult;
}

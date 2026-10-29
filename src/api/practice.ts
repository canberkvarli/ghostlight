import { API_URL, ApiError, authHeaders } from './client';

/** The check-in's log (backend app/api/practice.py): one row a thing worked on, on the phone's own date. */
export type PracticeKind = 'speech' | 'scene' | 'class' | 'audition' | 'rehearsal';

export interface PracticeEntry {
  id: number;
  /** `YYYY-MM-DD`, the actor's own date. */
  day: string;
  kind: PracticeKind;
  note: string | null;
  /** How long the timer ran, for a session timed in the app; null for work done away from it. */
  seconds?: number | null;
}

export const PRACTICE_LABEL: Record<PracticeKind, string> = {
  speech: 'A speech',
  scene: 'A scene',
  class: 'Class',
  audition: 'An audition',
  rehearsal: 'Rehearsal for a show',
};

export async function listPractice(signal?: AbortSignal): Promise<PracticeEntry[]> {
  const res = await fetch(`${API_URL}/api/practice?days=62`, { headers: await authHeaders(), signal });
  if (!res.ok) throw new ApiError(res.status, `practice failed (${res.status})`);
  return (await res.json()) as PracticeEntry[];
}

export async function addPractice(kind: PracticeKind, note: string | null, seconds?: number | null): Promise<PracticeEntry> {
  const headers = await authHeaders();
  headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_URL}/api/practice`, { method: 'POST', headers, body: JSON.stringify({ kind, note, seconds: seconds || null }) });
  if (!res.ok) throw new ApiError(res.status, `check-in failed (${res.status})`);
  return (await res.json()) as PracticeEntry;
}

export async function deletePractice(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/practice/${id}`, { method: 'DELETE', headers: await authHeaders() });
  if (!res.ok && res.status !== 404) throw new ApiError(res.status, `delete failed (${res.status})`);
}

/**
 * A `YYYY-MM-DD` as a moment on that local day. Parsed as a date string it
 * would be UTC midnight, which west of Greenwich is the evening before. A
 * minute past local midnight, not noon: the streak ignores moments still to
 * come, and a morning check-in has to count.
 */
export function onLocalDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 1);
}

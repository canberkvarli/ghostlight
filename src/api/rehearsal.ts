/**
 * ScenePartner's end of the API: the scene with its partner audio, runs and
 * the journal, the scene library, and the actor's own scripts. The loop
 * itself never calls the server between one line and the next; everything
 * here is before a run, after it, or fire-and-forget beside it.
 */
import { API_URL, ApiError, authHeaders } from './client';
import type { GuidedRun, JournalEvent, ResumedRun, ScenePayload } from '../rehearsal/contract';

async function call<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
    signal,
  });
  if (!res.ok) {
    let detail = `${path} failed (${res.status})`;
    let upgrade: string | null = null;
    try {
      const j = (await res.json()) as { detail?: string | { message?: string; upgrade_url?: string } };
      if (typeof j.detail === 'string') detail = j.detail;
      else if (j.detail?.message) { detail = j.detail.message; upgrade = j.detail.upgrade_url ?? null; }
    } catch { /* no body */ }
    throw new RehearsalApiError(res.status, detail, upgrade);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** A refusal that is an answer, not a breakage: the gate names where the plans are. */
export class RehearsalApiError extends ApiError {
  constructor(status: number, message: string, public upgradeUrl: string | null) {
    super(status, message);
    this.name = 'RehearsalApiError';
  }
  /** 402 is the meter, 403 the plan. Both are a wall, not an error. */
  get gated() { return this.status === 402 || this.status === 403; }
}

// ── the run ──

export const getRehearsalScene = (sceneId: number, signal?: AbortSignal) =>
  call<ScenePayload>(`/api/rehearsal/scenes/${sceneId}`, {}, signal);

export interface LineSource { key: string; url: string | null }

/** Ask for one partner line in one voice. The url is null while it is still being synthesised. */
export const requestAudio = (sceneId: number, lineIndex: number, voice: string) =>
  call<LineSource>('/api/rehearsal/audio', { method: 'POST', body: JSON.stringify({ scene_id: sceneId, line_index: lineIndex, voice }) });

/** Poll a line by key: 200 with a url when ready, 202 (null here) while not. */
export async function pollAudio(key: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/api/rehearsal/audio/${key}`, { headers: await authHeaders() });
  if (res.status === 202) return null;
  if (!res.ok) throw new ApiError(res.status, `audio ${res.status}`);
  return ((await res.json()) as LineSource).url;
}

export const openRun = (sceneId: number, character: string, voices: Record<string, string>) =>
  call<{ run_id: number; voices: Record<string, string> }>('/api/rehearsal/runs', {
    method: 'POST', body: JSON.stringify({ scene_id: sceneId, character, voices }),
  });

export const openGuidedRun = () => call<GuidedRun>('/api/rehearsal/runs/guided', { method: 'POST' });

export const resumeRun = (runId: number) => call<ResumedRun>(`/api/rehearsal/runs/${runId}/resume`, { method: 'POST' });

export const postEvents = (runId: number, events: JournalEvent[]) =>
  call<void>(`/api/rehearsal/runs/${runId}/events`, { method: 'POST', body: JSON.stringify({ events }) });

export const getGuided = (signal?: AbortSignal) =>
  call<{ scene_id: number; character: string }>('/api/rehearsal/guided', {}, signal);

export interface RunStats { runs: number; finished: number; lines_read: number; scenes: number }
export const getRunStats = (signal?: AbortSignal) => call<RunStats>('/api/rehearsal/stats', {}, signal);

// ── the library and the actor's own scripts ──

export interface SceneSummary {
  id: number;
  play_id: number;
  play_title: string;
  play_author: string;
  title: string;
  act: string | null;
  scene_number: string | null;
  description: string | null;
  difficulty_level: string | null;
  is_library: boolean;
  is_free_library: boolean;
  character_1_name: string;
  character_2_name: string;
  character_1_gender: string | null;
  character_2_gender: string | null;
  line_count: number;
  estimated_duration_seconds: number;
  primary_emotions: string[];
  relationship_dynamic: string | null;
  tone: string | null;
}

export const listScenes = (signal?: AbortSignal) => call<SceneSummary[]>('/api/scenes/?library_only=true&limit=100', {}, signal);

export interface ScriptSummary {
  id: number;
  title: string;
  author: string;
  original_filename: string;
  file_type: string;
  processing_status: string;
  processing_error: string | null;
  num_characters: number;
  num_scenes_extracted: number;
  characters: { name: string; line_count?: number; gender?: string | null }[];
  created_at: string;
  is_sample: boolean;
  first_scene_title: string | null;
  scene_titles: string[];
}

export interface ScriptScene {
  id: number;
  title: string;
  description: string | null;
  act: string | null;
  scene_number: string | null;
  line_count: number;
  estimated_duration_seconds: number;
}

export interface ScriptDetail extends ScriptSummary { scenes: ScriptScene[] }

export const listScripts = (signal?: AbortSignal) => call<ScriptSummary[]>('/api/scripts/', {}, signal);
export const getScript = (id: number, signal?: AbortSignal) => call<ScriptDetail>(`/api/scripts/${id}`, {}, signal);
export const deleteScript = (id: number) => call<void>(`/api/scripts/${id}`, { method: 'DELETE' });

/** A file from the share sheet or Files: PDF, Word or text. The server reads it and splits the cast. */
export async function uploadScript(file: { uri: string; name: string; mimeType?: string }, title?: string): Promise<ScriptDetail> {
  const form = new FormData();
  // React Native's FormData takes a file descriptor object, not a Blob.
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType ?? 'application/octet-stream' } as unknown as Blob);
  if (title) form.append('title', title);
  return call<ScriptDetail>('/api/scripts/upload', { method: 'POST', body: form });
}

/** Sides pasted as text. */
export const scriptFromText = (text: string, title?: string) =>
  call<ScriptDetail>('/api/scripts/from-text', { method: 'POST', body: JSON.stringify({ body: text, title }) });

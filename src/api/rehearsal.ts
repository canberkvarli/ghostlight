/**
 * ScenePartner's end of the API: the scene with its partner audio, runs and
 * the journal, the scene library, and the actor's own scripts. The loop
 * itself never calls the server between one line and the next; everything
 * here is before a run, after it, or fire-and-forget beside it.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { File, Paths } from 'expo-file-system';
import { fetch as streamFetch } from 'expo/fetch';

import { API_URL, ApiError, authHeaders } from './client';
import type { GuidedRun, JournalEvent, RehearsalLine, ResumedRun, ScenePayload } from '../rehearsal/contract';

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

/**
 * The guided run: unmetered, any signed-in actor. With nothing, the server
 * picks the scene and the part; with one of the phone's first scenes, the
 * part the actor picked and the voice they heard, it opens that.
 */
export const openGuidedRun = (pick?: { sceneId: number; character: string; voices: Record<string, string> }) =>
  call<GuidedRun>('/api/rehearsal/runs/guided', {
    method: 'POST',
    body: JSON.stringify(pick ? { scene_id: pick.sceneId, character: pick.character, voices: pick.voices } : {}),
  });

export const resumeRun = (runId: number) => call<ResumedRun>(`/api/rehearsal/runs/${runId}/resume`, { method: 'POST' });

export const postEvents = (runId: number, events: JournalEvent[]) =>
  call<void>(`/api/rehearsal/runs/${runId}/events`, { method: 'POST', body: JSON.stringify({ events }) });

/** One of the phone's three first scenes: its key, its two parts with a line of who each is, and where each part's first line is. */
export interface GuidedScene {
  key: 'fight' | 'flirt' | 'confession' | string;
  scene_id: number;
  title: string;
  hook: string | null;
  characters: { name: string; line: string | null; first_line: number | null }[];
}

/** The guided scene and part the server picks, and the three first scenes (absent from a server that predates them). */
export interface GuidedPick { scene_id: number; character: string; scenes?: GuidedScene[] }

export const getGuided = (signal?: AbortSignal) =>
  call<GuidedPick>('/api/rehearsal/guided', {}, signal);

/** The scene left unfinished most recently, as the pick-up card draws it. Null when there is none. */
export interface LatestRun {
  run_id: number;
  scene_id: number;
  title: string;
  play_title: string | null;
  character: string;
  partners: { character: string; voice: string }[];
  line_index: number;
  line_count: number;
  is_guided: boolean;
}
export const getLatestRun = (signal?: AbortSignal) => call<LatestRun | null>('/api/rehearsal/latest', {}, signal);

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

/**
 * A file from the share sheet or Files: PDF, Word or text. The server reads it
 * and splits the cast. Sent by the file system's own uploader, not fetch:
 * React Native 0.86's fetch refuses the {uri, name, type} part the old
 * FormData took ("unsupported FormData parts"), and a Blob of a 10 MB PDF
 * would be read into JavaScript first. The uploader streams it.
 */
export async function uploadScript(file: { uri: string; name: string; mimeType?: string }, title?: string): Promise<ScriptDetail> {
  const res = await FileSystem.uploadAsync(`${API_URL}/api/scripts/upload`, file.uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType: file.mimeType ?? 'application/octet-stream',
    parameters: title ? { title } : {},
    headers: await authHeaders(),
  });
  if (res.status < 200 || res.status >= 300) {
    let detail = `upload failed (${res.status})`;
    let upgrade: string | null = null;
    try {
      const j = JSON.parse(res.body) as { detail?: string | { message?: string; upgrade_url?: string } };
      if (typeof j.detail === 'string') detail = j.detail;
      else if (j.detail?.message) { detail = j.detail.message; upgrade = j.detail.upgrade_url ?? null; }
    } catch { /* no body */ }
    throw new RehearsalApiError(res.status, detail, upgrade);
  }
  return JSON.parse(res.body) as ScriptDetail;
}

/**
 * The same upload, read aloud: the server sends its progress as it goes,
 * one `data:` line at a time, then the script or an error. The phone draws
 * the map from it. Streamed through Expo's fetch, which can read a response
 * as it arrives; the file is read into a Blob first (a script is small).
 * Pasted text goes the same way, as a text file, so it gets the map too.
 */
export async function uploadScriptStream(
  source: { uri: string; name: string; mimeType?: string } | { text: string; name: string },
  title: string | undefined,
  onStep: (raw: string) => void,
  signal?: AbortSignal,
  again = true,
): Promise<ScriptDetail> {
  const form = new FormData();
  if ('text' in source) {
    form.append('file', new Blob([source.text], { type: 'text/plain' }), source.name);
  } else {
    // Expo's fetch reads a file part through bytes(), which the file system's
    // File has. A Blob built from the bytes was never possible (React
    // Native's Blob takes strings and other blobs, not an ArrayBuffer) and a
    // bare {uri} part is not read by this fetch either; both threw before
    // the file left the phone, which was "the file could not be sent" for
    // every pdf and word file.
    form.append('file', new File(source.uri) as unknown as Blob, source.name);
  }
  if (title) form.append('title', title);
  let res: Awaited<ReturnType<typeof streamFetch>>;
  try {
    res = await streamFetch(`${API_URL}/api/scripts/upload-stream`, { method: 'POST', headers: await authHeaders(), body: form, signal });
  } catch (e) {
    // Whatever this fetch makes of the part, the old multipart upload takes
    // the file as a path and always did. No map on the way, but the script.
    if ('uri' in source && e instanceof Error && /formdata|blob|unsupported|bytes/i.test(e.message)) {
      onStep('Sending the file');
      return uploadScript({ uri: source.uri, name: source.name, mimeType: source.mimeType }, title);
    }
    throw e;
  }
  if (!res.ok) {
    let detail = `upload failed (${res.status})`;
    let upgrade: string | null = null;
    try {
      const j = (await res.json()) as { detail?: string | { message?: string; upgrade_url?: string; error?: string } };
      if (typeof j.detail === 'string') detail = j.detail;
      else if (j.detail?.message) { detail = j.detail.message; upgrade = j.detail.upgrade_url ?? null; }
      else if (j.detail?.error === 'feature_not_available') detail = 'Your plan has its scripts. The next one needs the whole stage.';
    } catch { /* no body */ }
    throw new RehearsalApiError(res.status, detail, upgrade);
  }
  // Lines arrive as `data: {...}` separated by blank lines; the last word is done or error.
  let buffer = '';
  let result: ScriptDetail | null = null;
  let failure: string | null = null;
  const take = (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const ev = JSON.parse(line.slice(6)) as { type: string; step?: string; data?: ScriptDetail; detail?: string };
        if (ev.type === 'progress' && ev.step) onStep(ev.step);
        else if (ev.type === 'done' && ev.data) result = ev.data;
        else if (ev.type === 'error') failure = ev.detail ?? 'The script could not be read.';
      } catch { /* a torn line; the next one is whole */ }
    }
  };
  const body = res.body;
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (value) take(decoder.decode(value, { stream: true }));
      if (done || result || failure) break;
    }
    try { await reader.cancel(); } catch { /* finished */ }
  } else {
    take((await res.text()) + '\n');
  }
  if (failure) throw new RehearsalApiError(422, failure, null);
  if (!result && again && !signal?.aborted) {
    // The stream closed with no last word: a proxy let go of it in the
    // middle. The server went on reading and keeps what it read, so the
    // same file asked for again comes back at once.
    onStep('Asking again');
    return uploadScriptStream(source, title, onStep, signal, false);
  }
  if (!result) throw new RehearsalApiError(502, 'The script could not be read.', null);
  return result;
}

/**
 * Sides in, read after: the server keeps the file, hands back a row that is
 * still being read, and finishes on its own time, so the actor can close the
 * sheet, or the app, and come back to it. The website's door. Pasted text is
 * written to a file first and goes the same way. Sent by the file system's
 * uploader, which takes the file as a path and always has.
 */
export async function uploadScriptBackground(
  source: { uri: string; name: string; mimeType?: string } | { text: string; name: string },
  title?: string,
): Promise<ScriptDetail> {
  let uri: string;
  let mimeType: string;
  if ('text' in source) {
    const f = new File(Paths.cache, `paste-${Date.now()}-${source.name}`);
    f.write(source.text);
    uri = f.uri;
    mimeType = 'text/plain';
  } else {
    uri = source.uri;
    mimeType = source.mimeType ?? 'application/octet-stream';
  }
  const res = await FileSystem.uploadAsync(`${API_URL}/api/scripts/upload-background`, uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'file',
    mimeType,
    parameters: title ? { title } : {},
    headers: await authHeaders(),
  });
  if (res.status < 200 || res.status >= 300) {
    let detail = `upload failed (${res.status})`;
    let upgrade: string | null = null;
    try {
      const j = JSON.parse(res.body) as { detail?: string | { message?: string; upgrade_url?: string; error?: string } };
      if (typeof j.detail === 'string') detail = j.detail;
      else if (j.detail?.message) { detail = j.detail.message; upgrade = j.detail.upgrade_url ?? null; }
      else if (j.detail?.error === 'feature_not_available') detail = 'Your plan has its scripts. The next one needs the whole stage.';
    } catch { /* no body */ }
    throw new RehearsalApiError(res.status, detail, upgrade);
  }
  return JSON.parse(res.body) as ScriptDetail;
}

/** Where a background read has got to: the parser's last line, and about how long it takes. */
export interface ScriptProgress {
  status: string | null;
  error: string | null;
  step: string | null;
  elapsed_seconds: number | null;
  estimate_seconds: number | null;
  scenes: number;
}
export const getScriptProgress = (id: number, signal?: AbortSignal) => call<ScriptProgress>(`/api/scripts/${id}/progress`, {}, signal);

/** Stop reading a script: it comes off the shelf, and the upload is given back. */
export const cancelExtraction = (id: number) => call<{ cancelled: boolean }>(`/api/scripts/${id}/cancel-extraction`, { method: 'POST' });

/** Sides pasted as text. */
export const scriptFromText = (text: string, title?: string) =>
  call<ScriptDetail>('/api/scripts/from-text', { method: 'POST', body: JSON.stringify({ body: text, title }) });

/** A line as the actor rewrote it: who, the words, a direction if there is one. */
export interface EditedLine { character: string; text: string; direction: string | null }

/**
 * The lines of a scene of the actor's own, replaced in order. The parts and
 * the length follow on the server; the partner's audio follows by itself,
 * keyed by the words; a run left open on the old lines is closed.
 */
export const editSceneLines = (sceneId: number, lines: EditedLine[]) =>
  call<{ lines: RehearsalLine[]; characters: string[]; line_count: number }>(`/api/rehearsal/scenes/${sceneId}/lines`, {
    method: 'PUT', body: JSON.stringify({ lines }),
  });

/** The actor's runs, newest first: enough of each to count the nights they worked. */
export interface RunDay { run_id: number; started_at: string | null; finished: boolean }
export const listRuns = (signal?: AbortSignal) => call<RunDay[]>('/api/rehearsal/runs', {}, signal);

/** The shelf of your own sides in the order you put it. */
export const reorderScripts = (scriptIds: number[]) =>
  call<{ script_ids: number[] }>('/api/scripts/reorder', { method: 'PATCH', body: JSON.stringify({ script_ids: scriptIds }) });

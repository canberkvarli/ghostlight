// Carried from actorrise lib/rehearsal (commit 9e3414b9). Pure; keep in step with the web,
// the server's line contract and journal are shared.

/** The server shapes. `RehearsalLine` is the extractor contract: four fields. */
export interface RehearsalLine {
  index: number;
  character: string;
  text: string;
  direction: string | null;
}

export interface Voice { id: string; label: string; gender: 'female' | 'male' }

export interface ScenePayload {
  scene: { id: number; title: string; act: string | null; scene_number: string | null; play_title: string | null; is_library: boolean };
  lines: RehearsalLine[];
  characters: string[];
  voices: Voice[];
  defaults: Record<string, Record<string, string>>;
  vendor: string;
  audio: Record<string, { key: string; url: string | null }>;
  resume: { run_id: number; line_index: number } | null;
}

/** What the guided run endpoint hands back: the run it opened and the voices it picked. */
export interface GuidedRun { run_id: number; scene_id: number; character: string; voices: Record<string, string> }

/** POST /runs/{id}/resume: the open run as it was opened, and the furthest line it reached. */
export interface ResumedRun extends GuidedRun { line_index: number }

export type EventType =
  | 'started' | 'line_reached' | 'actor_line_read' | 'partner_line_played'
  | 'paused' | 'resumed' | 'jumped' | 'completed' | 'abandoned';

export interface JournalEvent {
  seq: number;
  type: EventType;
  line_index: number | null;
  at_ms: number;
  payload: Record<string, unknown>;
}

export const sameCharacter = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

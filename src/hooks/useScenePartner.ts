/**
 * ScenePartner's queries: the library of scenes, the actor's own scripts, one
 * scene ready to run, and the ways sides come in. All need a signed-in user
 * (the server's runs and scripts are per person), so every query waits on
 * `enabled`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteScript, getGuided, getLatestRun, getRehearsalScene, getRunStats, getScript, listScenes, listScripts, uploadScriptStream,
} from '../api/rehearsal';

export const SCENES_KEY = ['scenes'] as const;
export const SCRIPTS_KEY = ['scripts'] as const;

export function useScenes(enabled: boolean) {
  return useQuery({ queryKey: SCENES_KEY, queryFn: ({ signal }) => listScenes(signal), enabled, staleTime: 10 * 60_000, retry: 1 });
}

export function useScripts(enabled: boolean) {
  return useQuery({ queryKey: SCRIPTS_KEY, queryFn: ({ signal }) => listScripts(signal), enabled, staleTime: 60_000, retry: 1 });
}

export function useScript(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ['script', id], queryFn: ({ signal }) => getScript(id as number, signal), enabled: enabled && id !== null, staleTime: 60_000, retry: 1,
  });
}

export function useRehearsalScene(sceneId: number | null) {
  return useQuery({
    queryKey: ['rehearsal-scene', sceneId],
    queryFn: ({ signal }) => getRehearsalScene(sceneId as number, signal),
    enabled: sceneId !== null,
    staleTime: 0, // the audio urls are signed and the resume point moves: refetched behind the cached copy
    gcTime: 30 * 60_000, // the cached copy opens the sheet at once; the lines themselves are files on the phone
    retry: 2,
    retryDelay: 900,
  });
}

export function useGuided(enabled: boolean) {
  // A fresh install can open this before its session is minted: a few patient tries, not a wall.
  return useQuery({ queryKey: ['guided'], queryFn: ({ signal }) => getGuided(signal), enabled, staleTime: 60 * 60_000, retry: 3, retryDelay: 900 });
}

export function useRunStats(enabled: boolean) {
  return useQuery({ queryKey: ['run-stats'], queryFn: ({ signal }) => getRunStats(signal), enabled, staleTime: 60_000, retry: 1 });
}

/** A file from Files or the share sheet. Resolves with the script, its cast split. */
/** A file goes up and is read aloud: `onStep` gets the server's lines as they come. */
export function useUploadScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { uri: string; name: string; mimeType?: string; title?: string; onStep?: (raw: string) => void }) =>
      uploadScriptStream({ uri: v.uri, name: v.name, mimeType: v.mimeType }, v.title, v.onStep ?? (() => {})),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: SCRIPTS_KEY }); },
  });
}

/** Pasted text goes the same way, as a text file, and gets the same map. */
export function useScriptFromText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { text: string; title?: string; onStep?: (raw: string) => void }) =>
      uploadScriptStream({ text: v.text, name: `${(v.title ?? 'sides').replace(/[^\w-]+/g, '-').slice(0, 40) || 'sides'}.txt` }, v.title, v.onStep ?? (() => {})),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: SCRIPTS_KEY }); },
  });
}

export function useDeleteScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteScript(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: SCRIPTS_KEY }); },
  });
}

/** The scene left unfinished most recently, for the pick-up card on the home and in the room. */
export function useLatestRun(enabled: boolean) {
  return useQuery({ queryKey: ['latest-run'], queryFn: ({ signal }) => getLatestRun(signal), enabled, staleTime: 30_000, retry: 1 });
}

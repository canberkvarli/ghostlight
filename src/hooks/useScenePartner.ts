/**
 * ScenePartner's queries: the library of scenes, the actor's own scripts, one
 * scene ready to run, and the ways sides come in. All need a signed-in user
 * (the server's runs and scripts are per person), so every query waits on
 * `enabled`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteScript, getGuided, getRehearsalScene, getRunStats, getScript, listScenes, listScripts, scriptFromText, uploadScript,
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
    staleTime: 0, // the audio urls are signed and the resume point moves
    gcTime: 0,
    retry: 1,
  });
}

export function useGuided(enabled: boolean) {
  return useQuery({ queryKey: ['guided'], queryFn: ({ signal }) => getGuided(signal), enabled, staleTime: 60 * 60_000, retry: 1 });
}

export function useRunStats(enabled: boolean) {
  return useQuery({ queryKey: ['run-stats'], queryFn: ({ signal }) => getRunStats(signal), enabled, staleTime: 60_000, retry: 1 });
}

/** A file from Files or the share sheet. Resolves with the script, its cast split. */
export function useUploadScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { uri: string; name: string; mimeType?: string; title?: string }) => uploadScript(v, v.title),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: SCRIPTS_KEY }); },
  });
}

export function useScriptFromText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { text: string; title?: string }) => scriptFromText(v.text, v.title),
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

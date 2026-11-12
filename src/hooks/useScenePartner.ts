/**
 * ScenePartner's queries: the library of scenes, the actor's own scripts, one
 * scene ready to run, and the ways sides come in. All need a signed-in user
 * (the server's runs and scripts are per person), so every query waits on
 * `enabled`.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancelExtraction, deleteScript, getGuided, getLatestRun, getRehearsalScene, getRunStats, getScript, getScriptProgress, listScenes, listScripts,
  uploadScriptBackground, getSceneMap, addScenes, setScriptLayout, renameScriptScene, resetScriptLayout, deleteScriptScene, listDeletedScripts, restoreScript, getShelf,
  type ShelfSortKey,
  type Sendable,
  type SidesSource,
  editSceneLines,
  type EditedLine,
} from '../api/rehearsal';
import type { ScannedScene } from '../rehearsal/scene-map';

export const SCENES_KEY = ['scenes'] as const;
export const SCRIPTS_KEY = ['scripts'] as const;

export function useScenes(enabled: boolean) {
  return useQuery({ queryKey: SCENES_KEY, queryFn: ({ signal }) => listScenes(signal), enabled, staleTime: 10 * 60_000, retry: 1 });
}

/**
 * The shelf, a page at a time. Keyed under SCRIPTS_KEY, so whatever refreshes
 * the scripts (an upload, a delete, a restore, a stop) refreshes the shelf.
 */
export function useShelf(
  p: { q: string; genre: string | null; sort: ShelfSortKey; touched: number[]; reading: boolean },
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: [...SCRIPTS_KEY, 'shelf', p.q.trim(), p.genre, p.sort, p.touched.join(',')],
    queryFn: ({ pageParam, signal }) => getShelf({ q: p.q, genre: p.genre, sort: p.sort, touched: p.touched, offset: pageParam, limit: 30 }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
    enabled,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    // Something still being read is asked about again until it settles.
    refetchInterval: p.reading ? 3000 : false,
    retry: 1,
  });
}

/** Just what is in flight, for the card that follows a read around the app: working on comes whole, the rest is one row. */
export function useShelfHead(enabled: boolean, reading: boolean) {
  return useQuery({
    queryKey: [...SCRIPTS_KEY, 'shelf-head'],
    queryFn: ({ signal }) => getShelf({ limit: 1 }, signal),
    enabled,
    staleTime: 30_000,
    refetchInterval: reading ? 4000 : false,
    retry: 1,
  });
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
    mutationFn: (v: { source: SidesSource; title?: string; picks?: ScannedScene[] }) => uploadScriptBackground(v.source, v.title, v.picks),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: SCRIPTS_KEY }); },
  });
}

/** An opened script's whole map, built rows marked. Asked fresh each time the sheet opens. */
export function useSceneMap(id: number | null, file?: Sendable | null) {
  return useQuery({
    queryKey: ['scene-map', id, file?.uri ?? null],
    queryFn: () => getSceneMap(id as number, file ?? undefined),
    enabled: id !== null,
    staleTime: 0,
    retry: 1,
  });
}

/** More scenes into a script already on the shelf. The shelf follows it reading. */
export function useAddScenes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; picks: ScannedScene[]; file?: Sendable }) => addScenes(v.id, v.picks, v.file),
    onSuccess: (_s, v) => {
      void qc.invalidateQueries({ queryKey: SCRIPTS_KEY });
      void qc.invalidateQueries({ queryKey: ['script', v.id] });
      void qc.invalidateQueries({ queryKey: ['scene-map', v.id] });
    },
  });
}

/**
 * The edited map saved: deletes first, then the new order and acts, then the
 * names. One mutation, so the screen has one thing to wait on.
 */
export function useSaveScriptMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: number; deleted: number[]; renamed: { id: number; title: string }[]; layout: { id: number; act: string | null }[] | null }) => {
      for (const sceneId of v.deleted) await deleteScriptScene(v.id, sceneId);
      if (v.layout) await setScriptLayout(v.id, v.layout);
      for (const r of v.renamed) await renameScriptScene(v.id, r.id, r.title);
    },
    onSettled: (_d, _e, v) => {
      void qc.invalidateQueries({ queryKey: SCRIPTS_KEY });
      void qc.invalidateQueries({ queryKey: ['script', v.id] });
      void qc.invalidateQueries({ queryKey: ['scene-map', v.id] });
      void qc.invalidateQueries({ queryKey: ['latest-run'] });
    },
  });
}

/** Put a script's map back the way it was read. */
export function useResetScriptMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => resetScriptLayout(id),
    onSuccess: (detail, id) => { qc.setQueryData(['script', id], detail); },
    onSettled: (_d, _e, id) => {
      void qc.invalidateQueries({ queryKey: SCRIPTS_KEY });
      void qc.invalidateQueries({ queryKey: ['script', id] });
      void qc.invalidateQueries({ queryKey: ['scene-map', id] });
    },
  });
}

/** A script still being read: where it has got to, asked every few seconds until it settles. */
export function useScriptProgress(id: number | null, every = 2000) {
  return useQuery({
    queryKey: ['script-progress', id],
    queryFn: ({ signal }) => getScriptProgress(id as number, signal),
    enabled: id !== null,
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      return st === 'completed' || st === 'failed' ? false : every;
    },
    retry: false,
  });
}

export function useCancelExtraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => cancelExtraction(id),
    onSettled: () => { void qc.invalidateQueries({ queryKey: SCRIPTS_KEY }); },
  });
}

export function useDeleteScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: number | { id: number; forever: boolean }) => (typeof v === 'number' ? deleteScript(v) : deleteScript(v.id, v.forever)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SCRIPTS_KEY });
      void qc.invalidateQueries({ queryKey: DELETED_KEY });
    },
  });
}

const DELETED_KEY = ['scripts-deleted'];

/** Recently deleted: what came off the shelf in the last thirty days. */
export function useDeletedScripts(enabled: boolean) {
  return useQuery({ queryKey: DELETED_KEY, queryFn: ({ signal }) => listDeletedScripts(signal), enabled, staleTime: 30_000, retry: 1 });
}

export function useRestoreScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => restoreScript(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SCRIPTS_KEY });
      void qc.invalidateQueries({ queryKey: DELETED_KEY });
    },
  });
}

/** The scene left unfinished most recently, for the pick-up card on the home and in the room. */
export function useLatestRun(enabled: boolean) {
  return useQuery({ queryKey: ['latest-run'], queryFn: ({ signal }) => getLatestRun(signal), enabled, staleTime: 30_000, retry: 1 });
}

/** The actor's own lines, rewritten: the scene, the scripts and the scenes all read again. */
export function useEditSceneLines(sceneId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lines: EditedLine[]) => editSceneLines(sceneId, lines),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rehearsal-scene', sceneId] });
      void qc.invalidateQueries({ queryKey: ['scripts'] });
      void qc.invalidateQueries({ queryKey: ['scenes'] });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addAuditionPiece,
  attachedPiece,
  createAudition,
  deleteAudition,
  listAuditions,
  patchAudition,
  removeAuditionPiece,
  type Audition,
  type AuditionDraft,
} from '../api/auditions';
import { track } from '../lib/analytics';
import {
  cancelRemindersFor,
  requestNotificationPermission,
  scheduleRemindersFor,
  syncReminders,
} from '../lib/notifications';

/**
 * The audition list and the three things you can do to it. The server is the
 * only truth (the website writes to the same rows), so every mutation
 * invalidates rather than guessing, and every one of them also keeps the
 * phone's reminders in step: a save schedules, an edit reschedules, a delete
 * cancels.
 */

export const AUDITIONS_KEY = ['auditions'];

export function useAuditions(enabled: boolean) {
  return useQuery<Audition[]>({
    queryKey: AUDITIONS_KEY,
    enabled,
    queryFn: async ({ signal }) => {
      const list = await listAuditions(undefined, signal);
      // The cheapest moment to catch an audition added on the website: the list
      // just arrived, and this is a no-op until permission has been granted.
      void syncReminders(list);
      return list;
    },
  });
}

export interface AuditionSave {
  draft: AuditionDraft;
  /** Catalogue id of the saved piece to bring, or null for none. */
  monologueId: number | null;
}

export function useCreateAudition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, monologueId }: AuditionSave) => {
      let a = await createAudition(draft);
      if (monologueId != null) a = await addAuditionPiece(a.id, monologueId);
      return a;
    },
    onSuccess: async (a) => {
      track('app_audition_created', { kind: a.kind, has_piece: Boolean(attachedPiece(a)) });
      // The one and only moment the permission sheet appears (never at launch).
      // Asked AFTER the save succeeded, so a "don't allow" never costs the
      // audition itself.
      if (await requestNotificationPermission()) await scheduleRemindersFor(a);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: AUDITIONS_KEY }),
  });
}

export function useUpdateAudition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft, monologueId, current }: AuditionSave & { id: number; current: Audition }) => {
      let a = await patchAudition(id, draft);
      const had = attachedPiece(current);
      if (had && had.monologue_id !== monologueId) {
        await removeAuditionPiece(id, had.id);
        a = { ...a, pieces: a.pieces.filter((p) => p.id !== had.id) };
      }
      if (monologueId != null && had?.monologue_id !== monologueId) {
        a = await addAuditionPiece(id, monologueId);
      }
      return a;
    },
    onSuccess: (a) => void scheduleRemindersFor(a),
    onSettled: () => qc.invalidateQueries({ queryKey: AUDITIONS_KEY }),
  });
}

export function useDeleteAudition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAudition(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: AUDITIONS_KEY });
      const previous = qc.getQueryData<Audition[]>(AUDITIONS_KEY);
      qc.setQueryData<Audition[]>(AUDITIONS_KEY, (list) => (list ?? []).filter((a) => a.id !== id));
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(AUDITIONS_KEY, ctx.previous);
    },
    onSuccess: (_void, id) => void cancelRemindersFor(id),
    onSettled: () => qc.invalidateQueries({ queryKey: AUDITIONS_KEY }),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Linking } from 'react-native';

import {
  addAuditionPiece,
  addCallback,
  assistRead,
  attachedPiece,
  calendarFeedUrl,
  createAudition,
  deleteAudition,
  listAuditions,
  logOutcome,
  parseNotice,
  patchAudition,
  ParseQuotaError,
  removeAuditionPiece,
  type Audition,
  type AuditionDraft,
  type AuditionPatch,
  type Outcome,
} from '../api/auditions';
import { track } from '../lib/analytics';
import {
  cancelRemindersFor,
  requestNotificationPermission,
  scheduleRemindersFor,
  syncReminders,
} from '../lib/notifications';

/**
 * The audition list and the things you can do to it. The server is the only
 * truth (the website writes to the same rows), so every mutation invalidates
 * rather than guessing, and every one of them also keeps the phone's reminders
 * in step: a save schedules, an edit reschedules, a delete cancels.
 *
 * The small edits made from the file (a tick on the bring list, a reminder
 * switched off) are shown at once and saved behind: `usePatchAudition` writes
 * the patch into the cached row first and puts the old row back if the save
 * fails. A tick should never wait on the network.
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

/** One audition out of the cached list, or null until it is there. */
export function useAudition(id: number | null, enabled: boolean): Audition | null {
  const { data } = useAuditions(enabled);
  if (id == null) return null;
  return data?.find((a) => a.id === id) ?? null;
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
      // Into the cache now, so the file this lands on has its row before the
      // refetch, and never shows "isn't on your board" for a beat.
      qc.setQueryData<Audition[]>(AUDITIONS_KEY, (list) => [a, ...(list ?? []).filter((x) => x.id !== a.id)]);
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
    onSuccess: (a) => {
      qc.setQueryData<Audition[]>(AUDITIONS_KEY, (list) => (list ?? []).map((x) => (x.id === a.id ? a : x)));
      void scheduleRemindersFor(a);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: AUDITIONS_KEY }),
  });
}

/**
 * A small change from the file, shown before it is saved. The patch is merged
 * into the cached row at once; a failed save puts the old row back.
 */
export function usePatchAudition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: AuditionPatch }) => patchAudition(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: AUDITIONS_KEY });
      const previous = qc.getQueryData<Audition[]>(AUDITIONS_KEY);
      qc.setQueryData<Audition[]>(AUDITIONS_KEY, (list) =>
        (list ?? []).map((x) => (x.id === id ? ({ ...x, ...patch } as Audition) : x)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(AUDITIONS_KEY, ctx.previous);
    },
    onSuccess: (a) => {
      qc.setQueryData<Audition[]>(AUDITIONS_KEY, (list) => (list ?? []).map((x) => (x.id === a.id ? a : x)));
      void scheduleRemindersFor(a);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: AUDITIONS_KEY }),
  });
}

/** Bring one piece from the book; the one before it, if any, goes back on the shelf. */
export function useAttachPiece() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ current, monologueId }: { current: Audition; monologueId: number | null }) => {
      const had = attachedPiece(current);
      if (had && had.monologue_id === monologueId) return current;
      let a = current;
      if (had) {
        await removeAuditionPiece(current.id, had.id);
        a = { ...a, pieces: a.pieces.filter((p) => p.id !== had.id) };
      }
      if (monologueId != null) a = await addAuditionPiece(current.id, monologueId);
      return a;
    },
    onSuccess: (a) => {
      track('app_audition_piece_attached', { has_piece: Boolean(attachedPiece(a)) });
      qc.setQueryData<Audition[]>(AUDITIONS_KEY, (list) => (list ?? []).map((x) => (x.id === a.id ? a : x)));
      void scheduleRemindersFor(a);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: AUDITIONS_KEY }),
  });
}

/** "Ask for ideas" on the bring list. The row comes back with the model's additions. */
export function useAssistRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => assistRead(id),
    onSuccess: (a) => {
      track('app_audition_assist', { part: 'read' });
      qc.setQueryData<Audition[]>(AUDITIONS_KEY, (list) => (list ?? []).map((x) => (x.id === a.id ? a : x)));
    },
  });
}

/** "Add the callback": a new audition for the same show, no date yet. */
export function useAddCallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => addCallback(id),
    onSuccess: (a) => {
      track('app_audition_callback_added', {});
      qc.setQueryData<Audition[]>(AUDITIONS_KEY, (list) => [a, ...(list ?? []).filter((x) => x.id !== a.id)]);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: AUDITIONS_KEY }),
  });
}

/** The pasted notice, read into a draft. Nothing is saved until the form says so. */
export function useParseNotice() {
  return useMutation({
    mutationFn: ({ text, tz }: { text: string; tz: string }) => parseNotice(text, tz),
    onSuccess: (r) => {
      track('app_audition_parsed', { ok: r.ok, has_date: Boolean(r.draft.starts_at.value || r.draft.due_at.value), quota_hit: false });
    },
    onError: (e) => {
      track('app_audition_parsed', { ok: false, has_date: false, quota_hit: e instanceof ParseQuotaError });
    },
  });
}

/** "How did it go?" on a past audition. The row comes back with its new status. */
export function useLogOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, outcome }: { id: number; outcome: Outcome }) => logOutcome(id, outcome),
    onSuccess: (a, { outcome }) => {
      track('app_audition_outcome', { outcome });
      qc.setQueryData<Audition[]>(AUDITIONS_KEY, (list) => (list ?? []).map((x) => (x.id === a.id ? a : x)));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: AUDITIONS_KEY }),
  });
}

/**
 * Put the board in the phone's calendar. `webcal://` is what makes iOS offer
 * a subscription rather than a one-off download, and a subscription is the
 * point: it keeps itself up to date as the board changes, here or on the site.
 */
export function useCalendarFeed() {
  return useMutation({
    mutationFn: async () => {
      const url = await calendarFeedUrl();
      const webcal = url.replace(/^https?:\/\//, 'webcal://');
      track('app_calendar_feed_opened', {});
      await Linking.openURL(webcal);
    },
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

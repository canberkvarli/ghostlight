import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { addPractice, deletePractice, listPractice, onLocalDay, type PracticeEntry, type PracticeKind } from '../api/practice';
import { listRuns } from '../api/rehearsal';
import { track } from '../lib/analytics';
import type { RecentPiece } from '../lib/recents';
import { streakOf, type Streak } from '../rehearsal/streak';

export const PRACTICE_KEY = ['practice'];

/**
 * Nights in the work, from everything that says an actor worked: a check-in
 * (work away from the app counts), a scene run, a speech opened. The lamp on
 * Search is lit when tonight has one; the number beside it is the run of
 * nights. Missing a night costs nothing but the number.
 */
export function useNights(enabled: boolean, recents: RecentPiece[]): { streak: Streak; entries: PracticeEntry[] } {
  const practice = useQuery({ queryKey: PRACTICE_KEY, queryFn: ({ signal }) => listPractice(signal), enabled, staleTime: 60_000 });
  const runs = useQuery({ queryKey: ['runs'], queryFn: ({ signal }) => listRuns(signal), enabled, staleTime: 60_000 });
  const entries = useMemo(() => practice.data ?? [], [practice.data]);
  const streak = useMemo(
    () => streakOf([
      ...entries.map((e) => onLocalDay(e.day)),
      ...(runs.data ?? []).map((r) => r.started_at),
      ...recents.map((r) => r.openedAt),
    ]),
    [entries, runs.data, recents],
  );
  return { streak, entries };
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, note }: { kind: PracticeKind; note: string | null }) => addPractice(kind, note),
    onSuccess: (made) => {
      qc.setQueryData<PracticeEntry[]>(PRACTICE_KEY, (all) => [made, ...(all ?? [])]);
      track('app_checkin', { kind: made.kind, note: Boolean(made.note) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: PRACTICE_KEY }),
  });
}

export function useUncheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deletePractice(id),
    onMutate: (id) => { qc.setQueryData<PracticeEntry[]>(PRACTICE_KEY, (all) => (all ?? []).filter((e) => e.id !== id)); },
    onSettled: () => qc.invalidateQueries({ queryKey: PRACTICE_KEY }),
  });
}

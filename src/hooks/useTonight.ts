import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { answerMyTonight, getMyTonight, getTonight, getTrending, type MyTonight, type TonightDay } from '../api/client';
import { apiToMonologue } from '../data/adapt';
import type { Monologue } from '../data/monologues';
import { searchScreen } from '../lib/screen';
import { track } from '../lib/analytics';
import { useSession } from '../lib/useSession';
import type { Medium } from '../theme/medium';

/**
 * Tonight's speech: one piece a day per house. For a stranger, the same one
 * for everyone; for an actor with a session, their own (useMyTonight), chosen
 * on the server from what they keep.
 *
 * Picked on the phone from the trending list by the date, so there is nothing
 * to build or schedule on the server, and every phone that fetched the same
 * list lands on the same piece. The list is sorted by id first so the order it
 * arrived in does not matter. Rolls over at local midnight.
 */

export function tonightIndex(count: number, now = new Date()): number {
  const day = Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
  // Knuth's multiplicative hash, so consecutive days do not walk the list in order.
  return (Math.imul(day, 2654435761) >>> 0) % count;
}

export function pickTonight(list: Monologue[], medium: Medium, now = new Date()): Monologue | null {
  const house = list
    .filter((m) => (medium === 'screen' ? m.sourceType !== 'play' : m.sourceType === 'play'))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (house.length === 0) return null;
  return house[tonightIndex(house.length, now)];
}

/**
 * Both shelves wait for a session. The backend wants a user on every list, and
 * on a first launch the curtain mounts while the anonymous session is still
 * being minted: the request went out with no token, came back 401, and with
 * `retry: false` the house stayed dark for ten minutes. Signed-in phones never
 * saw it because their session was already there. So: no session, no request;
 * the query wakes the moment one exists.
 */
function useHasSession(): boolean {
  const { session } = useSession();
  return Boolean(session);
}

/** The same query the trending rows read, so the two never cost two requests. */
export function useTrendingQuery() {
  const ready = useHasSession();
  return useQuery<Monologue[]>({
    queryKey: ['trending'],
    enabled: ready,
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }) => (await getTrending(20, signal)).map(apiToMonologue),
  });
}

export function useTrendingList(): Monologue[] {
  return useTrendingQuery().data ?? [];
}

/**
 * Film & TV has no trending list: the plays' shelf is plays only. Its shelf is
 * the screen search with nothing asked of it, the same rows the results page
 * shows when you open that house without typing, so tonight's speech on
 * screen is the same for everyone too.
 */
export function useScreenShelfQuery() {
  const ready = useHasSession();
  return useQuery<Monologue[]>({
    queryKey: ['screen-shelf'],
    enabled: ready,
    retry: false,
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) => searchScreen({}, 20, signal),
  });
}

export function useScreenShelf(): Monologue[] {
  return useScreenShelfQuery().data ?? [];
}

/** The house's shelf: trending for the plays, the screen search for Film & TV. */
export function useHouseList(medium: Medium): Monologue[] {
  const trending = useTrendingList();
  const screen = useScreenShelf();
  return medium === 'screen' ? screen : trending;
}

/**
 * The shelf with its state, for the one screen that is nothing but the shelf.
 * `settled` is true once the request has answered, either way, so the curtain
 * can tell "still coming" from "nothing came".
 */
export function useHouse(medium: Medium): { list: Monologue[]; settled: boolean; failed: boolean; retry: () => void } {
  const trending = useTrendingQuery();
  const screen = useScreenShelfQuery();
  const q = medium === 'screen' ? screen : trending;
  return {
    list: q.data ?? [],
    settled: q.isSuccess || q.isError,
    failed: q.isError,
    retry: () => void q.refetch(),
  };
}

/** The local calendar date the way the server keys its run: `YYYY-MM-DD`. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The server's run of tonights for a house. Public, so it does not wait for a
 * session, and kept for the day: the server's answer does not change until
 * midnight either.
 */
export function useTonightRun(medium: Medium): TonightDay[] {
  const house = medium === 'screen' ? 'screen' : 'stage';
  const { data } = useQuery<TonightDay[]>({
    queryKey: ['tonight', house],
    retry: 1,
    staleTime: 60 * 60_000,
    queryFn: ({ signal }) => getTonight(house, 8, signal),
  });
  return data ?? [];
}

/** The piece the run names for a day, or null if the run does not reach it. */
export function runPick(run: TonightDay[], day: Date): Monologue | null {
  const key = dayKey(day);
  const hit = run.find((d) => d.day === key);
  return hit ? apiToMonologue(hit.monologue) : null;
}

/**
 * This actor's own tonight, for a signed-in phone: chosen on the server from
 * what they keep, whole, and never a read spent. Keyed on the date too, so the
 * card turns over at midnight with the app open.
 */
export function useMyTonight(medium: Medium) {
  const house = medium === 'screen' ? 'screen' : 'stage';
  const { session, isAuthenticated } = useSession();
  return useQuery<MyTonight | null>({
    queryKey: ['my-tonight', house, dayKey(new Date())],
    enabled: Boolean(session) && isAuthenticated,
    retry: 1,
    staleTime: 30 * 60_000,
    queryFn: ({ signal }) => getMyTonight(house, signal),
  });
}

/** Keep or Not for me, painted at once and sent after. */
export function useAnswerTonight(medium: Medium) {
  const house = medium === 'screen' ? 'screen' : 'stage';
  const qc = useQueryClient();
  const key = ['my-tonight', house, dayKey(new Date())];
  return useMutation({
    mutationFn: (answer: 'keep' | 'pass') => answerMyTonight(house, answer),
    onMutate: (answer) => {
      qc.setQueryData<MyTonight | null>(key, (t) => (t ? { ...t, answer } : t));
      track('app_tonight_answer', { answer });
    },
  });
}

/**
 * Tonight's speech: the actor's own when the server has chosen one, then the
 * house's from the server, then the phone's own from the shelf. The last two
 * use the same hash of the date, so on the same pool they agree; the server's
 * house pool is the one the widget shows.
 */
export function useTonight(medium: Medium): Monologue | null {
  const run = useTonightRun(medium);
  const list = useHouseList(medium);
  const mine = useMyTonight(medium).data;
  return (mine ? apiToMonologue(mine.monologue) : null) ?? runPick(run, new Date()) ?? pickTonight(list, medium);
}
